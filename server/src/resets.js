import { createHash, randomInt } from 'node:crypto'
import { db } from './db.js'
import { log } from './log.js'

/**
 * Password reset codes.
 *
 * A six-digit code is small enough to be guessed if nothing stops the guessing,
 * so three things do: it dies after ten minutes, it dies after five wrong
 * tries, and a new one cannot be asked for more than once a minute. Stored as a
 * digest for the same reason session tokens are — a readable database should
 * not be a list of ways in.
 *
 * `randomInt` rather than `Math.random()`: this is a credential, and the
 * difference between a CSPRNG and a PRNG here is the difference between a code
 * that cannot be predicted and one that can.
 */

const LIFETIME_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const RESEND_GAP_MS = 60_000

db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    user_id    TEXT PRIMARY KEY,
    code       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0
  );
`)

const hash = (code) => createHash('sha256').update(String(code)).digest('hex')

/**
 * Replaces any code this account already had — asking again should invalidate
 * the previous one rather than leave two working.
 *
 * @returns the code, or null when one was asked for a moment ago.
 */
export function createResetCode(userId, now = Date.now()) {
  const existing = db.prepare('SELECT created_at FROM password_resets WHERE user_id = ?').get(userId)
  if (existing && now - existing.created_at < RESEND_GAP_MS) return null

  // Six digits, leading zeros kept: 000123 is as good a code as any, and
  // dropping it would quietly shrink the space.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  db.prepare(
    'INSERT INTO password_resets (user_id, code, created_at, expires_at, attempts) ' +
    'VALUES (?, ?, ?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET ' +
    'code = excluded.code, created_at = excluded.created_at, ' +
    'expires_at = excluded.expires_at, attempts = 0',
  ).run(userId, hash(code), now, now + LIFETIME_MS)
  return code
}

/**
 * Spends a code. Single use whatever the outcome of the password change that
 * follows: a code that could be replayed is a code worth stealing.
 *
 * @returns true only when it was right, live, and had tries left.
 */
export function useResetCode(userId, code, now = Date.now()) {
  const row = db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(userId)
  if (!row) return false

  if (row.expires_at < now || row.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId)
    return false
  }

  if (row.code !== hash(String(code ?? '').trim())) {
    // Counted before anything else can go wrong, so a wrong guess always costs
    // one of the five.
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?').run(userId)
    return false
  }

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId)
  return true
}

export function clearResetCodes(userId) {
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId)
}

// Housekeeping on boot, the same as sessions and pay links.
{
  const { changes } = db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(Date.now())
  if (changes) log.info('resets', `cleared ${changes} expired reset code(s)`)
}

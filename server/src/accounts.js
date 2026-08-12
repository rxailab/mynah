import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db } from './db.js'
import { log } from './log.js'

/**
 * Accounts, passwords and sessions.
 *
 * No dependency for any of it: Node ships scrypt, which is the right primitive
 * here — deliberately slow and memory-hard, so a stolen database is expensive
 * to attack offline. Sessions are rows rather than signed stateless tokens so
 * that signing out actually revokes something.
 */

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64
const SESSION_DAYS = 90

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE,
    phone         TEXT UNIQUE,
    google_sub    TEXT UNIQUE,
    password_hash TEXT,
    name          TEXT NOT NULL DEFAULT '',
    owner_phone   TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
`)

/**
 * Columns added after the first release. They cannot go in the CREATE above:
 * an existing data/calls.db already has the table, so IF NOT EXISTS skips the
 * whole statement and the new columns would never appear. SQLite has no
 * "ADD COLUMN IF NOT EXISTS", so the second boot throws and we ignore it.
 */
for (const column of [
  'verified_caller_id TEXT',
  'caller_id_sid TEXT',
  // A verification Twilio is part-way through. The code is worth keeping
  // because Twilio hands it over exactly once, when the request is made: lose
  // it and the only way back is a second call to a phone that is already
  // ringing with the first.
  'caller_id_pending_code TEXT',
  'caller_id_pending_sid TEXT',
  'caller_id_pending_at INTEGER',
]) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${column}`)
  } catch {
    // Already there.
  }
}

// --- passwords -------------------------------------------------------------

/** `scrypt$N$salt$key`, so the cost can be raised later without breaking old rows. */
async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${KEY_LENGTH}$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, length, salt, key] = String(stored ?? '').split('$')
    if (scheme !== 'scrypt') return false
    const expected = Buffer.from(key, 'base64')
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(length))
    // Length check first: timingSafeEqual throws on a mismatch rather than
    // returning false, and the length is not a secret.
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// --- users -----------------------------------------------------------------

const rowToUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    phone: row.phone,
    name: row.name,
    ownerPhone: row.owner_phone,
    // Their own number, once Twilio has confirmed they control the line. Empty
    // until then, and empty is what stops this account placing calls at all.
    verifiedCallerId: row.verified_caller_id || '',
    callerIdSid: row.caller_id_sid || '',
    // Null unless a verification call is out there somewhere.
    callerIdAttempt: row.caller_id_pending_code
      ? {
          code: row.caller_id_pending_code,
          callSid: row.caller_id_pending_sid || '',
          at: row.caller_id_pending_at || 0,
        }
      : null,
    createdAt: row.created_at,
    hasPassword: Boolean(row.password_hash),
  }

const byEmail = db.prepare('SELECT * FROM users WHERE email = ?')
const byPhone = db.prepare('SELECT * FROM users WHERE phone = ?')
const byGoogle = db.prepare('SELECT * FROM users WHERE google_sub = ?')
const byId = db.prepare('SELECT * FROM users WHERE id = ?')

export const getUser = (id) => rowToUser(byId.get(id))
export const countUsers = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n
export const listUsers = () =>
  db.prepare('SELECT * FROM users ORDER BY created_at').all().map(rowToUser)

const insertUser = db.prepare(
  'INSERT INTO users (id, email, phone, google_sub, password_hash, name, owner_phone, created_at) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
)

const normaliseEmail = (s) => String(s ?? '').trim().toLowerCase()

/** @returns {Promise<{ok: true, user: object} | {ok: false, error: string}>} */
export async function registerWithEmail(email, password, name = '') {
  const address = normaliseEmail(email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, error: 'That does not look like an email address.' }
  }
  if (String(password ?? '').length < 8) {
    return { ok: false, error: 'Use at least 8 characters for the password.' }
  }
  if (byEmail.get(address)) {
    return { ok: false, error: 'There is already an account with that email. Sign in instead.' }
  }

  const user = {
    id: randomUUID(),
    email: address,
    name: String(name ?? '').trim(),
    createdAt: Date.now(),
  }
  insertUser.run(
    user.id, address, null, null, await hashPassword(password), user.name, '', user.createdAt,
  )
  log.info('accounts', `registered ${address}`)
  return { ok: true, user: getUser(user.id) }
}

export const userByEmail = (email) => rowToUser(byEmail.get(normaliseEmail(email)))

/**
 * Sets a password, checking the current one first when there is one to check.
 *
 * An account made through Google or a phone number has no password at all, and
 * for those this sets a first one rather than changing anything — worth
 * allowing, because the alternative is an account that can only ever be reached
 * one way.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const row = byId.get(userId)
  if (!row) return { ok: false, error: 'No such account.' }
  if (row.password_hash && !(await verifyPassword(currentPassword, row.password_hash))) {
    return { ok: false, error: 'That is not your current password.' }
  }
  return setPassword(userId, newPassword)
}

/** No current-password check. Only for a reset that has already proved itself. */
export async function setPassword(userId, password) {
  if (String(password ?? '').length < 8) {
    return { ok: false, error: 'Use at least 8 characters for the password.' }
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(await hashPassword(password), userId)
  log.info('accounts', `password changed for ${userId}`)
  return { ok: true, user: getUser(userId) }
}

/**
 * Deliberately gives one message for both "no such account" and "wrong
 * password": telling them apart is a way to find out which addresses exist.
 */
export async function loginWithEmail(email, password) {
  const row = byEmail.get(normaliseEmail(email))
  const ok = row && (await verifyPassword(password, row.password_hash))
  if (!ok) return { ok: false, error: 'That email and password do not match an account.' }
  return { ok: true, user: rowToUser(row) }
}

/** Finds or creates the account for a verified phone number. */
export function upsertPhoneUser(phone) {
  const existing = byPhone.get(phone)
  if (existing) return rowToUser(existing)
  const id = randomUUID()
  insertUser.run(id, null, phone, null, null, '', phone, Date.now())
  log.info('accounts', `registered ${phone}`)
  return getUser(id)
}

/** Finds or creates the account for a verified Google identity. */
export function upsertGoogleUser({ sub, email, name }) {
  const existing = byGoogle.get(sub)
  if (existing) return rowToUser(existing)

  // Same person signing in a second way: attach rather than duplicate.
  const address = normaliseEmail(email)
  const sameEmail = address ? byEmail.get(address) : null
  if (sameEmail) {
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, sameEmail.id)
    return getUser(sameEmail.id)
  }

  const id = randomUUID()
  insertUser.run(id, address || null, null, sub, null, String(name ?? '').trim(), '', Date.now())
  log.info('accounts', `registered ${address || sub} via Google`)
  return getUser(id)
}

/**
 * The name the assistant introduces, and the number a hand-over rings.
 *
 * Changing the number drops any verified caller ID with it. A verification
 * belongs to the number that was verified, not to the account — leaving it in
 * place would have the next call present a number this person no longer uses,
 * and numbers get recycled to other people.
 */
export function saveUserProfile(userId, { name, ownerPhone }) {
  const before = getUser(userId)
  const phone = String(ownerPhone ?? '').trim()
  const keepCallerId = Boolean(before?.verifiedCallerId) && before.ownerPhone === phone

  const samePhone = before?.ownerPhone === phone
  db.prepare(
    'UPDATE users SET name = ?, owner_phone = ?, verified_caller_id = ?, caller_id_sid = ?, ' +
    'caller_id_pending_code = ?, caller_id_pending_sid = ?, caller_id_pending_at = ? WHERE id = ?',
  ).run(
    String(name ?? '').trim(),
    phone,
    keepCallerId ? before.verifiedCallerId : null,
    keepCallerId ? before.callerIdSid : null,
    // A verification in flight is for the old number too, and its code will be
    // keyed into a call about a number that is no longer on the profile.
    samePhone ? (before?.callerIdAttempt?.code ?? null) : null,
    samePhone ? (before?.callerIdAttempt?.callSid ?? null) : null,
    samePhone ? (before?.callerIdAttempt?.at ?? null) : null,
    userId,
  )

  if (before?.verifiedCallerId && !keepCallerId) {
    log.info('accounts', `dropped the verified caller ID for ${userId}; the number changed`)
  }
  return getUser(userId)
}

/** Remembers a verification Twilio has just been asked for. */
export function saveCallerIdAttempt(userId, { code, callSid }) {
  db.prepare(
    'UPDATE users SET caller_id_pending_code = ?, caller_id_pending_sid = ?, ' +
    'caller_id_pending_at = ? WHERE id = ?',
  ).run(String(code ?? ''), String(callSid ?? ''), Date.now(), userId)
  return getUser(userId)
}

export function clearCallerIdAttempt(userId) {
  db.prepare(
    'UPDATE users SET caller_id_pending_code = NULL, caller_id_pending_sid = NULL, ' +
    'caller_id_pending_at = NULL WHERE id = ?',
  ).run(userId)
  return getUser(userId)
}

/**
 * Records a caller ID Twilio has confirmed. Never call this on a webhook alone.
 * Clears the attempt with it: it succeeded, so there is nothing left in flight.
 */
export function saveVerifiedCallerId(userId, { phone, sid }) {
  db.prepare(
    'UPDATE users SET verified_caller_id = ?, caller_id_sid = ?, caller_id_pending_code = NULL, ' +
    'caller_id_pending_sid = NULL, caller_id_pending_at = NULL WHERE id = ?',
  ).run(String(phone ?? '').trim(), String(sid ?? '').trim(), userId)
  log.info('accounts', `caller ID verified for ${userId}`)
  return getUser(userId)
}

export function clearVerifiedCallerId(userId) {
  db.prepare(
    'UPDATE users SET verified_caller_id = NULL, caller_id_sid = NULL, ' +
    'caller_id_pending_code = NULL, caller_id_pending_sid = NULL, ' +
    'caller_id_pending_at = NULL WHERE id = ?',
  ).run(userId)
  return getUser(userId)
}

// --- sessions --------------------------------------------------------------

/**
 * What the `token` column actually holds: the SHA-256 of the token, never the
 * token. A session token is a bearer credential — anyone holding one is signed
 * in — so storing them as they are would mean a readable database is a set of
 * working logins, while the passwords sitting in the next table over are safely
 * hashed. This closes that asymmetry: a stolen database yields digests, and a
 * digest cannot be presented to /api.
 *
 * Plain SHA-256 rather than scrypt, deliberately. The passwords above need a
 * slow, memory-hard hash because people choose guessable ones and the attack is
 * a dictionary. A token is 256 bits straight from the CSPRNG, so there is no
 * dictionary and nothing to slow down — all a KDF would buy here is latency on
 * every single authenticated request, including every WebSocket connect.
 */
const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex')

/** A stored value that is not 64 hex characters predates the hashing. */
const HASHED = /^[0-9a-f]{64}$/

const insertSession = db.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
)

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  insertSession.run(tokenHash(token), userId, now, now + SESSION_DAYS * 86400_000)
  // The only time the token itself exists anywhere but the client's storage.
  return token
}

/** @returns the user this token belongs to, or null. Expired rows are cleaned up. */
export function userForSession(token) {
  if (!token) return null
  const hash = tokenHash(token)
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(hash)
  if (!row) return null
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(hash)
    return null
  }
  return getUser(row.user_id)
}

export function endSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token))
}

/**
 * Signs every device out. A changed password has to mean this, or it does not
 * do the one job people change a password for — getting whoever else is in
 * back out again.
 *
 * @param keepToken the session doing the changing, so the person is not thrown
 *   out of the app they are holding. Omitted after a reset, where there is no
 *   session to keep and everything should go.
 */
export function endAllSessions(userId, keepToken = null) {
  const { changes } = keepToken
    ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
      .run(userId, tokenHash(keepToken))
    : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  if (changes) log.info('accounts', `signed ${changes} other session(s) out for ${userId}`)
  return changes
}

/**
 * Removes the account itself and every session it has open. The caller deletes
 * the account's calls first — this leaves nothing behind that could be signed
 * back into or matched to a person.
 */
export function deleteUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  const { changes } = db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  if (changes) log.info('accounts', `deleted account ${userId}`)
  return changes > 0
}

// Housekeeping on boot; a personal deployment never accumulates enough for this
// to be worth a scheduler.
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())

/**
 * One-time migration of sessions written before the column held a digest.
 *
 * Those rows hold the token itself, which is exactly what is needed to hash
 * them in place — so nobody is signed out by a change they cannot see. It also
 * means the plaintext is gone from the file on the very next boot rather than
 * lingering until each session expires, which is the point of the exercise.
 *
 * Exported so it can be tested; called below, after the expiry sweep, so it
 * never bothers with rows about to be deleted.
 *
 * @returns how many rows were rewritten.
 */
export function hashLegacySessions() {
  const legacy = db
    .prepare('SELECT token FROM sessions')
    .all()
    .filter((row) => !HASHED.test(row.token))
  if (!legacy.length) return 0

  const rewrite = db.prepare('UPDATE sessions SET token = ? WHERE token = ?')
  let done = 0
  for (const { token } of legacy) {
    try {
      rewrite.run(tokenHash(token), token)
      done++
    } catch (err) {
      // Nothing here is worth failing a boot over; the cost is one sign-in.
      log.warn('accounts', `could not hash a stored session: ${err.message}`)
    }
  }
  log.info('accounts', `hashed ${done} stored session token(s)`)
  return done
}

hashLegacySessions()

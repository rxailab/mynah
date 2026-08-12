import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db.js'
import { log } from '../log.js'

/**
 * A short-lived link that can top one account up, and do nothing else.
 *
 * The app cannot take a card, so buying happens in a browser — which means
 * something in a URL has to say which account is being credited. The session
 * token would do it and is exactly the wrong thing to use: it is a 90-day
 * bearer credential for the whole account, and a URL gets pasted into chats,
 * kept in browser history and logged by every proxy on the way. So this is its
 * own credential, good for thirty minutes and for one thing.
 *
 * Being sendable is a feature rather than a leak to be tolerated. The people
 * this app is for often have family paying for them — a parent in another
 * country, who has WeChat Pay and no UK card — and forwarding the link is how
 * that happens. That is also why it must carry no personal data: whoever opens
 * it sees a masked handle and a price list, and nothing else about the account.
 *
 * Hashed at rest for the same reason sessions are: a readable database should
 * not be a stack of working links.
 */

const MINUTES = 30

db.exec(`
  CREATE TABLE IF NOT EXISTS pay_links (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pay_links_user ON pay_links (user_id);
`)

const hash = (token) => createHash('sha256').update(String(token)).digest('hex')

/** @returns the token itself — the only time it exists outside the browser. */
export function createPayLink(userId, now = Date.now()) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO pay_links (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), userId, now, now + MINUTES * 60_000)
  return token
}

/** @returns the user id this link tops up, or null if it is unknown or stale. */
export function userForPayLink(token, now = Date.now()) {
  if (!token) return null
  const digest = hash(token)
  const row = db.prepare('SELECT * FROM pay_links WHERE token = ?').get(digest)
  if (!row) return null
  if (row.expires_at < now) {
    db.prepare('DELETE FROM pay_links WHERE token = ?').run(digest)
    return null
  }
  return row.user_id
}

export function deletePayLinksFor(userId) {
  const { changes } = db.prepare('DELETE FROM pay_links WHERE user_id = ?').run(userId)
  if (changes) log.info('billing', `deleted ${changes} pay link(s) belonging to ${userId}`)
  return changes
}

/** Housekeeping on boot, the same as sessions. */
db.prepare('DELETE FROM pay_links WHERE expires_at < ?').run(Date.now())

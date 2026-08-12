import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { db } from '../db.js'
import { log } from '../log.js'

/**
 * Calls are paid for in credits: one credit is one call that actually went out.
 * A call nobody answered goes back on the account — see refundCredit and the
 * status webhook — so the promise the app makes is simple: you pay for
 * conversations, not for ringing.
 *
 * A ledger of grants rather than a counter on the user row, for the same reason
 * the usage screen itemises cost per call: every number shown to a paying
 * customer should be the sum of visible facts. Each row says where calls came
 * from — the sign-up trial, a purchased pack, a manual adjustment — and how
 * many of them have been spent.
 *
 * Purchases carry the Play order id, and the column is UNIQUE: delivering the
 * same purchase twice — an app retry, a replayed request — must credit once.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS credit_grants (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    calls      INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    note       TEXT NOT NULL DEFAULT '',
    order_id   TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS credit_grants_user ON credit_grants (user_id);
`)

/**
 * The sign-up allowance. Written the first time this account's balance matters
 * rather than at registration: registration has three separate doors — email,
 * phone, Google — and a grant that must exist exactly once should not depend on
 * remembering every one of them. One-time rather than monthly, deliberately: a
 * recurring free allowance is a standing invitation to farm accounts, and the
 * caller-ID hurdle only raises the price of that, not the possibility.
 */
export function ensureTrialGrant(userId) {
  if (!userId || config.trialCalls <= 0) return
  const existing = db
    .prepare("SELECT id FROM credit_grants WHERE user_id = ? AND kind = 'trial'")
    .get(userId)
  if (existing) return
  db.prepare(
    'INSERT INTO credit_grants (id, user_id, kind, calls, used, note, created_at) ' +
    "VALUES (?, ?, 'trial', ?, 0, 'welcome calls', ?)",
  ).run(randomUUID(), userId, config.trialCalls, Date.now())
  log.info('credits', `trial of ${config.trialCalls} call(s) granted to ${userId}`)
}

/**
 * Puts calls on an account. `orderId` is the idempotency key for purchases:
 * when it has been seen before the existing grant is handed back and nothing
 * is written, so a client that retries delivery cannot be credited twice.
 *
 * @returns {{granted: boolean, grantId: string}}
 */
export function grantCredits(userId, { kind, calls, note = '', orderId = null, expiresAt = null }) {
  if (orderId) {
    const existing = db.prepare('SELECT id FROM credit_grants WHERE order_id = ?').get(orderId)
    if (existing) return { granted: false, grantId: existing.id }
  }
  const id = randomUUID()
  db.prepare(
    'INSERT INTO credit_grants (id, user_id, kind, calls, used, note, order_id, created_at, expires_at) ' +
    'VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
  ).run(id, userId, kind, calls, note, orderId, Date.now(), expiresAt)
  log.info(
    'credits',
    `${calls} call(s) granted to ${userId} (${kind}${orderId ? `, order ${orderId}` : ''})`,
  )
  return { granted: true, grantId: id }
}

/** Calls this account can still place. Expired grants simply stop counting. */
export function balanceOf(userId, now = Date.now()) {
  ensureTrialGrant(userId)
  const row = db.prepare(
    'SELECT COALESCE(SUM(calls - used), 0) AS n FROM credit_grants ' +
    'WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)',
  ).get(userId, now)
  return row.n
}

/**
 * Takes one credit, or says there are none. Soonest-to-expire first, so a pack
 * that never expires is not eaten while an expiring grant quietly lapses; the
 * COALESCE pushes never-expiring grants to the back of the queue.
 *
 * @returns the grant id the call should carry — refunds go back where the
 *   credit came from — or null when the account is empty.
 */
export function spendCredit(userId, now = Date.now()) {
  ensureTrialGrant(userId)
  const grant = db.prepare(
    'SELECT id FROM credit_grants WHERE user_id = ? AND used < calls ' +
    'AND (expires_at IS NULL OR expires_at > ?) ' +
    'ORDER BY COALESCE(expires_at, 9e15), created_at LIMIT 1',
  ).get(userId, now)
  if (!grant) return null
  db.prepare('UPDATE credit_grants SET used = used + 1 WHERE id = ?').run(grant.id)
  return grant.id
}

/**
 * Puts one credit back on the grant it came from — a call that never connected
 * is not a call. The `used > 0` guard means a stray double refund can never
 * mint credit; callers still mark the call refunded (see the status webhook) so
 * the same call cannot come this way twice.
 */
export function refundCredit(grantId) {
  if (!grantId) return false
  const { changes } = db
    .prepare('UPDATE credit_grants SET used = used - 1 WHERE id = ? AND used > 0')
    .run(grantId)
  return changes > 0
}

/** Account deletion takes the ledger with it — Play requires deletion to delete. */
export function deleteGrantsFor(userId) {
  const { changes } = db.prepare('DELETE FROM credit_grants WHERE user_id = ?').run(userId)
  if (changes) log.info('credits', `deleted ${changes} grant(s) belonging to ${userId}`)
  return changes
}

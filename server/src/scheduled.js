import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import { log } from './log.js'

/**
 * Calls set to happen later.
 *
 * The important decision here is what "later" does. A scheduled task does not
 * dial: when its time comes it is marked ready and the app shows it waiting,
 * and the person still walks through the same check step as any other call.
 *
 * That is the design's own promise — "到点后照常走核对一步" — and it is also the
 * only version of this feature that is safe to build. An assistant that rings
 * strangers on a timer, unattended, with a brief written days ago and nobody
 * watching the transcript, is a different and much worse product than the one
 * every other screen in this app describes.
 *
 * **A task runs once.** Repeats used to be offered and are not any more. A
 * standing rule that rings the same stranger every morning is a robocall with
 * a friendlier name, whatever the person setting it up intended: the number on
 * the other end did not agree to it, cannot see that it is scheduled, and has
 * nobody to ask to stop. The terms this service publishes forbid exactly that,
 * so the feature that made it easy is gone rather than merely discouraged.
 *
 * Rows written before the change keep their repeat_days, and are retired after
 * they fire rather than rolled forward — see dismissReady. Nothing new can set
 * the column: createScheduled ignores it and the API refuses it outright.
 */

db.exec(`CREATE TABLE IF NOT EXISTS scheduled_calls (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  goal          TEXT NOT NULL,
  phone_number  TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  template      TEXT NOT NULL DEFAULT 'custom',
  language      TEXT NOT NULL DEFAULT 'en',
  run_at        INTEGER NOT NULL,
  repeat_days   INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  ready_at      INTEGER,
  created_at    INTEGER NOT NULL
)`)
db.exec('CREATE INDEX IF NOT EXISTS scheduled_user ON scheduled_calls (user_id)')

const rowToTask = (row) =>
  row && {
    id: row.id,
    goal: row.goal,
    phoneNumber: row.phone_number,
    businessName: row.business_name,
    template: row.template,
    language: row.language,
    runAt: row.run_at,
    /** 0 = once. Otherwise the gap in days between runs. */
    repeatDays: row.repeat_days,
    enabled: Boolean(row.enabled),
    /** Set when its time came and it is waiting to be confirmed. */
    readyAt: row.ready_at ?? null,
    createdAt: row.created_at,
  }

export const listScheduled = (userId) =>
  db.prepare('SELECT * FROM scheduled_calls WHERE user_id = ? ORDER BY run_at').all(userId).map(rowToTask)

export const getScheduled = (id) =>
  rowToTask(db.prepare('SELECT * FROM scheduled_calls WHERE id = ?').get(id))

export function createScheduled(userId, task) {
  const id = randomUUID()
  db.prepare(
    'INSERT INTO scheduled_calls (id, user_id, goal, phone_number, business_name, template, ' +
    'language, run_at, repeat_days, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)',
  ).run(
    id, userId, task.goal, task.phoneNumber ?? '', task.businessName ?? '',
    task.template ?? 'custom', task.language ?? 'en', task.runAt, Date.now(),
  )
  log.info('scheduled', `task ${id} set for ${new Date(task.runAt).toISOString()}`)
  return getScheduled(id)
}

/**
 * A live task this account already has for the same number.
 *
 * Two tasks pointed at one number is how a repeat gets rebuilt by hand out of
 * parts that are each allowed — set five, and the number is rung five times
 * without anybody having asked for a repeat. One pending call per number per
 * account is the rule; the existing one can be moved or dropped.
 *
 * Scoped to the account rather than the whole service on purpose: two different
 * people calling the same restaurant is a busy restaurant, not an attack.
 *
 * @returns the clashing task, or null.
 */
export function pendingForNumber(userId, phoneNumber, exceptId = null) {
  const number = String(phoneNumber ?? '').trim()
  if (!number) return null
  const row = db.prepare(
    'SELECT * FROM scheduled_calls WHERE user_id = ? AND phone_number = ? AND enabled = 1 ' +
    'AND id IS NOT ? LIMIT 1',
  ).get(userId, number, exceptId)
  return rowToTask(row) ?? null
}

/** Pausing keeps the row: a paused task is a decision, not a deletion. */
export function setScheduledEnabled(id, enabled) {
  db.prepare('UPDATE scheduled_calls SET enabled = ?, ready_at = NULL WHERE id = ?')
    .run(enabled ? 1 : 0, id)
  return getScheduled(id)
}

export function deleteScheduled(id) {
  return db.prepare('DELETE FROM scheduled_calls WHERE id = ?').run(id).changes > 0
}

export function deleteScheduledFor(userId) {
  return db.prepare('DELETE FROM scheduled_calls WHERE user_id = ?').run(userId).changes
}

/**
 * Cleared once the person has acted on it, one way or the other. A task is done
 * when it has been dealt with, whatever repeat_days says — a row written before
 * repeats were removed retires here rather than rolling forward into another
 * unasked-for call.
 */
export function dismissReady(id) {
  const task = getScheduled(id)
  if (!task) return null
  db.prepare('UPDATE scheduled_calls SET enabled = 0, ready_at = NULL WHERE id = ?').run(id)
  return getScheduled(id)
}

/**
 * Marks everything whose time has come. Returns what it just marked, so the
 * caller can decide whether anyone needs telling.
 */
export function markDue(now = Date.now()) {
  const due = db
    .prepare('SELECT * FROM scheduled_calls WHERE enabled = 1 AND ready_at IS NULL AND run_at <= ?')
    .all(now)
    .map(rowToTask)
  const mark = db.prepare('UPDATE scheduled_calls SET ready_at = ? WHERE id = ?')
  for (const task of due) mark.run(now, task.id)
  return due
}

/**
 * The clock. A minute is plenty: nothing here dials, so being a minute late to
 * put a card on a screen costs nobody anything, and it keeps a personal
 * deployment from waking up every second for years to find nothing to do.
 */
export function startScheduler(intervalMs = 60_000) {
  const tick = () => {
    try {
      const due = markDue()
      if (due.length) log.info('scheduled', `${due.length} task(s) ready to confirm`)
    } catch (err) {
      log.error('scheduled', 'could not check for due tasks', err.message)
    }
  }
  // unref() so a test process that booted the server can still exit cleanly.
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick()
  return timer
}

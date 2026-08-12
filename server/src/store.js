import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { db, DB_FILE } from './db.js'
import { log } from './log.js'

/**
 * The Map stays the hot path — every read and every code path below is
 * unchanged. SQLite mirrors it so history survives a restart: each mutation
 * upserts the whole call as one JSON row, which at a personal call volume
 * costs nothing and keeps the schema from ever fighting the code.
 */
const calls = new Map()
export const bus = new EventEmitter()
bus.setMaxListeners(0)

export const CallStatus = {
  QUEUED: 'queued',
  DIALING: 'dialing',
  IN_PROGRESS: 'in_progress',
  TRANSFERRING: 'transferring',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

/** The statuses that mean the call is still on the line. */
const LIVE_STATUSES = new Set([
  CallStatus.QUEUED, CallStatus.DIALING, CallStatus.IN_PROGRESS, CallStatus.TRANSFERRING,
])

db.exec(`CREATE TABLE IF NOT EXISTS calls (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  data       TEXT NOT NULL
)`)
// Calls predate accounts, so the column is added rather than declared. Existing
// rows keep a NULL owner and are claimed by the first account to sign in.
try { db.exec('ALTER TABLE calls ADD COLUMN user_id TEXT') } catch { /* already there */ }

const upsert = db.prepare(
  'INSERT INTO calls (id, created_at, data, user_id) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET data = excluded.data, user_id = excluded.user_id',
)

function persist(call) {
  try {
    upsert.run(call.id, call.createdAt, JSON.stringify(call), call.userId ?? null)
  } catch (err) {
    // Losing one write is a shame; killing a live call over it would be worse.
    log.warn('store', `could not persist call ${call.id}: ${err.message}`)
  }
}

/**
 * History from before accounts existed has no owner. The first account to sign
 * in inherits it — on a personal deployment that is the same person, and the
 * alternative is silently hiding calls they made.
 */
export function claimOrphanCalls(userId) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM calls WHERE user_id IS NULL').get()
  if (!n) return 0
  db.prepare('UPDATE calls SET user_id = ? WHERE user_id IS NULL').run(userId)
  for (const call of calls.values()) if (!call.userId) call.userId = userId
  log.info('store', `${n} call(s) from before sign-in are now owned by ${userId}`)
  return n
}

// Boot: load recent history back into the Map. A call that was live when the
// process died is not live now, whatever the row says.
{
  let repaired = 0
  for (const row of db.prepare('SELECT data, user_id FROM calls ORDER BY created_at DESC LIMIT 500').all()) {
    try {
      const call = JSON.parse(row.data)
      call.userId = row.user_id ?? call.userId ?? null
      if (LIVE_STATUSES.has(call.status)) {
        call.status = call.outcome ? CallStatus.COMPLETED : CallStatus.FAILED
        call.error = call.error || 'The server restarted while this call was running.'
        call.endedAt = call.endedAt || Date.now()
        // Died mid-queue: bank the wait now, or it counts the downtime too.
        closeHoldIfOver(call)
        persist(call)
        repaired++
      }
      calls.set(call.id, call)
    } catch {
      // One corrupt row must not stop the rest of history loading.
    }
  }
  if (calls.size) {
    log.info('store', `loaded ${calls.size} call(s) from ${DB_FILE}${repaired ? `, ${repaired} repaired` : ''}`)
  }
}

export function createCall({
  goal, phoneNumber, businessName, template, constraints, language, userId, acceptCallback,
  creditGrantId,
}) {
  const call = {
    id: randomUUID(),
    userId: userId ?? null,
    // Which credit grant paid for this call, so a call that never connects can
    // hand the credit back to where it came from. creditRefunded says that has
    // already happened — webhooks get retried, and a retry must not refund
    // twice. Neither field is the app's business; summarize() leaves them out.
    creditGrantId: creditGrantId ?? null,
    creditRefunded: false,
    twilioSid: null,
    phoneNumber,
    businessName: businessName || phoneNumber,
    template: template || 'custom',
    goal,
    constraints: constraints || [],
    // What the assistant speaks on the line — matches the callee, not the app.
    language: language === 'zh' ? 'zh' : 'en',
    // Whether to accept a "we'll ring you back" offer instead of queueing.
    // Decided before dialling rather than mid-call: the offer comes with a
    // three-second keypress window, which is far too short to ask anybody.
    acceptCallback: Boolean(acceptCallback),
    // Filled in by the cost poller once Twilio rates the completed call.
    cost: null,
    // Time spent queueing rather than talking. holdingSince is the stretch
    // currently running; holdSeconds is everything banked before it.
    holdingSince: null,
    holdSeconds: 0,
    status: CallStatus.QUEUED,
    transcript: [],
    // Ordered checklist of what this call has to get through. The assistant
    // fills it in and ticks it off as the call proceeds; the app shows it as a
    // progress axis so you can see how far along a call is at a glance.
    steps: [],
    results: {},
    outcome: null,
    summary: null,
    error: null,
    createdAt: Date.now(),
    endedAt: null,
  }
  calls.set(call.id, call)
  persist(call)
  emit(call, 'created')
  return call
}

/**
 * Erases every call one account placed, transcripts included. Used by account
 * deletion, which Google Play requires to actually delete rather than just
 * detach — so this drops the rows instead of nulling the owner, and clears the
 * in-memory copies too, or a live process would keep serving them.
 *
 * @returns how many calls went.
 */
export function deleteCallsFor(userId) {
  const { changes } = db.prepare('DELETE FROM calls WHERE user_id = ?').run(userId)
  for (const [id, call] of calls) if (call.userId === userId) calls.delete(id)
  log.info('store', `deleted ${changes} call(s) belonging to ${userId}`)
  return changes
}

/**
 * Forgets one call, transcript and all. Dropped from the table rather than
 * flagged: a record somebody asked to delete is not one to keep a copy of, and
 * the in-memory map goes with it or a live process would carry on serving it.
 *
 * Refuses while the call is still on the line — deleting the record of a
 * conversation that is still happening would leave the relay writing to a call
 * that no longer exists. Hang up first.
 *
 * @returns true when a call went, false when the call is live.
 */
export function deleteCall(id) {
  const call = calls.get(id)
  if (!call) return true
  if (LIVE_STATUSES.has(call.status)) return false
  calls.delete(id)
  try {
    db.prepare('DELETE FROM calls WHERE id = ?').run(id)
  } catch (err) {
    // The row outliving the memory copy is recoverable; throwing here is not.
    log.warn('store', `could not delete call ${id}: ${err.message}`)
  }
  log.info('store', `deleted call ${id}`)
  return true
}

export const getCall = (id) => calls.get(id)

export const listCalls = (userId) =>
  [...calls.values()]
    .filter((c) => !userId || c.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(summarize)

/** Calls this user placed since the start of the current calendar month. */
export function usageThisMonth(userId) {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return [...calls.values()].filter(
    (c) => c.userId === userId && c.createdAt >= start.getTime(),
  ).length
}

export function updateCall(id, patch) {
  const call = calls.get(id)
  if (!call) return null
  Object.assign(call, patch)
  closeHoldIfOver(call)
  persist(call)
  emit(call, 'updated')
  return call
}

/**
 * Stops the queue clock once the call is off the line.
 *
 * A call can perfectly well end while still waiting — the hold ceiling firing
 * is exactly that case, and so is hanging up on a queue. holdSecondsSoFar
 * measures the running stretch against the present moment, so a stretch left
 * open never closes: the finished record would report a longer wait every time
 * anybody looked at it, and tomorrow it would claim twenty hours.
 *
 * Banked against endedAt rather than now, so a record repaired at boot is
 * credited with the wait it actually had and not the downtime as well.
 */
function closeHoldIfOver(call, now = Date.now()) {
  if (!call.holdingSince || LIVE_STATUSES.has(call.status)) return
  const until = call.endedAt ?? now
  const stretch = Math.max(0, Math.round((until - call.holdingSince) / 1000))
  call.holdSeconds = (call.holdSeconds ?? 0) + stretch
  call.holdingSince = null
}

/**
 * Notified after a line is stored and broadcast, so anything slow (translation)
 * runs behind the live call rather than in front of it. A plain callback rather
 * than a bus subscription keeps the store free of imports from the agent side.
 */
let onTranscript = null
export const setTranscriptListener = (fn) => { onTranscript = fn }

export function addTranscript(id, speaker, text) {
  const call = calls.get(id)
  if (!call || !text) return null

  // `at` identifies the line: the app keys its list on it and translations are
  // matched to it. Two lines can land in the same millisecond — the caller's
  // hello and the greeting answering it do exactly that — so nudge forward
  // rather than collide. Still a real timestamp, just guaranteed to increase.
  const previous = call.transcript.at(-1)?.at ?? 0
  const at = Math.max(Date.now(), previous + 1)

  const entry = { speaker, text, at }
  call.transcript.push(entry)
  persist(call)
  bus.emit(id, { type: 'transcript', callId: id, entry })
  // Deliberately last, and never awaited.
  try {
    onTranscript?.(call, entry)
  } catch (err) {
    log.warn('store', `transcript listener threw: ${err.message}`)
  }
  return entry
}

/**
 * Fills in a translation that arrived after the line did. Matched on the
 * entry's timestamp, which is what the app keys its transcript on.
 */
export function setTranslation(id, at, translation) {
  const call = calls.get(id)
  if (!call || !translation) return null
  const entry = call.transcript.find((e) => e.at === at)
  if (!entry || entry.translation) return null
  entry.translation = translation
  persist(call)
  bus.emit(id, { type: 'translation', callId: id, at, translation })
  return entry
}

/**
 * Completed calls Twilio has not priced yet. Rating lags the hangup by minutes
 * to hours, so the poller keeps asking for a while and then gives up.
 */
export function callsAwaitingCost(maxAgeMs = 48 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs
  return [...calls.values()].filter(
    (c) =>
      c.twilioSid &&
      !c.cost &&
      (c.status === CallStatus.COMPLETED || c.status === CallStatus.FAILED) &&
      (c.endedAt ?? 0) > cutoff,
  )
}

/**
 * Records that the call is waiting in a queue, or has stopped waiting.
 *
 * Hold is the expensive part of a call and the least valuable: the speech relay
 * bills the same per minute whether it is transcribing a person or hold music,
 * and on a long bank queue that is most of what the call costs. Knowing when it
 * starts is what lets the call be capped, shown to the person watching, and
 * measured afterwards.
 *
 * The assistant reports this itself rather than anything listening to the
 * audio. Queue announcements are real speech — "you are seventh in line" would
 * reset any silence timer and defeat any voice-activity detector — but the
 * difference between that and a person saying hello is obvious to something
 * already reading the transcript.
 *
 * @returns the call, so the caller can see how long it has now been waiting.
 */
export function setHolding(id, waiting, now = Date.now()) {
  const call = calls.get(id)
  if (!call) return null

  const holding = Boolean(waiting)
  if (holding === Boolean(call.holdingSince)) return call

  if (holding) {
    call.holdingSince = now
  } else {
    // Banked on the way out, so a call that is held several times adds up
    // rather than only remembering the last stretch.
    // Clamped: a duration is never negative, and a clock that steps backwards
    // must not eat time already banked.
    const stretch = Math.max(0, Math.round((now - call.holdingSince) / 1000))
    call.holdSeconds = (call.holdSeconds ?? 0) + stretch
    call.holdingSince = null
  }

  persist(call)
  emit(call, 'updated')
  return call
}

/** How long this call has been waiting in total, including any stretch still running. */
export function holdSecondsSoFar(call, now = Date.now()) {
  const banked = call?.holdSeconds ?? 0
  const running = call?.holdingSince ? Math.max(0, Math.round((now - call.holdingSince) / 1000)) : 0
  return banked + running
}

/**
 * Adds a step or marks an existing one done. Matching is by label so the
 * assistant can tick off something it noted several turns earlier without
 * having to track an id.
 */
export function noteStep(id, label, done) {
  const call = calls.get(id)
  if (!call || !label) return null
  const trimmed = String(label).trim()
  if (!trimmed) return null

  const existing = call.steps.find((s) => s.label.toLowerCase() === trimmed.toLowerCase())
  if (existing) existing.done = Boolean(done)
  else call.steps.push({ label: trimmed, done: Boolean(done) })

  persist(call)
  emit(call, 'updated')
  return call.steps
}

/**
 * What the person made of the call, once it is over.
 *
 * Kept on the call rather than in a table of its own: it is one small object
 * per call, it is worthless without the call it describes, and account deletion
 * should take it with everything else without anybody having to remember a
 * second table.
 *
 * `verdict` is the whole of the required answer — the reasons and the note are
 * both optional, because a rating that demands an essay gets neither.
 */
export function recordFeedback(id, { verdict, reasons, note }) {
  const call = calls.get(id)
  if (!call) return null
  call.feedback = {
    verdict,
    reasons: Array.isArray(reasons) ? reasons : [],
    note: String(note ?? '').trim().slice(0, 2000),
    at: Date.now(),
  }
  persist(call)
  emit(call, 'updated')
  return call.feedback
}

export function recordResult(id, key, value) {
  const call = calls.get(id)
  if (!call) return null
  call.results[key] = value
  persist(call)
  emit(call, 'updated')
  return call.results
}

function emit(call, type) {
  bus.emit(call.id, { type, callId: call.id, call: summarize(call) })
}

/** The shape the Android app consumes. Transcript is sent separately. */
export function summarize(call) {
  return {
    id: call.id,
    phoneNumber: call.phoneNumber,
    businessName: call.businessName,
    template: call.template,
    goal: call.goal,
    constraints: call.constraints,
    language: call.language ?? 'en',
    acceptCallback: Boolean(call.acceptCallback),
    cost: call.cost ?? null,
    status: call.status,
    // The app shows "queueing, N minutes" on the live card rather than a
    // silent timer that looks like the call has stalled.
    //
    // All three, because the feed only pushes on a state change: holdSeconds
    // alone would arrive as 0 the moment the wait began and sit there until it
    // ended. holdingSince is what lets the app run the clock itself between
    // pushes, the same way it does the call's own duration.
    onHold: Boolean(call.holdingSince),
    holdingSince: call.holdingSince ?? null,
    holdSeconds: holdSecondsSoFar(call),
    summaryTranslation: call.summaryTranslation ?? null,
    // So the detail screen can show the rating already given rather than
    // asking for it again every time the call is opened.
    feedback: call.feedback ?? null,
    steps: call.steps,
    results: call.results,
    outcome: call.outcome,
    summary: call.summary,
    error: call.error,
    createdAt: call.createdAt,
    endedAt: call.endedAt,
  }
}

export const detail = (call) => ({ ...summarize(call), transcript: call.transcript })

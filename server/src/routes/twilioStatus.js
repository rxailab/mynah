import express from 'express'
import twilio from 'twilio'
import { getUser } from '../accounts.js'
import { refundCredit } from '../billing/credits.js'
import { config } from '../config.js'
import { log } from '../log.js'
import { CallStatus, addTranscript, getCall, updateCall } from '../store.js'
import { relayTwiml } from '../twilio/twiml.js'
import { reconcileCallerId } from '../twilio/callerId.js'

export const twilioStatus = express.Router()

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

const form = express.urlencoded({ extended: false })

/** Twilio signs the full URL it called, query string included. */
const signed = (req) =>
  twilio.validateRequest(
    config.twilioAuthToken,
    req.get('x-twilio-signature') || '',
    `https://${config.publicHost}${req.originalUrl}`,
    req.body || {},
  )

const FAILURE_REASONS = {
  busy: 'The line was busy.',
  'no-answer': 'Nobody answered.',
  canceled: 'The call was cancelled before it connected.',
  failed: 'The call could not be connected.',
}

twilioStatus.post('/status', form, (req, res) => {
  if (!signed(req)) {
    log.warn('twilio', 'rejected a status callback with a bad signature')
    return res.status(403).end()
  }

  const call = getCall(req.query.ref)
  if (!call) return res.status(204).end()

  const status = req.body.CallStatus
  log.info('twilio', `call ${call.id} is ${status}`)

  if (FAILURE_REASONS[status]) {
    // A call nobody answered is not a call, so its credit goes back. Guarded by
    // creditRefunded: Twilio retries callbacks it thinks failed, and a retry
    // must not refund twice — the ledger's own floor stops minting, this stops
    // the double.
    const refund = Boolean(call.creditGrantId) && !call.creditRefunded
    if (refund) refundCredit(call.creditGrantId)
    updateCall(call.id, {
      status: CallStatus.FAILED,
      error: FAILURE_REASONS[status],
      endedAt: Date.now(),
      ...(refund ? { creditRefunded: true } : {}),
    })
  } else if (status === 'completed') {
    // The line connected and then not one word was said, in either direction.
    // Every path that speaks writes a transcript line as it goes, so an empty
    // one here means the relay never came up and whoever answered heard
    // silence — our failure, and not something to charge a call for. Guarded
    // on outcome too, so a call the assistant finished and a call ended from
    // the app (which sets one) are never mistaken for it.
    const silent = !call.transcript.length && !call.outcome
    const refund = silent && Boolean(call.creditGrantId) && !call.creditRefunded
    if (refund) {
      refundCredit(call.creditGrantId)
      log.warn('twilio', `call ${call.id} connected but nothing was ever said; credit refunded`)
    }
    updateCall(call.id, {
      status: call.outcome ? CallStatus.COMPLETED : call.status,
      endedAt: Date.now(),
      ...(refund ? { creditRefunded: true } : {}),
    })
  }

  res.type('text/xml').send('<Response/>')
})

/**
 * The end of a caller ID verification call.
 *
 * Nothing here is taken at its word. The webhook says whether the code was
 * keyed in correctly, but this endpoint decides which numbers an account may
 * present, so the only thing it does with the message is go and ask Twilio.
 * `ref` says whose verification it was — matching on the number alone would let
 * a second account that had typed the same number collect the result.
 */
twilioStatus.post('/caller-id-status', form, wrap(async (req, res) => {
  if (!signed(req)) {
    log.warn('twilio', 'rejected a caller ID callback with a bad signature')
    return res.status(403).end()
  }

  const user = getUser(String(req.query.ref ?? ''))
  if (!user) return res.status(204).end()

  // They changed their number while the call was in flight. Whatever was just
  // verified is not the number on the profile, so it is not theirs to present.
  if (String(req.body.To ?? '') !== user.ownerPhone) {
    log.warn('twilio', `caller ID callback for ${user.id} is for a number no longer on the profile`)
    return res.status(204).end()
  }

  log.info('twilio', `caller ID verification for ${user.id} reported ${req.body.VerificationStatus}`)
  await reconcileCallerId(user)
  res.type('text/xml').send('<Response/>')
}))

// --- handing the call back ----------------------------------------------------
// A hand-over used to be the end of the call: <Dial> with nothing after it, so
// the account holder hanging up took the line down with them. Getting the
// assistant involved again meant dialling the business from scratch — through
// the menu, through the queue, to a different agent with no idea what had been
// said. The three routes below make the hand-over a loan rather than a
// bequest, without adding a conference or a third billed leg.

/**
 * The owner's leg has ended. The business is still on the line, so the leg goes
 * back to the relay and the assistant picks the call up again.
 *
 * Twilio is holding the call open waiting for this response, so it does the one
 * decision and nothing slow: no fetching, no transcribing, no waiting on the
 * recording. What the assistant missed is handled after it is already talking.
 */
twilioStatus.post('/after-handover', form, (req, res) => {
  if (!signed(req)) {
    log.warn('twilio', 'rejected a hand-over callback with a bad signature')
    return res.status(403).end()
  }

  const call = getCall(req.query.ref)
  if (!call) return res.type('text/xml').send('<Response><Hangup/></Response>')

  const outcome = req.body.DialCallStatus
  const seconds = Number(req.body.DialCallDuration || 0)

  // Never reached them at all. Nothing was handed over, so there is nothing to
  // hand back — and the assistant cannot carry on with the thing it stopped for.
  if (outcome !== 'completed') {
    log.info('twilio', `call ${call.id}: the account holder did not pick up (${outcome})`)
    addTranscript(call.id, 'system', 'The account holder did not answer the transfer.')
    updateCall(call.id, { status: CallStatus.FAILED, error: 'The transfer was not answered.' })
    return res.type('text/xml').send('<Response><Hangup/></Response>')
  }

  log.info('twilio', `call ${call.id}: back from the account holder after ${seconds}s`)
  addTranscript(call.id, 'system', `The account holder was on the line for ${seconds}s.`)
  updateCall(call.id, {
    status: CallStatus.IN_PROGRESS,
    // Read on resume. The assistant has to be told it has a hole rather than
    // left to assume the conversation it remembers is the current one.
    handoverGapSeconds: seconds,
    ownerLegSid: '',
  })
  res.type('text/xml').send(relayTwiml(call))
})

/**
 * The owner's leg was answered. Keeping its SID is what lets the app end that
 * leg on a button press — otherwise handing the call back means hanging up on a
 * call you can hear is still running, which nobody does on purpose.
 */
twilioStatus.post('/owner-leg', form, (req, res) => {
  if (!signed(req)) return res.status(403).end()
  const call = getCall(req.query.ref)
  if (call && req.body.CallSid) updateCall(call.id, { ownerLegSid: req.body.CallSid })
  res.status(204).end()
})

/**
 * The recording of the stretch the assistant was not on the line for.
 *
 * Stored, not transcribed here: this fires when Twilio has finished processing,
 * which is after the assistant is already back and talking. It cannot inform
 * the first thing it says. What it is for is the record — a call whose
 * transcript has a hole in exactly the part where a person agreed something is
 * the one part you will want to read back.
 */
twilioStatus.post('/handover-recording', form, (req, res) => {
  if (!signed(req)) return res.status(403).end()
  const call = getCall(req.query.ref)
  if (call && req.body.RecordingUrl) {
    updateCall(call.id, {
      handoverRecordingUrl: req.body.RecordingUrl,
      handoverRecordingSeconds: Number(req.body.RecordingDuration || 0),
    })
    log.info('twilio', `call ${call.id}: hand-over recording is ${req.body.RecordingDuration}s`)
  }
  res.status(204).end()
})

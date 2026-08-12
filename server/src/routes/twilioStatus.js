import express from 'express'
import twilio from 'twilio'
import { getUser } from '../accounts.js'
import { refundCredit } from '../billing/credits.js'
import { config } from '../config.js'
import { log } from '../log.js'
import { CallStatus, getCall, updateCall } from '../store.js'
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

import {
  clearCallerIdAttempt,
  clearVerifiedCallerId,
  saveCallerIdAttempt,
  saveVerifiedCallerId,
} from '../accounts.js'
import { config } from '../config.js'
import { log } from '../log.js'
import { fetchCallRecord, rest } from './client.js'

/**
 * Presenting the user's own mobile number as the caller ID.
 *
 * Twilio will only put a number in `from` that the account either owns or has
 * verified, and Ofcom requires UK networks to block a call whose caller has no
 * right to the number it presents. Verification is how the right is
 * established: Twilio rings the number and the person who answers keys a
 * six-digit code in. Only whoever is holding that line can do that.
 *
 * The SMS code behind phone sign-in does not substitute for it. That proves
 * control of the SMS channel, which is a different network from the voice one,
 * and Twilio does not accept it here.
 *
 * Verified numbers live in one flat list on the account, with no notion of
 * which user each belongs to. Twilio will therefore happily let one person's
 * number be presented on another person's call — the mapping in the users
 * table is the only thing preventing that, so `from` must always be read from
 * the account and never from a request.
 */

/**
 * How long a remembered attempt is worth resuming when Twilio cannot say what
 * became of the call. Only a backstop — normally the call's own status decides,
 * and this covers the fetch failing or the SID having aged out of the log.
 */
const ATTEMPT_WINDOW_MS = 5 * 60_000

/** Twilio call states in which the code could still be keyed in. */
const STILL_RINGING = new Set(['queued', 'initiated', 'ringing', 'in-progress'])

/** @returns {{code: string, callSid: string}} the code to put on screen. */
export async function requestVerification(phone, userId, friendlyName) {
  const params = {
    phoneNumber: phone,
    friendlyName: friendlyName || phone,
    // The app needs a moment to show the code and say which number is about to
    // ring. A code already on screen turns an unknown foreign number asking for
    // digits — which is what a scam looks like — into an expected call.
    callDelay: config.callerIdVerifyDelay,
  }

  // Carries which account asked, so the result can only ever be applied to
  // them. Without it the only identifier is the number itself, and nothing
  // stops two accounts putting the same number on their profile — one of them
  // would collect a verification the other did the work for.
  //
  // Only asked for when the Auth Token is around to check the signature with,
  // for the reason given in placeCall: an unauthenticated endpoint that decides
  // which numbers an account may present is worse than no endpoint. The app
  // polls either way.
  if (config.twilioAuthToken) {
    params.statusCallback =
      `https://${config.publicHost}/twilio/caller-id-status?ref=${encodeURIComponent(userId)}`
    params.statusCallbackMethod = 'POST'
  }

  const request = await rest.validationRequests.create(params)
  // Kept because Twilio gives the code out once and only once. Somebody who
  // backgrounds the app while their phone is ringing has to be able to come
  // back to the same six digits, not be handed a second call.
  saveCallerIdAttempt(userId, { code: request.validationCode, callSid: request.callSid })
  log.info('twilio', `caller ID verification started for ${phone}`)
  return { code: request.validationCode, callSid: request.callSid }
}

/**
 * The verification still out there, if there is one.
 *
 * Whether an attempt is live is decided by the call, not by a timer: a call
 * that was declined thirty seconds ago is over, and telling someone to keep
 * waiting for it is worse than telling them to try again. The age check only
 * covers not being able to ask.
 *
 * Clears the record on the way past when the attempt is finished, so the next
 * request starts cleanly.
 *
 * @returns {Promise<{code: string} | null>}
 */
export async function pendingAttempt(user) {
  const attempt = user?.callerIdAttempt
  if (!attempt) return null

  const done = () => {
    clearCallerIdAttempt(user.id)
    return null
  }

  if (!attempt.callSid) {
    return Date.now() - attempt.at < ATTEMPT_WINDOW_MS ? { code: attempt.code } : done()
  }

  let status
  try {
    status = (await fetchCallRecord(attempt.callSid)).status
  } catch (err) {
    // Cannot tell. Fall back to the clock rather than either stranding them on
    // a dead call or throwing away a code that is still on their screen.
    log.warn('twilio', `could not check verification call ${attempt.callSid}: ${err.message}`)
    return Date.now() - attempt.at < ATTEMPT_WINDOW_MS ? { code: attempt.code } : done()
  }

  return STILL_RINGING.has(status) ? { code: attempt.code } : done()
}

/**
 * Twilio's own list is the only thing that decides whether a number is
 * verified. The status webhook says so too, but a webhook is an assertion
 * arriving over the internet about which number an account may present, so it
 * is treated as a prompt to come and ask rather than as the answer.
 *
 * @returns the OutgoingCallerId SID, or null when the number is not verified.
 */
export async function verifiedSidFor(phone) {
  if (!phone) return null
  const found = await rest.outgoingCallerIds.list({ phoneNumber: phone, limit: 1 })
  return found.length ? found[0].sid : null
}

/**
 * Brings what we have stored into line with what Twilio actually holds, and
 * answers whether the number is verified.
 *
 * Both the app polling for a result and the status webhook come through here,
 * so neither is trusted on its own: the webhook can be forged in principle and
 * missed in practice, and polling alone would never notice a caller ID removed
 * from the Twilio Console.
 */
export async function reconcileCallerId(user) {
  const phone = user?.ownerPhone
  if (!phone) return false

  const sid = await verifiedSidFor(phone)
  if (sid && sid !== user.callerIdSid) saveVerifiedCallerId(user.id, { phone, sid })
  else if (!sid && user.verifiedCallerId) clearVerifiedCallerId(user.id)
  return Boolean(sid)
}

/**
 * Gives the number up. Called when someone unverifies, and on account deletion
 * — a departed user's number left on the account is both a record we said we
 * had deleted and a number we can still present.
 */
export async function releaseCallerId(sid) {
  if (!sid) return
  try {
    await rest.outgoingCallerIds(sid).remove()
    log.info('twilio', `released caller ID ${sid}`)
  } catch (err) {
    // Already gone, possibly removed in the Twilio Console. Nothing to undo.
    if (err?.status !== 404) throw err
  }
}

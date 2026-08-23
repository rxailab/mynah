import express from 'express'
import { config } from '../config.js'
import { log } from '../log.js'
import {
  CallStatus, createCall, deleteCall, detail, getCall, listCalls, recordFeedback, updateCall,
  usageThisMonth,
} from '../store.js'
import { hangUp, placeCall, transferToOwner } from '../twilio/client.js'
import { getSession } from '../relay/session.js'
import { warmUp } from '../agent/brain.js'
import { parseBrief } from '../agent/parse.js'
import { canPlaceCalls, profileOf, profileReady } from '../profile.js'
import {
  createScheduled, deleteScheduled, dismissReady, getScheduled, listScheduled, pendingForNumber,
  setScheduledEnabled,
} from '../scheduled.js'
import { clearVerifiedCallerId, getUser, saveUserProfile, userForSession } from '../accounts.js'
import {
  pendingAttempt, reconcileCallerId, releaseCallerId, requestVerification, verifyCooldownRemaining,
} from '../twilio/callerId.js'
import { balanceOf, refundCredit, spendCredit } from '../billing/credits.js'
import { priceOf, stripeConfigured } from '../billing/stripe.js'
import { billing } from './billing.js'
import { tokenFromRequest } from './auth.js'

export const api = express.Router()

/**
 * Express 4 does not catch rejected promises from async handlers — they become
 * unhandled rejections, which terminate the process. On a server that may be
 * holding several live phone calls, one failed request must never do that.
 */
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

const E164 = /^\+[1-9]\d{6,14}$/
const TEMPLATES = ['restaurant', 'bank', 'appointment', 'custom']

/**
 * Every route below belongs to one signed-in person. The session token replaces
 * the shared API token the app used to send: with accounts, "who is asking"
 * decides which calls come back, not just whether to answer at all.
 */
api.use((req, res, next) => {
  const user = userForSession(tokenFromRequest(req))
  if (!user) return res.status(401).json({ error: 'Sign in again.' })
  req.user = user
  next()
})

// Purchases, mounted behind the sign-in gate above like everything else here.
api.use('/billing', billing)

/** A call you did not place is not a call you can see. */
function ownedCall(req, res) {
  const call = getCall(req.params.id)
  if (!call || call.userId !== req.user.id) {
    res.status(404).json({ error: 'No such call.' })
    return null
  }
  return call
}

api.get('/config', (req, res) => {
  res.json({ ...profileOf(req.user), ready: profileReady(req.user), templates: TEMPLATES })
})

api.get('/profile', (req, res) => res.json({ ...profileOf(req.user), ready: profileReady(req.user) }))

api.put('/profile', (req, res) => {
  const name = String(req.body?.ownerName ?? '').trim()
  const phone = String(req.body?.ownerPhone ?? '').trim()
  if (name.length < 2) {
    return res.status(400).json({ error: 'Give the name the assistant should say it is calling on behalf of.' })
  }
  if (!E164.test(phone)) {
    return res.status(400).json({ error: 'Your phone number must be in international format, e.g. +447700900123.' })
  }
  const user = saveUserProfile(req.user.id, { name, ownerPhone: phone })
  log.info('accounts', `profile saved for ${user.email || user.phone || user.id}`)
  res.json({ ...profileOf(user), ready: profileReady(user) })
})

// --- caller ID ---------------------------------------------------------------
// Whether outbound calls go out under their own number instead of the shared
// one. See twilio/callerId.js for why this needs a call and a keyed-in code.

api.get('/caller-id', wrap(async (req, res) => {
  const phone = req.user.ownerPhone ?? ''
  const verified = E164.test(phone) ? await reconcileCallerId(req.user) : false
  // Resuming matters more than it sounds: the code exists exactly once, so
  // someone who left the screen mid-call can only get back to it through here.
  // Re-read first — reconciling may have just written to this row, and req.user
  // was loaded before that.
  const pending = verified ? null : await pendingAttempt(getUser(req.user.id))
  res.json({
    verified,
    phone,
    callingFrom: config.callerIdVerifyFrom,
    pendingCode: pending?.code ?? '',
  })
}))

api.post('/caller-id/verify', wrap(async (req, res) => {
  // The number comes off the profile, never out of the body. Verifying an
  // arbitrary number on request is a service for making a stranger's phone
  // ring, and the verified list is account-wide, so a number let in here could
  // then be presented on anyone's call.
  const phone = req.user.ownerPhone ?? ''
  if (!E164.test(phone)) {
    return res.status(400).json({
      error: 'Save your phone number first, in international format, e.g. +447700900123.',
    })
  }
  if (await reconcileCallerId(req.user)) {
    return res.status(409).json({ error: 'That number is already verified.' })
  }

  const answer = (code, resumed) => res.json({
    code,
    phone,
    callingFrom: config.callerIdVerifyFrom,
    // Nothing more is coming when this is a resume — the call it belongs to is
    // already ringing, so the screen must not tell them to expect another one.
    delaySeconds: resumed ? 0 : config.callerIdVerifyDelay,
    resumed,
  })

  // Their phone is already ringing. Placing a second call would leave two live
  // codes and one confused person, so hand back the one they were given unless
  // they have said outright that the first call never arrived.
  if (!req.body?.force) {
    const pending = await pendingAttempt(getUser(req.user.id))
    if (pending) return answer(pending.code, true)
  }

  // Past this point a new call goes out, and each one dials a real phone and is
  // billed. Resuming above is deliberately not rate limited — it places no call
  // and hands back a code already on their screen, so making someone wait for it
  // would be a penalty for reopening a screen.
  const retryAfterSeconds = verifyCooldownRemaining(getUser(req.user.id))
  if (retryAfterSeconds > 0) {
    res.set('Retry-After', String(retryAfterSeconds))
    return res.status(429).json({
      retryAfterSeconds,
      error: `We already rang you. Give it ${retryAfterSeconds} more second`
        + `${retryAfterSeconds === 1 ? '' : 's'} before asking for another call.`,
    })
  }

  try {
    const { code } = await requestVerification(phone, req.user.id, req.user.name || req.user.id)
    answer(code, false)
  } catch (err) {
    log.error('api', 'could not start caller ID verification', err.message)
    // 21450 is Twilio's "already a verified caller ID", which reconcile above
    // should have caught — it means the list and our copy had drifted.
    const advice = err.code === 21450
      ? 'Twilio already has this number verified. Reopen this screen.'
      : ''
    res.status(502).json({
      error: `${err.message}${advice ? `. ${advice}` : ''}`,
    })
  }
}))

/**
 * Give the call back to the assistant.
 *
 * Ends the account holder's own leg, which is what the `action` on the transfer
 * `<Dial>` is waiting for: Twilio then asks the server what to do next and the
 * leg goes back to the relay, with the business never having left the line.
 *
 * Doing it this way rather than telling people to hang up is the whole point of
 * keeping the leg's SID. Hanging up on a call you can hear is still running is
 * not something anyone does willingly, and the ones who try it hang up the
 * wrong leg.
 */
api.post('/calls/:id/hand-back', wrap(async (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return
  if (call.status !== CallStatus.TRANSFERRING) {
    return res.status(409).json({ error: 'That call is not with you right now.' })
  }
  if (!call.ownerLegSid) {
    return res.status(409).json({ error: 'Still connecting you — try again in a moment.' })
  }
  try {
    await hangUp(call.ownerLegSid)
    log.info('api', `call ${call.id}: handing back to the assistant`)
    res.json({ ok: true })
  } catch (err) {
    log.error('api', 'could not hand the call back', err.message)
    res.status(502).json({ error: `Could not hand the call back: ${err.message}` })
  }
}))

/** Stop presenting their number, and give it back to Twilio. */
api.delete('/caller-id', wrap(async (req, res) => {
  await releaseCallerId(req.user.callerIdSid)
  clearVerifiedCallerId(req.user.id)
  log.info('api', `caller ID released for ${req.user.email || req.user.phone || req.user.id}`)
  res.json({ ok: true })
}))

// --- scheduled calls ----------------------------------------------------------
// Nothing here dials. A task that comes due is marked ready and shows up in the
// app waiting to be confirmed, and confirming it walks the ordinary check step.
// See scheduled.js for why.

api.get('/scheduled', (req, res) => res.json({ tasks: listScheduled(req.user.id) }))

api.post('/scheduled', (req, res) => {
  const goal = String(req.body?.goal ?? '').trim()
  const runAt = Number(req.body?.runAt ?? 0)
  const phoneNumber = String(req.body?.phoneNumber ?? '').trim()

  if (goal.length < 5) {
    return res.status(400).json({ error: 'Say what the call should achieve, in a sentence or two.' })
  }
  if (!Number.isFinite(runAt) || runAt <= 0) {
    return res.status(400).json({ error: 'runAt must be a timestamp in milliseconds.' })
  }
  if (phoneNumber && !E164.test(phoneNumber)) {
    return res.status(400).json({ error: 'phoneNumber must be in international format, e.g. +441614960000.' })
  }
  // A time already gone would be marked ready by the very next scheduler tick,
  // which is a scheduled call that was never scheduled.
  if (runAt < Date.now() - 60_000) {
    return res.status(400).json({ error: 'That time has already passed. Pick one in the future.' })
  }

  // Repeats are gone rather than merely absent from the app: see scheduled.js.
  // Refused loudly rather than ignored, so a client that still sends one finds
  // out instead of quietly booking a single call and thinking it booked twenty.
  if (Number(req.body?.repeatDays ?? 0) > 0) {
    return res.status(400).json({
      error:
        'Scheduled calls run once. A standing rule that rings the same number every day is a ' +
        'robocall from the other end, whatever it is for — set the next one when this one is done.',
      repeatsNotAllowed: true,
    })
  }

  // One pending call per number, or a repeat can be assembled by hand out of
  // single tasks that are each perfectly allowed.
  const clash = pendingForNumber(req.user.id, phoneNumber)
  if (clash) {
    return res.status(409).json({
      error:
        `You already have a call waiting for this number: "${clash.goal}". ` +
        'Change or cancel that one rather than stacking another on top of it.',
      clashesWith: clash.id,
    })
  }

  const task = createScheduled(req.user.id, {
    goal,
    runAt,
    phoneNumber,
    businessName: String(req.body?.businessName ?? '').trim(),
    template: TEMPLATES.includes(req.body?.template) ? req.body.template : 'custom',
    language: ['en', 'zh'].includes(req.body?.language) ? req.body.language : 'en',
  })
  res.status(201).json(task)
})

/** A task you did not create is not a task you can touch. */
function ownedTask(req, res) {
  const task = getScheduled(req.params.id)
  if (!task || listScheduled(req.user.id).every((t) => t.id !== task.id)) {
    res.status(404).json({ error: 'No such scheduled call.' })
    return null
  }
  return task
}

api.patch('/scheduled/:id', (req, res) => {
  const task = ownedTask(req, res)
  if (!task) return
  if (typeof req.body?.enabled === 'boolean') {
    // Switching one back on is another way to end up with two live calls
    // pointed at one number, so it answers to the same rule as creating one.
    if (req.body.enabled) {
      const clash = pendingForNumber(req.user.id, task.phoneNumber, task.id)
      if (clash) {
        return res.status(409).json({
          error: `You already have a call waiting for this number: "${clash.goal}".`,
          clashesWith: clash.id,
        })
      }
    }
    return res.json(setScheduledEnabled(req.params.id, req.body.enabled))
  }
  // Acting on a ready task: roll a repeat forward, retire a one-off.
  if (req.body?.dismiss === true) return res.json(dismissReady(req.params.id))
  res.status(400).json({ error: 'Send either enabled or dismiss.' })
})

api.delete('/scheduled/:id', (req, res) => {
  if (!ownedTask(req, res)) return
  deleteScheduled(req.params.id)
  res.json({ ok: true })
})

/** The plan screen in one round trip: month so far, calls left, what is on sale. */
api.get('/usage', wrap(async (req, res) => {
  // What Stripe's packs cost, so the screen can price them before anybody taps.
  // Prices come from Stripe and are cached there; a pack whose price cannot be
  // read is left out rather than shown at a guess.
  const inAppPacks = []
  if (stripeConfigured() && config.stripePublishableKey) {
    for (const pack of config.stripePacks) {
      try {
        const price = await priceOf(pack.priceId)
        inAppPacks.push({ ...pack, price: money(price.amount, price.currency) })
      } catch (err) {
        log.warn('api', `could not price ${pack.priceId} for the plan screen: ${err.message}`)
      }
    }
  }

  res.json({
    used: usageThisMonth(req.user.id),
    balance: balanceOf(req.user.id),
    packs: config.playPacks,
    // Payable without leaving the app, through Stripe's own sheet.
    inAppPacks,
    // Whether the web page taking cards, WeChat Pay and Alipay is switched on.
    // The app cannot find this out by asking for a link — that would mean
    // offering a button and discovering it does not work on the press. Kept
    // even with in-app pay available: it is the only route somebody else can
    // pay by, and the only one that carries no store fee.
    webPay: stripeConfigured(),
  })
}))

const money = (amount, currency) => {
  const symbol = { GBP: '£', USD: '$', EUR: '€', CNY: '¥' }[currency] || ''
  const value = (amount / 100).toFixed(2)
  return symbol ? `${symbol}${value}` : `${value} ${currency}`
}

/**
 * Free text in, structured brief out. Nothing is dialled here — the result is
 * shown back for correction first, which is the whole reason the parser is
 * allowed to leave fields empty instead of guessing.
 */
api.post('/parse', wrap(async (req, res) => {
  const text = String(req.body?.text ?? '').trim()
  if (text.length < 5) {
    return res.status(400).json({ error: 'Say what you want done, in a sentence.' })
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'That is longer than one request. Keep it to a sentence or two.' })
  }

  try {
    res.json(await parseBrief(text))
  } catch (err) {
    log.error('api', 'could not parse the request', err.message)
    res.status(502).json({ error: `Could not work out what you meant: ${err.message}` })
  }
}))

api.get('/calls', (req, res) => res.json({ calls: listCalls(req.user.id) }))

api.get('/calls/:id', (req, res) => {
  const call = ownedCall(req, res)
  if (call) res.json(detail(call))
})

/**
 * Forgets one call. Irreversible, and deliberately so: there is no bin to
 * restore from, because a record somebody asked to delete is not one to keep.
 *
 * A call still on the line is refused rather than queued for deletion — the
 * honest answer is "hang up first", and it is one tap away on the same screen.
 */
api.delete('/calls/:id', (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return
  if (!deleteCall(call.id)) {
    return res.status(409).json({ error: 'That call is still running. Hang up first, then delete it.' })
  }
  res.json({ ok: true })
})

api.post('/calls', wrap(async (req, res) => {
  const { goal, phoneNumber, businessName, template, constraints, language, acceptCallback } =
    req.body || {}

  if (!goal || typeof goal !== 'string' || goal.trim().length < 5) {
    return res.status(400).json({ error: 'Say what the call should achieve, in a sentence or two.' })
  }
  if (!E164.test(String(phoneNumber || '').trim())) {
    return res
      .status(400)
      .json({ error: 'phoneNumber must be in international format, e.g. +441614960000.' })
  }
  if (template && !TEMPLATES.includes(template)) {
    return res.status(400).json({ error: `template must be one of: ${TEMPLATES.join(', ')}` })
  }
  if (language && !['en', 'zh'].includes(language)) {
    return res.status(400).json({ error: 'language must be en or zh.' })
  }
  if (!profileReady(req.user)) {
    return res.status(400).json({
      error:
        'Add your name and phone number in Settings first. The assistant introduces itself with ' +
        'your name, and needs your number to bring you onto the call when it cannot continue alone.',
    })
  }

  // Calls go out under the caller's own number or not at all. Checked here, at
  // the door, rather than at dial time: refusing before a call row exists means
  // no half-made call sitting in the history explaining itself.
  //
  // Read from the row rather than asking Twilio. Twilio is the real enforcement
  // — it rejects a `from` it has not verified for this account — so a stale
  // local flag cannot let anyone present a number they do not hold. Asking on
  // every dial would buy nothing and put a network round-trip in front of every
  // call.
  if (!canPlaceCalls(getUser(req.user.id))) {
    return res.status(403).json({
      error:
        'Verify your phone number before placing a call. Calls go out under your own number so ' +
        'the business can ring you back — there is no shared number to fall back to.',
      needsCallerId: true,
    })
  }

  // Paid for before it is placed, and put back if it never connects — Twilio
  // refusing it below, or the far end never answering (the status webhook).
  // Last of all the checks, so nobody pays for a request that a missing field
  // or an unverified number was always going to refuse.
  const creditGrantId = spendCredit(req.user.id)
  if (!creditGrantId) {
    return res.status(402).json({
      error: 'You are out of calls. Top up under Plan & usage and this call can go straight out.',
      needsCredits: true,
    })
  }

  const call = createCall({
    goal: goal.trim(),
    phoneNumber: String(phoneNumber).trim(),
    businessName: (businessName || '').trim() || undefined,
    template: template || 'custom',
    language: language || 'en',
    acceptCallback: Boolean(acceptCallback),
    userId: req.user.id,
    creditGrantId,
    constraints: Array.isArray(constraints)
      ? constraints.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
      : [],
  })

  // Runs alongside the dial so the model is hot by the time anyone answers.
  warmUp()

  try {
    const sid = await placeCall(call)
    updateCall(call.id, { twilioSid: sid, status: CallStatus.DIALING })
  } catch (err) {
    log.error('api', 'could not place the call', err)
    // Twilio's own wording for the common account-level refusals is accurate but
    // gives no idea what to do about it, and it arrives on a phone screen with
    // no console to hand.
    const advice = {
      10005: 'Twilio has voice switched off for this account. Nothing here can enable it — ' +
        'open the Twilio Console and look for a verification or account-review banner, ' +
        'and contact Twilio support if there is none.',
      21210: 'The From number is not verified for this account.',
      21219: 'This is a trial account, so it can only dial numbers you have verified in the Console.',
      21606: 'The From number cannot originate calls. Buy a voice-capable number in the Console.',
    }[err.code]

    // Never went out, so it was never spent. Marked refunded on the call so a
    // status webhook for the same failure cannot refund it a second time.
    refundCredit(creditGrantId)
    updateCall(call.id, {
      status: CallStatus.FAILED, error: err.message, endedAt: Date.now(), creditRefunded: true,
    })
    return res.status(502).json({
      error: advice ? `${err.message}. ${advice}` : `Twilio refused the call: ${err.message}`,
      id: call.id,
    })
  }

  res.status(201).json(detail(getCall(call.id)))
}))

/**
 * Manual takeover: the user is watching a call and decides to step in. Same
 * mechanism the assistant's transfer_to_user tool uses — dial them and bridge
 * them into the live call.
 */
api.post('/calls/:id/takeover', wrap(async (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return
  if (!call.twilioSid) return res.status(409).json({ error: 'That call has not connected yet.' })
  if (!profileReady(req.user)) {
    return res.status(400).json({ error: 'Add your phone number in Settings so the call can reach you.' })
  }

  try {
    await transferToOwner(call, '', call.language)
  } catch (err) {
    log.error('api', `takeover failed for ${call.twilioSid}`, err.message)
    return res.status(502).json({ error: `Twilio would not transfer the call: ${err.message}` })
  }

  updateCall(call.id, { status: CallStatus.TRANSFERRING })
  res.json(detail(getCall(call.id)))
}))

/**
 * A line typed in the app, delivered into the live conversation. This is how
 * "is it a special occasion?" gets answered without taking the call over: the
 * assistant treats the note as authoritative and speaks it in its own words.
 */
api.post('/calls/:id/note', wrap(async (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return

  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: 'Type something to send.' })
  if (text.length > 500) return res.status(400).json({ error: 'Keep a note under 500 characters.' })

  const session = getSession(call.id)
  if (!session || !session.ownerNote(text)) {
    return res.status(409).json({ error: 'That call is not live, so there is nobody to tell.' })
  }
  res.json({ ok: true })
}))

/**
 * How the call went, in the caller's own judgement.
 *
 * Deliberately says nothing back to the other party and never redials — this is
 * a note about the assistant, not about the business, and the screen says so.
 * Everything but the verdict is optional: a form that insists on reasons gets
 * fewer verdicts, and the verdict is the part worth having.
 */
const FEEDBACK_REASONS = ['wrong_details', 'misheard', 'too_wordy', 'queued_too_long', 'other']

api.post('/calls/:id/feedback', (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return

  const verdict = String(req.body?.verdict ?? '')
  if (!['good', 'bad'].includes(verdict)) {
    return res.status(400).json({ error: 'Say whether the call got it done: good or bad.' })
  }
  const reasons = Array.isArray(req.body?.reasons)
    ? [...new Set(req.body.reasons.filter((r) => FEEDBACK_REASONS.includes(r)))]
    : []

  res.json(recordFeedback(call.id, { verdict, reasons, note: req.body?.note }))
})

api.post('/calls/:id/hangup', wrap(async (req, res) => {
  const call = ownedCall(req, res)
  if (!call) return

  // If Twilio refuses the hangup we still honour the user's intent locally —
  // they asked for this call to be over, and a stuck "on the call" row in the
  // app is worse than a note that the carrier leg may still be up.
  let twilioError = null
  if (call.twilioSid) {
    try {
      await hangUp(call.twilioSid)
    } catch (err) {
      twilioError = err.message
      log.error('api', `Twilio would not end call ${call.twilioSid}`, err.message)
    }
  }

  updateCall(call.id, {
    status: CallStatus.COMPLETED,
    summary: call.summary || 'Ended early from the app.',
    outcome: call.outcome || 'partial',
    error: twilioError ? `Ended in the app, but Twilio reported: ${twilioError}` : call.error,
    endedAt: Date.now(),
  })
  res.json(detail(getCall(call.id)))
}))

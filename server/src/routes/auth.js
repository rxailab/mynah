import express from 'express'
import { config } from '../config.js'
import { log } from '../log.js'
import {
  changePassword,
  createSession,
  deleteUser,
  endAllSessions,
  endSession,
  getUser,
  loginWithEmail,
  registerWithEmail,
  setPassword,
  upsertGoogleUser,
  upsertPhoneUser,
  userByEmail,
  userForSession,
} from '../accounts.js'
import { mailConfigured, sendResetCode } from '../mail.js'
import { clearResetCodes, createResetCode, useResetCode } from '../resets.js'
import { claimOrphanCalls, deleteCallsFor, usageThisMonth } from '../store.js'
import { deleteGrantsFor } from '../billing/credits.js'
import { deletePayLinksFor } from '../billing/payLinks.js'
import { seedProfileFromLegacy } from '../profile.js'
import { sendVerification, checkVerification, verifyAvailable } from '../twilio/verify.js'
import { releaseCallerId } from '../twilio/callerId.js'
import { deleteScheduledFor } from '../scheduled.js'

export const auth = express.Router()

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const E164 = /^\+[1-9]\d{6,14}$/

/** The bearer token, from either the header the app sends or a query param. */
export const tokenFromRequest = (req) =>
  (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
  String(req.query?.token ?? '')

/** Everything the app needs to render "signed in as…". */
export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  name: user.name,
  ownerPhone: user.ownerPhone,
  callsThisMonth: usageThisMonth(user.id),
})

function signIn(res, user) {
  // On a personal deployment the first person to sign in is the person whose
  // calls and details are already there.
  claimOrphanCalls(user.id)
  seedProfileFromLegacy(user.id)
  const token = createSession(user.id)
  res.json({ token, user: publicUser(getUser(user.id)) })
}

/**
 * Which ways in this server can actually offer. The app asks first and hides
 * the buttons it cannot honour — a Google button that does nothing is worse
 * than no Google button.
 */
auth.get('/methods', (_req, res) => {
  res.json({
    email: true,
    phone: verifyAvailable(),
    google: Boolean(config.googleClientId || config.googleIosClientId),
    // The app has to hand this to Google to get an ID token back. It is a
    // public identifier, not a secret, and serving it from here means the
    // client id is configured in exactly one place — set GOOGLE_CLIENT_ID and
    // both ends pick it up, with no way for them to drift apart.
    //
    // Two fields rather than one guessed from the request: each app reads the
    // one it can actually use, and a blank means that platform hides its button
    // while the other keeps working.
    googleClientId: config.googleClientId,
    googleIosClientId: config.googleIosClientId,
    // Whether "forgot password" can work at all. Same rule as the Google button
    // above: without a mail provider the code has nowhere to go, and a link
    // that leads to a dead end is worse than no link.
    passwordReset: mailConfigured(),
  })
})

auth.post('/register', wrap(async (req, res) => {
  const { email, password, name } = req.body || {}
  const result = await registerWithEmail(email, password, name)
  if (!result.ok) return res.status(400).json({ error: result.error })
  signIn(res, result.user)
}))

auth.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {}
  const result = await loginWithEmail(email, password)
  if (!result.ok) return res.status(401).json({ error: result.error })
  signIn(res, result.user)
}))

// --- forgetting, and changing, a password ----------------------------------

/**
 * Sends a six-digit code to an address, if that address has an account.
 *
 * Answers the same way whichever it is. "No account with that email" is a
 * useful sentence for the person who typed it wrong and an equally useful one
 * for somebody working through a list of addresses to find out which are
 * registered here — so nobody gets it.
 *
 * That extends to the timing of the rate limit and to a mail provider that
 * fails: none of them change the answer.
 */
auth.post('/password/forgot', wrap(async (req, res) => {
  const address = String(req.body?.email ?? '').trim()
  const answer = () => res.json({ ok: true })

  if (!mailConfigured()) {
    return res.status(501).json({
      error: 'This server has no mail provider configured, so it cannot send a code.',
    })
  }

  const user = userByEmail(address)
  if (!user) return answer()

  // Null means one went out a moment ago. Saying so would time the difference
  // between an address that exists and one that does not.
  const code = createResetCode(user.id)
  if (!code) return answer()

  try {
    await sendResetCode(user.email, code)
    log.info('auth', `reset code sent for ${user.id}`)
  } catch (err) {
    // Logged, not reported: a provider outage is ours to see, and the wording
    // that would explain it is also the wording that confirms the address.
    log.error('auth', `could not send a reset code for ${user.id}`, err.message)
  }
  answer()
}))

/**
 * Spends a code and sets the new password. Every session goes: a reset is what
 * somebody does when they think another person is in the account, and leaving
 * that person signed in would defeat the whole exercise.
 */
auth.post('/password/reset', wrap(async (req, res) => {
  const address = String(req.body?.email ?? '').trim()
  const code = String(req.body?.code ?? '').trim()
  const password = String(req.body?.password ?? '')

  // Before the code is spent, so a password the server was never going to
  // accept does not cost somebody the code and another ten-minute wait.
  if (password.length < 8) {
    return res.status(400).json({ error: 'Use at least 8 characters for the password.' })
  }

  const user = userByEmail(address)
  if (!user || !useResetCode(user.id, code)) {
    return res.status(401).json({ error: 'That code is not right, or it has expired.' })
  }

  const saved = await setPassword(user.id, password)
  if (!saved.ok) return res.status(400).json({ error: saved.error })

  endAllSessions(user.id)
  log.info('auth', `password reset for ${user.id}; every session ended`)
  signIn(res, saved.user)
}))

/** Changing it from inside the app, where the current one is the proof. */
auth.post('/password', wrap(async (req, res) => {
  const token = tokenFromRequest(req)
  const user = userForSession(token)
  if (!user) return res.status(401).json({ error: 'Sign in again.' })

  const result = await changePassword(
    user.id,
    String(req.body?.currentPassword ?? ''),
    String(req.body?.newPassword ?? ''),
  )
  if (!result.ok) return res.status(400).json({ error: result.error })

  // Every other device, but not this one — the person doing it stays where
  // they are. Any reset code still outstanding dies with it: they clearly know
  // the password, and a live code is one more way in.
  const ended = endAllSessions(user.id, token)
  clearResetCodes(user.id)
  res.json({ ok: true, otherSessionsEnded: ended })
}))

// --- phone, via Twilio Verify ---------------------------------------------

auth.post('/phone/start', wrap(async (req, res) => {
  if (!verifyAvailable()) {
    return res.status(501).json({
      error: 'This server has no SMS service configured, so it cannot send a code. ' +
        'Set TWILIO_VERIFY_SERVICE_SID, or sign in with email.',
    })
  }
  const phone = String(req.body?.phone ?? '').trim()
  if (!E164.test(phone)) {
    return res.status(400).json({ error: 'Enter the number in international format, e.g. +447700900123.' })
  }
  try {
    await sendVerification(phone)
    res.json({ ok: true })
  } catch (err) {
    log.error('auth', `could not send a code to ${phone}`, err.message)
    res.status(502).json({ error: `Twilio would not send the code: ${err.message}` })
  }
}))

auth.post('/phone/check', wrap(async (req, res) => {
  if (!verifyAvailable()) return res.status(501).json({ error: 'No SMS service is configured.' })

  const phone = String(req.body?.phone ?? '').trim()
  const code = String(req.body?.code ?? '').trim()
  if (!E164.test(phone) || !/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the code that was sent to you.' })
  }
  try {
    if (!(await checkVerification(phone, code))) {
      return res.status(401).json({ error: 'That code is not right, or it has expired.' })
    }
  } catch (err) {
    return res.status(502).json({ error: `Twilio would not check the code: ${err.message}` })
  }
  signIn(res, upsertPhoneUser(phone))
}))

// --- Google ----------------------------------------------------------------

auth.post('/google', wrap(async (req, res) => {
  // Either app's client id will do. They are separate clients in one Cloud
  // project, so a token from either is a sign-in to the same Google account.
  const audiences = [config.googleClientId, config.googleIosClientId].filter(Boolean)
  if (audiences.length === 0) {
    return res.status(501).json({
      error: 'This server has no Google client configured. Set GOOGLE_CLIENT_ID, or sign in with email.',
    })
  }
  const idToken = String(req.body?.idToken ?? '').trim()
  if (!idToken) return res.status(400).json({ error: 'No Google credential was sent.' })

  // Verified against Google rather than trusted: the app is not a place to
  // decide who someone is.
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  )
  if (!response.ok) return res.status(401).json({ error: 'Google would not confirm that sign-in.' })

  const claims = await response.json()
  if (!audiences.includes(claims.aud)) {
    return res.status(401).json({ error: 'That Google sign-in was issued for a different app.' })
  }
  if (claims.email_verified === 'false') {
    return res.status(401).json({ error: 'That Google account has no verified email.' })
  }
  signIn(res, upsertGoogleUser({ sub: claims.sub, email: claims.email, name: claims.given_name }))
}))

// --- session ---------------------------------------------------------------

auth.get('/me', (req, res) => {
  const user = userForSession(tokenFromRequest(req))
  if (!user) return res.status(401).json({ error: 'Sign in again.' })
  res.json({ user: publicUser(user) })
})

auth.post('/logout', (req, res) => {
  endSession(tokenFromRequest(req))
  res.json({ ok: true })
})

/**
 * Deletes the account and everything belonging to it. Google Play requires an
 * in-app route to this for any app that lets you create an account, and
 * requires it to delete rather than deactivate.
 *
 * Calls go first: if this fails halfway, an account with no calls is a
 * recoverable state, whereas calls with no owner would be silently inherited by
 * the next person to sign in.
 *
 * A verified caller ID lives on the Twilio account rather than in this
 * database, so deleting the row is not enough to be rid of it: it would leave
 * a departed person's phone number both stored somewhere we said we had erased
 * it from, and still presentable on somebody else's call. Twilio refusing is
 * not a reason to keep the account — that would trap someone in an account
 * they asked to close — so it is logged and the deletion goes ahead.
 */
auth.delete('/me', wrap(async (req, res) => {
  const user = userForSession(tokenFromRequest(req))
  if (!user) return res.status(401).json({ error: 'Sign in again.' })

  if (user.callerIdSid) {
    try {
      await releaseCallerId(user.callerIdSid)
    } catch (err) {
      log.error('auth', `could not release caller ID ${user.callerIdSid}`, err.message)
    }
  }

  const calls = deleteCallsFor(user.id)
  deleteScheduledFor(user.id)
  deleteGrantsFor(user.id)
  // A live link would otherwise still name a deleted account.
  deletePayLinksFor(user.id)
  deleteUser(user.id)
  log.info('auth', `account closed, ${calls} call(s) erased`)
  res.json({ ok: true, callsDeleted: calls })
}))

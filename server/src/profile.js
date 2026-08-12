import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { log } from './log.js'
import { getUser, saveUserProfile } from './accounts.js'

/**
 * Who the assistant says it is calling for, and where to reach them.
 *
 * This belongs to the person, not the deployment, so it lives on their account
 * rather than in .env. Before accounts existed it lived in data/profile.json;
 * that file is now only read once, to seed the first account that signs in.
 */

const LEGACY_FILE =
  process.env.PROFILE_FILE ||
  resolve(dirname(fileURLToPath(import.meta.url)), '../data/profile.json')

const E164 = /^\+[1-9]\d{6,14}$/

export const profileOf = (user) => ({
  ownerName: user?.name ?? '',
  ownerPhone: user?.ownerPhone ?? '',
  // Whether their calls go out under their own number. A flag rather than the
  // number itself: the app already knows the number, and this is the only bit
  // of it the UI has to render differently.
  callerIdVerified: Boolean(user?.verifiedCallerId),
  // The single thing the app has to check before offering to dial. Kept here so
  // the two halves of the rule — profile filled in, number verified — cannot
  // drift apart between the server and the client.
  canCall: canPlaceCalls(user),
})

/** True once the assistant has everything it needs to introduce itself. */
export const profileReady = (user) =>
  Boolean(user?.name?.trim()) && E164.test(user?.ownerPhone ?? '')

/**
 * The profile a given call runs under. Falls back to an empty one rather than
 * throwing: a call with no owner is a bug worth logging, not worth dropping the
 * line for.
 */
export function profileForCall(call) {
  const user = call?.userId ? getUser(call.userId) : null
  if (user) return profileOf(user)
  log.warn('profile', `call ${call?.id} has no owner; introducing nobody`)
  return { ownerName: '', ownerPhone: '', callerIdVerified: false }
}

/**
 * The number this call presents to whoever it dials — always the caller's own,
 * verified number.
 *
 * There is deliberately no fallback to the shared number. Calls go out as the
 * person they are for or they do not go out: a business that is rung by an
 * assistant should be able to ring back and reach a human, and an account that
 * has withdrawn its number has withdrawn its consent to be presented.
 *
 * Read from the account, never from the request. A `from` that a client could
 * influence is a number-spoofing service, and the verified list Twilio keeps is
 * account-wide — it would happily let one user present another's number.
 *
 * @returns the number, or null when this account may not place calls.
 */
export function fromNumberForCall(call) {
  const user = call?.userId ? getUser(call.userId) : null
  return user?.verifiedCallerId || null
}

/** True when this account has everything it needs to place a call at all. */
export const canPlaceCalls = (user) => profileReady(user) && Boolean(user?.verifiedCallerId)

/**
 * One-time migration. The single-user file, and the .env values behind it, are
 * handed to whoever signs in first — on a personal deployment that is the same
 * person whose details they already were.
 */
export function seedProfileFromLegacy(userId) {
  const user = getUser(userId)
  if (!user || user.name || user.ownerPhone) return false

  let legacy = null
  try {
    legacy = JSON.parse(readFileSync(LEGACY_FILE, 'utf8'))
  } catch {
    if (config.ownerName || config.ownerPhone) {
      legacy = { ownerName: config.ownerName, ownerPhone: config.ownerPhone }
    }
  }
  if (!legacy?.ownerName && !legacy?.ownerPhone) return false

  saveUserProfile(userId, { name: legacy.ownerName ?? '', ownerPhone: legacy.ownerPhone ?? '' })
  log.info('profile', `carried the existing details over to ${user.email || user.phone || userId}`)
  return true
}

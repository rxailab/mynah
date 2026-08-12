import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { config } from '../config.js'

/**
 * Asks Google whether a purchase token is real.
 *
 * The app's word is never enough: a purchase token is client-side data, and
 * credits landing on its say-so would make the shop free for anyone with a
 * rooted phone. So the server holds a service-account key and asks the Play
 * Developer API directly.
 *
 * Done with node:crypto and fetch rather than the googleapis SDK — that is
 * tens of megabytes of dependency for what is two HTTPS requests: sign a JWT,
 * trade it for a bearer token, look the purchase up.
 */

let fetchImpl = globalThis.fetch
/** Tests swap fetch out; nothing else should call this. */
export const _setFetchForTests = (fn) => { fetchImpl = fn ?? globalThis.fetch }

export const playConfigured = () =>
  Boolean(config.playPackageName && config.playServiceAccountFile)

let cachedKey = null
function serviceAccount() {
  if (!cachedKey) cachedKey = JSON.parse(readFileSync(config.playServiceAccountFile, 'utf8'))
  return cachedKey
}

const b64url = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

let cachedToken = null

/** OAuth for a server: a self-signed JWT, traded for a short-lived bearer token. */
async function accessToken(now = Date.now()) {
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token

  const key = serviceAccount()
  const iat = Math.floor(now / 1000)
  const unsigned =
    `${b64url({ alg: 'RS256', typ: 'JWT' })}.` +
    b64url({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: key.token_uri,
      iat,
      exp: iat + 3600,
    })
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key)
  const jwt = `${unsigned}.${signature.toString('base64url')}`

  const res = await fetchImpl(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Google would not issue a token: HTTP ${res.status}`)

  const body = await res.json()
  cachedToken = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 }
  return cachedToken.token
}

/**
 * Looks one in-app product purchase up.
 *
 * Distinguishes "Google says no" from "Google could not be asked": an invented
 * token comes back `{ok: false}` and should read as a refusal, while a network
 * or auth failure throws and should read as "try again", because the purchase
 * may be perfectly real.
 *
 * @returns {Promise<{ok: true, orderId: string} | {ok: false, reason: string}>}
 */
export async function verifyProductPurchase(productId, purchaseToken) {
  const token = await accessToken()
  const url =
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
    `${encodeURIComponent(config.playPackageName)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } })

  // What an invented or mismatched token looks like — a refusal, not an outage.
  if (res.status === 400 || res.status === 404) {
    return { ok: false, reason: 'Google has no record of that purchase.' }
  }
  if (!res.ok) throw new Error(`Google Play answered HTTP ${res.status}`)

  const purchase = await res.json()
  // purchaseState: 0 purchased, 1 cancelled, 2 pending (e.g. paying in cash at
  // a store later). Pending must not credit — the app is told to wait instead.
  if (purchase.purchaseState !== 0) {
    return { ok: false, reason: 'That purchase has not completed yet.' }
  }

  // Every real purchase has an order id; falling back to the token keeps the
  // idempotency key present even if Google ever omits one on a test purchase.
  return { ok: true, orderId: purchase.orderId || purchaseToken }
}

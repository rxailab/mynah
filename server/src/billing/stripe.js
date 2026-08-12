import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

/**
 * Stripe, by hand.
 *
 * Same reasoning as billing/play.js: this needs three things from Stripe —
 * create a Checkout Session, read a Price so the page can show it, and check
 * that a webhook really came from Stripe. All three are plain HTTPS and an
 * HMAC, so the SDK would be a dependency carried for the sake of three calls.
 *
 * Prices are deliberately not in this repository. A Price object in the Stripe
 * dashboard is the single place an amount is set, the same way the Play Console
 * is for the in-app packs — so a price change is a dashboard edit, not a
 * deploy, and the two can never disagree.
 */

const API = 'https://api.stripe.com/v1'

let fetchImpl = globalThis.fetch
/** Tests swap fetch out; nothing else should call this. */
export const _setFetchForTests = (fn) => { fetchImpl = fn ?? globalThis.fetch }

export const stripeConfigured = () =>
  Boolean(config.stripeSecretKey && config.stripePacks.length)

/** Stripe takes form encoding, including for nested fields like a[b][c]. */
function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') form(item, `${name}[${i}]`, out)
        else out.append(`${name}[${i}]`, String(item))
      })
    } else if (typeof value === 'object') {
      form(value, name, out)
    } else {
      out.append(name, String(value))
    }
  }
  return out
}

async function call(path, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      // Stripe retries are safe with this: a repeated create returns the
      // original session rather than a second one.
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? form(body) : undefined,
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(payload?.error?.message || `Stripe answered HTTP ${res.status}`)
  }
  return payload
}

/**
 * What one pack costs, as Stripe holds it. Cached because the top-up page asks
 * on every open and a price changes about once a year.
 *
 * @returns {Promise<{amount: number, currency: string}>} amount in the
 *   currency's smallest unit, which is what Stripe deals in.
 */
const priceCache = new Map()
export async function priceOf(priceId) {
  if (priceCache.has(priceId)) return priceCache.get(priceId)
  const price = await call(`/prices/${encodeURIComponent(priceId)}`)
  const value = { amount: price.unit_amount, currency: String(price.currency || '').toUpperCase() }
  priceCache.set(priceId, value)
  return value
}

/**
 * Which ways to pay this account can actually take.
 *
 * A capability is not the same thing as the switch in the dashboard: the
 * dashboard's payment method configuration will happily show WeChat Pay as
 * "on" while the account has never been granted `wechat_pay_payments`, and
 * Stripe then refuses the whole session. Asked once and cached, because it
 * changes about as often as the business does.
 *
 * Fails soft: an unreachable Stripe here must not stop somebody paying by card,
 * so an empty answer means "say nothing about it" rather than "nothing works".
 */
let capabilities = null
export async function activePaymentMethods() {
  if (capabilities) return capabilities
  try {
    const account = await call('/account')
    const active = Object.entries(account.capabilities || {})
      .filter(([, state]) => state === 'active')
      .map(([name]) => name)
    capabilities = {
      card: active.includes('card_payments'),
      wechatPay: active.includes('wechat_pay_payments'),
      alipay: active.includes('alipay_payments'),
    }
  } catch {
    capabilities = { card: false, wechatPay: false, alipay: false }
  }
  return capabilities
}

/**
 * Opens a hosted payment page for one pack.
 *
 * `client_reference_id` and the metadata carry who is buying: the webhook has
 * no session and no cookie, so this is the only thread back to an account.
 * Both are set — the reference id is what shows in the Stripe dashboard, the
 * metadata is what the webhook reads.
 *
 * The methods are Stripe's to choose. Naming them here — as this did, with
 * card, WeChat Pay and Alipay — turns one method the account has not been
 * granted into a 502 for all of them: Stripe rejects the session outright
 * rather than dropping the method it cannot do. Leaving the list out means the
 * page offers whatever the account is actually enabled for, and picks up a new
 * method the day it is granted without a deploy.
 *
 * The WeChat Pay option stays: it is required whenever that method is shown,
 * ignored when it is not, and this is the one place it would have to be added
 * back.
 */
export async function createCheckout({ userId, priceId, calls, token }) {
  const base = `https://${config.publicHost}`
  const session = await call('/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_options: { wechat_pay: { client: 'web' } },
      client_reference_id: userId,
      metadata: { userId, priceId, calls: String(calls) },
      // The token, not the account: this page may be open on a phone belonging
      // to whoever is paying, which is the point of being able to send it.
      success_url: `${base}/pay/${token}/done`,
      cancel_url: `${base}/pay/${token}`,
    },
  })
  return session.url
}

/**
 * A payment the app collects itself, without sending anybody to a browser.
 *
 * The amount is read from the Price rather than taken from the app: the app is
 * the thing being paid, and a client that names its own price is a shop with no
 * till. Same reason the webhook reads the pack out of config rather than out of
 * the metadata it rode in on.
 *
 * `source: app` marks these apart from the intents Stripe creates behind a
 * Checkout session. Both raise payment_intent.succeeded, and both would be
 * credited under different order ids — the session's and the intent's — which
 * is a double payout. The webhook only honours the ones marked here.
 *
 * @returns what PaymentSheet needs to open, and nothing more.
 */
export async function createPaymentIntent({ userId, priceId, calls }) {
  const price = await priceOf(priceId)
  const intent = await call('/payment_intents', {
    method: 'POST',
    body: {
      amount: price.amount,
      currency: price.currency.toLowerCase(),
      // Lets the dashboard decide what to offer — cards, WeChat Pay, Alipay —
      // rather than hard-coding a list here that drifts from what is enabled.
      automatic_payment_methods: { enabled: true },
      metadata: { userId, priceId, calls: String(calls), source: 'app' },
    },
  })
  return {
    clientSecret: intent.client_secret,
    publishableKey: config.stripePublishableKey,
    amount: price.amount,
    currency: price.currency,
  }
}

/**
 * Confirms a webhook came from Stripe and has not been replayed.
 *
 * The signature is over `timestamp.rawBody`, so the body has to be the exact
 * bytes Stripe sent — re-serialising parsed JSON produces a different string
 * and fails every time. That is why the webhook route is mounted ahead of the
 * JSON body parser.
 *
 * @returns the parsed event, or null when it cannot be trusted.
 */
export function verifyWebhook(rawBody, signatureHeader, now = Date.now()) {
  const parts = Object.fromEntries(
    String(signatureHeader ?? '')
      .split(',')
      .map((pair) => pair.split('=', 2))
      .filter((pair) => pair.length === 2),
  )
  const timestamp = Number(parts.t)
  if (!timestamp || !parts.v1) return null

  // Five minutes, Stripe's own recommendation. Without it a signature stays
  // valid forever and a captured request can be replayed back at us.
  if (Math.abs(now / 1000 - timestamp) > 300) return null

  const expected = createHmac('sha256', config.stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  const given = String(parts.v1)
  if (given.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null

  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

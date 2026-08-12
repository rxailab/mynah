// The web top-up path. The checks here are the ones that cost money or leak
// something when they break: a link that outlives its welcome or names the
// wrong account, a webhook anybody can forge, a payment credited twice, and a
// public page that says more about its holder than it needs to.
import { createHmac } from 'node:crypto'

process.env.PUBLIC_HOST = 'stripe-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.DB_FILE = ':memory:'
process.env.TRIAL_CALLS = '0'
process.env.STRIPE_SECRET_KEY = 'sk_test_notreal'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_notreal'
process.env.STRIPE_PACKS = 'price_test10:10,price_test30:30'
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_notreal'

await import('../src/index.js')
const { config } = await import('../src/config.js')
const credits = await import('../src/billing/credits.js')
const payLinks = await import('../src/billing/payLinks.js')
const stripe = await import('../src/billing/stripe.js')
const { signUp } = await import('./helpers.mjs')

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))

// The server is built never to die — it may be holding live calls, so it logs
// uncaught exceptions and keeps going. That is right for a server and wrong for
// a test: a throw in here would otherwise leave the process sitting there
// forever with the checks unprinted, which reads as a hang rather than a
// failure. This turns that back into a failure.
setTimeout(() => {
  console.error('\nRESULT: timed out — something above threw or never answered')
  process.exit(1)
}, 60_000).unref()

const { headers: auth, user } = await signUp(BASE, { name: 'Rui', ownerPhone: '+15005550001' })

const checks = []
const check = (label, ok) => checks.push([label, ok])

// Stripe's end, faked. Everything on this side of the wire is the real thing.
let lastCheckoutBody = null
stripe._setFetchForTests(async (url, options) => {
  const target = String(url)
  if (target.includes('/prices/')) {
    return { ok: true, status: 200, json: async () => ({ unit_amount: 999, currency: 'gbp' }) }
  }
  if (target.includes('/checkout/sessions')) {
    lastCheckoutBody = new URLSearchParams(options.body)
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
    }
  }
  return { ok: false, status: 404, json: async () => ({ error: { message: 'no' } }) }
})

// --- the link ----------------------------------------------------------------

const link = await fetch(`${BASE}/api/billing/link`, { method: 'POST', headers: auth })
const linkBody = await link.json()
check('the app can get a top-up link', link.status === 200)
check('and it points at this server', String(linkBody.url).startsWith(`https://${config.publicHost}/pay/`))

check(
  'a link cannot be had without signing in',
  (await fetch(`${BASE}/api/billing/link`, { method: 'POST' })).status === 401,
)

const token = String(linkBody.url).split('/pay/')[1]
check('the link names its own account', payLinks.userForPayLink(token) === user.id)
check('an invented token names nobody', payLinks.userForPayLink('not-a-real-token') === null)

// Thirty minutes, checked by asking as though it were later rather than by
// waiting for it. On its own link: reading an expired one sweeps the row away,
// the same lazy cleanup sessions do, so this would otherwise burn the token the
// rest of the file needs.
const doomed = payLinks.createPayLink(user.id)
check(
  'and a link is no good half an hour on',
  payLinks.userForPayLink(doomed, Date.now() + 31 * 60_000) === null,
)
check('the link in hand still works', payLinks.userForPayLink(token) === user.id)

// --- the page ----------------------------------------------------------------

const pageRes = await fetch(`${BASE}/pay/${token}`)
const html = await pageRes.text()
check('the page opens with no sign-in at all', pageRes.status === 200)
check('it lists what the packs cost, as Stripe holds it', html.includes('£9.99'))
check('and how many calls they buy', html.includes('10 calls'))
check('it says which account is being topped up', /Topping up/.test(html))

// Whoever holds this link may not be the account holder — a parent paying for
// somebody abroad is the case it exists for. It must say enough to be sure and
// no more.
check('but not the full address', !html.includes(user.email))
check('nor the name the assistant introduces', !html.includes('Rui'))
check('nor the number calls are handed over to', !html.includes('+15005550001'))

const stale = await fetch(`${BASE}/pay/not-a-real-token`)
check('a dead link explains itself rather than 500ing', stale.status === 404)
check('and says where to get a fresh one', /expired/i.test(await stale.text()))

// --- checkout ----------------------------------------------------------------

const started = await fetch(`${BASE}/pay/${token}/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ priceId: 'price_test10' }),
  redirect: 'manual',
})
check('paying sends the browser to Stripe', started.status === 303)
check('and to the session Stripe handed back', started.headers.get('location')?.includes('cs_test_1'))
check('the session says who it is for', lastCheckoutBody?.get('client_reference_id') === user.id)
check('and how many calls it buys', lastCheckoutBody?.get('metadata[calls]') === '10')
// Naming the methods is what this must not do. Asking for a method the account
// has not been granted — wechat_pay, on a UK account that never had the
// capability — makes Stripe refuse the whole session, so the payer gets a 502
// instead of the card payment that would have worked. Leaving the list out puts
// the choice where it belongs: whatever the account is actually enabled for.
const named = lastCheckoutBody ? [...lastCheckoutBody.keys()] : []
check(
  'the session does not name payment methods',
  !named.some((k) => k.startsWith('payment_method_types')),
)
check(
  'but still carries the WeChat Pay option for when it is granted',
  lastCheckoutBody?.get('payment_method_options[wechat_pay][client]') === 'web',
)

// The form is on a public page, so nothing in the body may decide what is sold.
const madeUp = await fetch(`${BASE}/pay/${token}/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ priceId: 'price_i_made_up' }),
  redirect: 'manual',
})
check('a price this server does not sell buys nothing', madeUp.status === 302)

// --- the webhook -------------------------------------------------------------

const sign = (body, at = Date.now()) => {
  const t = Math.floor(at / 1000)
  const v1 = createHmac('sha256', config.stripeWebhookSecret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}

const event = (overrides = {}) => JSON.stringify({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      client_reference_id: user.id,
      metadata: { userId: user.id, priceId: 'price_test10', calls: '10' },
      ...overrides,
    },
  },
})

const post = (body, signature) => fetch(`${BASE}/stripe/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(signature ? { 'Stripe-Signature': signature } : {}) },
  body,
})

check('an unsigned webhook is refused', (await post(event())).status === 400)
check(
  'so is one signed with the wrong secret',
  (await post(event(), `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`)).status === 400,
)

// A captured request must not work tomorrow.
const old = event()
check('and so is a signature from an hour ago', (await post(old, sign(old, Date.now() - 3600_000))).status === 400)
check('none of which credited anything', credits.balanceOf(user.id) === 0)

const paid = event()
check('a properly signed payment is accepted', (await post(paid, sign(paid))).status === 200)
check('and the calls land', credits.balanceOf(user.id) === 10)

// Stripe redelivers events it is unsure about, and the delayed methods report
// twice by design.
check('redelivering it is accepted', (await post(paid, sign(paid))).status === 200)
check('but pays out only once', credits.balanceOf(user.id) === 10)

// Started with a delayed method and not yet cleared. Its success comes later.
const pending = event({ id: 'cs_test_2', payment_status: 'unpaid' })
await post(pending, sign(pending))
check('a payment still clearing credits nothing yet', credits.balanceOf(user.id) === 10)

const cleared = JSON.stringify({
  type: 'checkout.session.async_payment_succeeded',
  data: {
    object: {
      id: 'cs_test_2',
      payment_status: 'paid',
      client_reference_id: user.id,
      metadata: { userId: user.id, priceId: 'price_test10', calls: '10' },
    },
  },
})
await post(cleared, sign(cleared))
check('and lands when it clears', credits.balanceOf(user.id) === 20)

// The metadata travelled through a browser, so how many calls a price buys is
// read back from config rather than believed.
const lying = JSON.stringify({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_3',
      payment_status: 'paid',
      client_reference_id: user.id,
      metadata: { userId: user.id, priceId: 'price_test10', calls: '99999' },
    },
  },
})
await post(lying, sign(lying))
check('a session claiming more calls than its pack gets the pack', credits.balanceOf(user.id) === 30)

const unknown = JSON.stringify({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_4',
      payment_status: 'paid',
      client_reference_id: user.id,
      metadata: { userId: user.id, priceId: 'price_never_heard_of' },
    },
  },
})
await post(unknown, sign(unknown))
check('and a price this server never sold credits nothing', credits.balanceOf(user.id) === 30)

// --- paying inside the app ---------------------------------------------------
// The same money by a different door: no browser, Stripe's own sheet. The
// dangerous part is that a Checkout session ALSO raises payment_intent
// .succeeded for the intent behind it — crediting both would pay out twice
// under two different order ids.

let lastIntentBody = null
const priorFetch = stripe._setFetchForTests
stripe._setFetchForTests(async (url, options) => {
  const target = String(url)
  if (target.includes('/prices/')) {
    return { ok: true, status: 200, json: async () => ({ unit_amount: 999, currency: 'gbp' }) }
  }
  if (target.includes('/payment_intents')) {
    lastIntentBody = new URLSearchParams(options.body)
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'pi_test_1', client_secret: 'pi_test_1_secret_abc' }),
    }
  }
  return { ok: false, status: 404, json: async () => ({ error: { message: 'no' } }) }
})

const askIntent = (priceId) => fetch(`${BASE}/api/billing/stripe/intent`, {
  method: 'POST', headers: auth, body: JSON.stringify({ priceId }),
})
const intent = await askIntent('price_test10')
const intentBody = await intent.json()
check('the app can open a payment', intent.status === 200)
check('and gets what the sheet needs', Boolean(intentBody.clientSecret))
check('with the publishable key alongside it', intentBody.publishableKey === 'pk_test_notreal')
check('the amount comes from the Price, not the app', lastIntentBody?.get('amount') === '999')
check('and it is marked as ours', lastIntentBody?.get('metadata[source]') === 'app')

check(
  'a pack this server does not sell is refused',
  (await askIntent('price_invented')).status === 400,
)

const beforeIntent = credits.balanceOf(user.id)
const appPaid = JSON.stringify({
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_test_1',
      metadata: { userId: user.id, priceId: 'price_test10', calls: '10', source: 'app' },
    },
  },
})
await post(appPaid, sign(appPaid))
check('an in-app payment credits the account', credits.balanceOf(user.id) === beforeIntent + 10)

await post(appPaid, sign(appPaid))
check('and only once when redelivered', credits.balanceOf(user.id) === beforeIntent + 10)

// The intent Stripe creates behind a Checkout session. Already paid out under
// the session's id, so this must be ignored rather than paid again.
const behindCheckout = JSON.stringify({
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_behind_checkout',
      metadata: { userId: user.id, priceId: 'price_test10', calls: '10' },
    },
  },
})
await post(behindCheckout, sign(behindCheckout))
check(
  'the intent behind a Checkout session is not paid out twice',
  credits.balanceOf(user.id) === beforeIntent + 10,
)

// --- closing the account ------------------------------------------------------

const closing = await signUp(BASE)
const closingLink = await (await fetch(`${BASE}/api/billing/link`, {
  method: 'POST', headers: closing.headers,
})).json()
const closingToken = String(closingLink.url).split('/pay/')[1]
check('their link works while the account does', payLinks.userForPayLink(closingToken) === closing.user.id)

await fetch(`${BASE}/api/auth/me`, { method: 'DELETE', headers: closing.headers })
check('and dies with it', payLinks.userForPayLink(closingToken) === null)

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the web top-up path holds' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

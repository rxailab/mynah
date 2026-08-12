import express from 'express'
import { getUser } from '../accounts.js'
import { balanceOf } from '../billing/credits.js'
import { userForPayLink } from '../billing/payLinks.js'
import { activePaymentMethods, createCheckout, priceOf, stripeConfigured } from '../billing/stripe.js'
import { config } from '../config.js'
import { log } from '../log.js'

/**
 * The top-up page: a public URL, reachable by whoever holds the link.
 *
 * Public because the person paying may not be the person with the account —
 * a parent buying calls for someone abroad is a case this is specifically for.
 * So the page shows a masked handle and a price list and nothing else: enough
 * to be sure you are crediting the right person, nothing that describes them.
 *
 * No session, no cookie, no sign-in. The link is the credential, it lasts
 * thirty minutes, and all it can do is add calls to one account.
 */
export const pay = express.Router()

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** `r.xia2@lancaster.ac.uk` → `r.x…@lancaster.ac.uk`; `+447700900123` → `+4477…0123`. */
function mask(user) {
  const email = user?.email
  if (email) {
    const [name, domain] = email.split('@')
    return `${name.slice(0, Math.min(3, name.length))}…@${domain}`
  }
  const phone = user?.phone || user?.ownerPhone
  if (phone) return `${phone.slice(0, 5)}…${phone.slice(-4)}`
  return 'your account'
}

const money = (amount, currency) => {
  const symbol = { GBP: '£', USD: '$', EUR: '€', CNY: '¥' }[currency] || ''
  const value = (amount / 100).toFixed(2)
  return symbol ? `${symbol}${value}` : `${value} ${currency}`
}

/** Resolves the link, or renders the one page that says it has expired. */
function holderOf(req, res) {
  const userId = userForPayLink(req.params.token)
  const user = userId ? getUser(userId) : null
  if (!user) {
    res.status(404).type('html').send(page({
      title: 'This link has expired',
      body:
        '<p>Top-up links last thirty minutes, so this one is no longer good. ' +
        'Open <b>Plan and usage</b> in the app and tap <b>Other ways to pay</b> ' +
        'for a fresh one.</p>',
    }))
    return null
  }
  return user
}

/**
 * What to promise, in the sentence above the packs.
 *
 * Read from the account rather than written down: this page used to say "card,
 * WeChat Pay or Alipay" whatever the account could take, which was a promise
 * the checkout then broke. Says nothing at all when Stripe cannot be asked —
 * an unproven claim is worse than none.
 */
async function waysToPay() {
  const methods = await activePaymentMethods()
  const names = [
    methods.card && 'card',
    methods.wechatPay && 'WeChat Pay',
    methods.alipay && 'Alipay',
  ].filter(Boolean)
  if (names.length === 0) return ''
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return `Pay by ${list}.`
}

pay.get('/:token', wrap(async (req, res) => {
  const user = holderOf(req, res)
  if (!user) return

  if (!stripeConfigured()) {
    return res.status(503).type('html').send(page({
      title: 'Not open yet',
      body: '<p>Card payment is not switched on for this server yet. Nothing has been charged.</p>',
    }))
  }

  // Prices come from Stripe, never from here. A pack whose price cannot be
  // read is left out rather than shown at a guess.
  const packs = []
  for (const pack of config.stripePacks) {
    try {
      const price = await priceOf(pack.priceId)
      packs.push({ ...pack, label: money(price.amount, price.currency) })
    } catch (err) {
      log.error('billing', `could not read the price of ${pack.priceId}`, err.message)
    }
  }

  const rows = packs.map((pack) => `
    <form method="post" action="/pay/${escape(req.params.token)}/checkout">
      <input type="hidden" name="priceId" value="${escape(pack.priceId)}">
      <button type="submit">
        <span class="calls">${pack.calls} calls</span>
        <span class="price">${escape(pack.label)}</span>
      </button>
    </form>`).join('')

  res.type('html').send(page({
    title: 'Add calls',
    body: `
      <p class="who">Topping up <b>${escape(mask(user))}</b> — ${balanceOf(user.id)} calls left.</p>
      ${rows || '<p>No top-ups are available just now.</p>'}
      <p class="fine">${escape(await waysToPay())} One call is one conversation:
      if nobody answers, the call stays on the account. Calls do not expire.</p>`,
  }))
}))

pay.post('/:token/checkout', express.urlencoded({ extended: false }), wrap(async (req, res) => {
  const user = holderOf(req, res)
  if (!user) return

  // Only a pack this server sells, and at the price Stripe holds for it — the
  // form is on a public page, so nothing in the body decides what anything
  // costs or how many calls it buys.
  const pack = config.stripePacks.find((p) => p.priceId === String(req.body?.priceId ?? ''))
  if (!pack) return res.redirect(`/pay/${req.params.token}`)

  try {
    const url = await createCheckout({
      userId: user.id,
      priceId: pack.priceId,
      calls: pack.calls,
      token: req.params.token,
    })
    res.redirect(303, url)
  } catch (err) {
    log.error('billing', 'could not open a checkout session', err.message)
    res.status(502).type('html').send(page({
      title: 'Could not reach the payment page',
      body: '<p>Nothing has been charged. Go back and try again in a moment.</p>',
    }))
  }
}))

/**
 * Where Stripe sends the payer afterwards. Deliberately says the balance will
 * arrive rather than showing it: the credits land on the webhook, which can be
 * a second behind this redirect, and with WeChat Pay or Alipay can be longer.
 * A page that showed a stale balance would read as the payment having failed.
 */
pay.get('/:token/done', (req, res) => {
  const user = holderOf(req, res)
  if (!user) return
  res.type('html').send(page({
    title: 'Paid — thank you',
    body:
      '<p>The calls are being added to the account now. They usually appear within a few ' +
      'seconds; with WeChat Pay or Alipay it can take a little longer.</p>' +
      '<p>You can close this page. Pull down on <b>Plan and usage</b> in the app to refresh.</p>',
  }))
})

/** The legal pages' shell, so a link out of the app lands somewhere familiar. */
const page = ({ title, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Mynah</title>
<style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body {
    margin: 0; padding: 40px 22px 72px; background: #E8EBE6; color: #0E0F0C;
    font: 400 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 30px 24px 32px }
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -.4px; margin: 0 0 14px }
  p { margin: 0 0 14px; color: #454745 }
  b { color: #0E0F0C; font-weight: 600 }
  .who { font-size: 15px; margin-bottom: 20px }
  form { margin: 0 0 10px }
  button {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: #9FE870; color: #163300; border: 0; border-radius: 14px;
    padding: 16px 18px; font: inherit; font-weight: 700; cursor: pointer;
  }
  button:hover { background: #8FDC5C }
  .price { font-variant-numeric: tabular-nums }
  .fine { font-size: 13px; color: #868685; margin-top: 20px }
  footer { max-width: 420px; margin: 18px auto 0; font-size: 13px; color: #868685; text-align: center }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  ${body}
</main>
<footer>Mynah</footer>
</body>
</html>`

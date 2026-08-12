import express from 'express'
import { config } from '../config.js'
import { log } from '../log.js'
import { balanceOf, grantCredits } from '../billing/credits.js'
import { createPayLink } from '../billing/payLinks.js'
import { playConfigured, verifyProductPurchase } from '../billing/play.js'
import { createPaymentIntent, stripeConfigured } from '../billing/stripe.js'

export const billing = express.Router()

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

/**
 * A link to the web top-up page, good for thirty minutes and for this account
 * only. The app opens it in a browser, or hands it to somebody else to pay —
 * see billing/payLinks.js for why that is a feature and what it deliberately
 * does not carry.
 */
/**
 * Opens a payment the app collects itself, so nobody has to leave for a
 * browser. The link route below stays: it is the only way somebody else can pay
 * on your behalf, and the only route that costs no store fee.
 */
billing.post('/stripe/intent', wrap(async (req, res) => {
  if (!stripeConfigured() || !config.stripePublishableKey) {
    return res.status(503).json({ error: 'In-app payment is not switched on for this server yet.' })
  }
  const pack = config.stripePacks.find((p) => p.priceId === String(req.body?.priceId ?? ''))
  if (!pack) return res.status(400).json({ error: 'That is not a pack this server sells.' })

  try {
    res.json(await createPaymentIntent({
      userId: req.user.id,
      priceId: pack.priceId,
      calls: pack.calls,
    }))
  } catch (err) {
    log.error('billing', 'could not open a payment', err.message)
    res.status(502).json({ error: `Stripe would not start the payment: ${err.message}` })
  }
}))

billing.post('/link', (req, res) => {
  if (!stripeConfigured()) {
    return res.status(503).json({ error: 'Card payment is not switched on for this server yet.' })
  }
  const token = createPayLink(req.user.id)
  log.info('billing', `issued a top-up link to ${req.user.id}`)
  res.json({ url: `https://${config.publicHost}/pay/${token}` })
})

/**
 * The app has just bought a pack and holds Google's purchase token to show for
 * it. Credits land only after this server has asked Google that the token is
 * real — see billing/play.js for why the app's word is not taken.
 *
 * The app consumes the purchase only after this answers ok, so a crash between
 * paying and delivering is retried on next launch — which is exactly why the
 * grant is idempotent by order id: the retry must find its credits already
 * there, not mint them again.
 */
billing.post('/play/verify', wrap(async (req, res) => {
  const productId = String(req.body?.productId ?? '').trim()
  const purchaseToken = String(req.body?.purchaseToken ?? '').trim()

  const pack = config.playPacks.find((p) => p.productId === productId)
  if (!pack || !purchaseToken) {
    return res.status(400).json({ error: 'That is not a product this server sells.' })
  }
  if (!playConfigured()) {
    return res.status(503).json({ error: 'Purchases are not switched on for this server yet.' })
  }

  let verdict
  try {
    verdict = await verifyProductPurchase(productId, purchaseToken)
  } catch (err) {
    log.error('billing', 'could not verify a purchase with Google', err.message)
    return res.status(502).json({
      error: `Google could not confirm the purchase just now: ${err.message}. ` +
        'Nothing is lost — the app retries delivery on its next launch.',
    })
  }
  if (!verdict.ok) {
    log.warn('billing', `refused a purchase claim from ${req.user.id}: ${verdict.reason}`)
    return res.status(409).json({ error: verdict.reason })
  }

  const { granted } = grantCredits(req.user.id, {
    kind: 'pack',
    calls: pack.calls,
    note: productId,
    orderId: verdict.orderId,
  })
  res.json({ ok: true, granted, calls: pack.calls, balance: balanceOf(req.user.id) })
}))

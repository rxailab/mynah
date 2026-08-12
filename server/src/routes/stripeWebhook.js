import express from 'express'
import { balanceOf, grantCredits } from '../billing/credits.js'
import { verifyWebhook } from '../billing/stripe.js'
import { config } from '../config.js'
import { log } from '../log.js'

/**
 * Where credits actually land.
 *
 * Not the browser redirect after paying — that is a page the payer can reload,
 * bookmark or never reach at all if they close the tab, and it says nothing
 * about whether money moved. Stripe's webhook is the only account of that, and
 * it is verified before anything is written.
 *
 * `express.raw` is mounted here rather than JSON because the signature is over
 * the exact bytes Stripe sent. This router therefore has to go on before the
 * app-wide JSON parser in index.js — see the note there.
 */
export const stripeWebhook = express.Router()

stripeWebhook.post('/webhook', express.raw({ type: 'application/json', limit: '256kb' }), (req, res) => {
  if (!config.stripeWebhookSecret) return res.status(503).end()

  const event = verifyWebhook(req.body?.toString('utf8') ?? '', req.get('stripe-signature'))
  if (!event) {
    log.warn('billing', 'rejected a Stripe webhook with a bad or stale signature')
    return res.status(400).end()
  }

  // A payment the app collected itself, with its own sheet. Handled apart from
  // the Checkout events below because a Checkout session raises this one too,
  // for the intent sitting behind it — crediting both would pay out twice under
  // two different order ids. Only intents this server opened carry source=app.
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data?.object ?? {}
    if (intent.metadata?.source !== 'app') return res.json({ received: true })
    grantForPack(intent.metadata?.userId, intent.metadata?.priceId, intent.id, 'in-app')
    return res.json({ received: true })
  }

  // Cards complete inline; WeChat Pay and Alipay can take minutes and arrive as
  // the delayed event instead. Both mean the same thing, so both are handled —
  // and the ledger's order-id rule means a session that somehow reports twice
  // is still only paid out once.
  const interesting = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
  if (!interesting.includes(event.type)) return res.json({ received: true })

  const session = event.data?.object ?? {}
  // The one event that carries a session which has not been paid for: a delayed
  // method that was started and has not cleared. Its success arrives later as
  // async_payment_succeeded.
  if (session.payment_status !== 'paid') {
    log.info('billing', `checkout ${session.id} is ${session.payment_status}; waiting`)
    return res.json({ received: true })
  }

  grantForPack(
    session.metadata?.userId || session.client_reference_id,
    session.metadata?.priceId,
    session.id,
    'checkout',
  )
  res.json({ received: true })
})

/**
 * Puts the pack's calls on the account, once per order id.
 *
 * The pack is looked up in config from the price id rather than read out of the
 * metadata's `calls`: that number travelled through a browser or a phone, and
 * how many calls a price buys is this server's to decide, not the payer's.
 */
function grantForPack(userId, priceId, orderId, via) {
  const pack = config.stripePacks.find((p) => p.priceId === priceId)
  if (!userId || !pack) {
    // Logged and accepted. Stripe retries a failure for days, and no amount of
    // retrying will make a payment name an account it never named.
    log.error('billing', `${via} ${orderId} succeeded but names no account or pack`)
    return
  }

  const { granted } = grantCredits(userId, {
    kind: 'stripe',
    calls: pack.calls,
    note: pack.priceId,
    orderId,
  })
  log.info(
    'billing',
    granted
      ? `${pack.calls} call(s) paid for by ${userId} via Stripe (${via}); balance ${balanceOf(userId)}`
      : `${via} ${orderId} was already credited`,
  )
}

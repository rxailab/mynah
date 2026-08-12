import { config } from '../config.js'
import { log } from '../log.js'
import { callsAwaitingCost, updateCall } from '../store.js'
import { fetchCallRecord } from './client.js'

/**
 * Twilio rates a call minutes to hours after it ends, so the price cannot be
 * captured at hangup. This asks again on a slow clock until it lands, then
 * stores it on the call for the app to show.
 *
 * Only the voice leg is on the call record. ConversationRelay — the speech in
 * and out, which is the larger half of the bill — is charged at account level
 * with no per-call price to fetch, so it is worked out from the duration and
 * added on. That makes the total an estimate, and the fields below keep the two
 * apart so nothing has to pretend otherwise: `voice` is what Twilio actually
 * charged, `relay` is arithmetic.
 */
export function startCostPoller() {
  const tick = async () => {
    for (const call of callsAwaitingCost()) {
      try {
        const rec = await fetchCallRecord(call.twilioSid)
        if (rec.price == null) continue

        // Twilio reports charges as negative amounts.
        const voice = Math.abs(Number(rec.price))
        const seconds = rec.durationSeconds ?? 0
        // Per second rather than rounded up to the minute: this is an estimate,
        // and inventing a rounding rule Twilio has not published would make it
        // wrong in a way that looks precise.
        const relay = (seconds / 60) * config.relayCostPerMinute

        updateCall(call.id, {
          cost: {
            price: (voice + relay).toFixed(4),
            voice: voice.toFixed(4),
            relay: relay.toFixed(4),
            // The total is part measured, part worked out. Anything showing it
            // should say so rather than calling it the bill.
            estimated: true,
            unit: (rec.priceUnit || '').toUpperCase(),
            durationSeconds: seconds,
          },
        })
        log.info(
          'costs',
          `call ${call.id}: voice ${voice.toFixed(4)} + relay ~${relay.toFixed(4)} ` +
            `${rec.priceUnit} over ${seconds}s`,
        )
      } catch (err) {
        log.warn('costs', `could not fetch the price of ${call.twilioSid}: ${err.message}`)
      }
    }
  }

  // unref() so a test process that booted the server can still exit cleanly.
  setTimeout(tick, 5 * 60 * 1000).unref()
  setInterval(tick, 10 * 60 * 1000).unref()
}

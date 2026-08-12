import twilio from 'twilio'
import { config, usingApiKey } from '../config.js'
import { log } from '../log.js'
import { fromNumberForCall } from '../profile.js'
import { relayTwiml, transferTwiml } from './twiml.js'

const opts = {}
if (config.twilioRegion) opts.region = config.twilioRegion
if (config.twilioEdge) opts.edge = config.twilioEdge

export const rest = usingApiKey()
  ? twilio(config.twilioApiKeySid, config.twilioApiKeySecret, { ...opts, accountSid: config.twilioAccountSid })
  : twilio(config.twilioAccountSid, config.twilioAuthToken, opts)

log.info(
  'twilio',
  `authenticating with ${usingApiKey() ? 'an API Key' : 'the account Auth Token'}` +
    ` in region ${config.twilioRegion || 'us1 (default)'}`,
)

export async function placeCall(call) {
  const from = fromNumberForCall(call)
  // The last line of defence. The API refuses this long before we get here, so
  // reaching it means a code path found a way to dial without a verified
  // number — better to fail loudly than to quietly fall back to a shared one.
  if (!from) {
    throw new Error(
      'This account has no verified caller ID, so there is no number to call from.',
    )
  }

  const params = {
    to: call.phoneNumber,
    from,
    twiml: relayTwiml(call),
    record: config.recordCalls,
  }

  // Twilio signs status webhooks with the account Auth Token, so without one we
  // cannot verify they are genuine. Rather than expose an unauthenticated
  // endpoint, don't ask for the callbacks at all — the relay socket already
  // tells us how the call is going.
  if (config.twilioAuthToken) {
    params.statusCallback = `https://${config.publicHost}/twilio/status?ref=${encodeURIComponent(call.id)}`
    params.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed']
    params.statusCallbackMethod = 'POST'
  }

  const created = await rest.calls.create(params)
  log.info('twilio', `dialing ${call.phoneNumber} as ${from}`, created.sid)
  return created.sid
}

/** Redirects the in-progress call into a bridge with the account holder. */
export async function transferToOwner(call, reason, language = 'en') {
  await rest.calls(call.twilioSid).update({ twiml: transferTwiml(call, reason, language) })
  log.info('twilio', `transferred ${call.twilioSid} to the account holder`)
}

/** The rated price lands on the call record minutes to hours after it ends. */
export async function fetchCallRecord(sid) {
  const c = await rest.calls(sid).fetch()
  return {
    price: c.price,
    priceUnit: c.priceUnit,
    durationSeconds: Number(c.duration || 0),
    status: c.status,
  }
}

export async function hangUp(sid) {
  try {
    await rest.calls(sid).update({ status: 'completed' })
  } catch (err) {
    // Already over: Twilio 404s once the call has left the active set.
    if (err?.status !== 404) throw err
  }
}

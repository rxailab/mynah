import { config } from '../config.js'
import { rest } from './client.js'

/**
 * Phone sign-in, via Twilio Verify.
 *
 * Verify is a separate product from Programmable Voice and needs its own
 * Service SID, so this is off unless one is configured. Note that the number
 * used for calls does not need SMS capability — Verify sends from its own
 * pool — but the Verify service still has to exist on the account.
 */
export const verifyAvailable = () => Boolean(config.twilioVerifyServiceSid)

export async function sendVerification(phone) {
  await rest.verify.v2
    .services(config.twilioVerifyServiceSid)
    .verifications.create({ to: phone, channel: 'sms' })
}

/** @returns true only on Twilio's own "approved". */
export async function checkVerification(phone, code) {
  const check = await rest.verify.v2
    .services(config.twilioVerifyServiceSid)
    .verificationChecks.create({ to: phone, code })
  return check.status === 'approved'
}

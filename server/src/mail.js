import { config } from './config.js'
import { log } from './log.js'

/**
 * Sending one kind of email: a six-digit code, to an address that asked for it.
 *
 * Over the provider's HTTPS API rather than SMTP, for the same reason play.js
 * and stripe.js talk HTTP — one POST needs no dependency, whereas SMTP needs a
 * client library. Resend's shape is the one implemented; swapping to Postmark
 * or SendGrid is this one function, because nothing else in the codebase knows
 * an email exists.
 *
 * With no key configured the code is written to the log instead. That is a
 * development convenience and a deliberate one — the alternative is a reset
 * flow that silently succeeds and delivers nothing — so it also refuses to
 * claim it sent anything: see `delivered` in the return, which the route uses
 * to tell the person to check the server log rather than their inbox.
 */

let fetchImpl = globalThis.fetch
/** Tests swap fetch out; nothing else should call this. */
export const _setFetchForTests = (fn) => { fetchImpl = fn ?? globalThis.fetch }

export const mailConfigured = () => Boolean(config.mailApiKey && config.mailFrom)

/**
 * @returns {Promise<{delivered: boolean}>} false when there is no mail provider
 *   and the code went to the log instead.
 */
export async function sendResetCode(to, code) {
  if (!mailConfigured()) {
    log.warn(
      'mail',
      `no mail provider configured — the reset code for ${to} is ${code}. ` +
        'Set MAIL_API_KEY and MAIL_FROM to send this properly.',
    )
    return { delivered: false }
  }

  const res = await fetchImpl(config.mailApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mailApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [to],
      subject: `${code} is your Mynah code`,
      // Both parts, because a text-only email is treated as suspicious by some
      // filters and an HTML-only one is unreadable in the clients that refuse
      // to render it.
      text:
        `${code} is your code for resetting your Mynah password. It is good for ` +
        `10 minutes.\n\nIf you did not ask for this, nothing has changed and you ` +
        `can ignore this email.`,
      html:
        `<p style="font:400 16px/1.6 system-ui,sans-serif;color:#0E0F0C">` +
        `Your code for resetting your Mynah password:</p>` +
        `<p style="font:800 34px/1.2 system-ui,sans-serif;letter-spacing:6px;color:#0E0F0C">${code}</p>` +
        `<p style="font:400 14px/1.6 system-ui,sans-serif;color:#454745">` +
        `It is good for 10 minutes. If you did not ask for this, nothing has ` +
        `changed and you can ignore this email.</p>`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`the mail provider answered HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return { delivered: true }
}

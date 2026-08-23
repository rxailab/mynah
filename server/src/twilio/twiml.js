import { config, relayUrl } from '../config.js'
import { profileForCall } from '../profile.js'

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const attrs = (pairs) =>
  Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ')

/**
 * Hands the live call to ConversationRelay, which does speech-to-text and
 * text-to-speech and talks to our WebSocket in plain text.
 */
export function relayTwiml(call) {
  // The line's language follows the callee, not the app: a Manchester
  // restaurant is called in English however the phone is set.
  //
  // Deliberately NO welcomeGreeting here. Twilio starts this TwiML on the
  // carrier's "answered" signal, which regularly fires before a human has
  // picked up — call screening, voicemail, and some networks answer at the
  // network level first. A TwiML greeting therefore plays into the void. The
  // session speaks the greeting itself, only once the far end actually says
  // something (src/relay/session.js).
  const zh = call.language === 'zh'
  const relay = attrs({
    url: relayUrl(call.id),
    ttsProvider: config.ttsProvider,
    voice: zh ? config.ttsVoiceZh : config.ttsVoice,
    ttsLanguage: zh ? config.ttsLanguageZh : config.ttsLanguage,
    transcriptionLanguage: zh ? config.transcriptionLanguageZh : config.transcriptionLanguage,
    interruptible: 'true',
    dtmfDetection: 'true',
    reportInputDuringAgentSpeech: 'true',
  })

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><ConversationRelay ${relay}/></Connect></Response>`
}

/**
 * Hands the live call to the account holder, and keeps a way back.
 *
 * `<Dial>` is not a terminal verb: when the dialled party's leg ends, control
 * returns to the document. The first version of this had nothing after the
 * `<Dial>`, so the account holder hanging up ended the whole call — and getting
 * the assistant involved again meant redialling the business, queueing again,
 * and reaching a different agent who had never heard any of it. On a bank line
 * that is most of the call's cost paid twice.
 *
 * With an `action` URL, the same moment becomes a question we get to answer:
 * the business is still on the line, so we hand the leg back to the relay and
 * the assistant carries on. Nothing about the billing changes — no conference,
 * no third participant, nobody idling.
 *
 * The stretch in between is recorded because the assistant is not there to hear
 * it, and a call whose record has a hole in exactly the part where a person
 * agreed something is worse than no record. See the resume route for what is
 * and is not possible to do with it in time.
 */
export function transferTwiml(call, reason, language = 'en') {
  const { ownerPhone } = profileForCall(call)
  // No name here either — by this point the other party knows they are being
  // handed to a person, which is the part that matters to them.
  const zh = language === 'zh'
  const line = zh
    ? `我现在把本人接进来，请稍等。${reason ? ` ${reason}` : ''}`
    : `I'm bringing the account holder onto the line now. One moment.${reason ? ` ${reason}` : ''}`
  const ref = encodeURIComponent(call.id)
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say${zh ? ' language="zh-CN"' : ''}>${esc(line)}</Say>` +
    `<Dial ${attrs({
      callerId: config.twilioFromNumber,
      timeout: 30,
      action: `https://${config.publicHost}/twilio/after-handover?ref=${ref}`,
      method: 'POST',
      record: 'record-from-answer-dual',
      recordingStatusCallback: `https://${config.publicHost}/twilio/handover-recording?ref=${ref}`,
      recordingStatusCallbackEvent: 'completed',
    })}>` +
    // The child leg's SID arrives here, which is what lets the app end the
    // owner's leg on a button press rather than making them hang up on a call
    // they can hear is still running.
    `<Number ${attrs({
      statusCallback: `https://${config.publicHost}/twilio/owner-leg?ref=${ref}`,
      statusCallbackEvent: 'answered',
      statusCallbackMethod: 'POST',
    })}>${esc(ownerPhone)}</Number>` +
    `</Dial>` +
    `</Response>`
  )
}

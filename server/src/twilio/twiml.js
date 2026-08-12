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

/** Replaces whatever the call is doing with a bridge to the account holder. */
export function transferTwiml(call, reason, language = 'en') {
  const { ownerPhone } = profileForCall(call)
  // No name here either — by this point the other party knows they are being
  // handed to a person, which is the part that matters to them.
  const zh = language === 'zh'
  const line = zh
    ? `我现在把本人接进来，请稍等。${reason ? ` ${reason}` : ''}`
    : `I'm bringing the account holder onto the line now. One moment.${reason ? ` ${reason}` : ''}`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say${zh ? ' language="zh-CN"' : ''}>${esc(line)}</Say>` +
    `<Dial ${attrs({ callerId: config.twilioFromNumber, timeout: 30 })}>` +
    `<Number>${esc(ownerPhone)}</Number>` +
    `</Dial>` +
    `</Response>`
  )
}

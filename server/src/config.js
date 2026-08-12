import dotenv from 'dotenv'
import { log } from './log.js'

dotenv.config()

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())

/**
 * "calls10:10,calls30:30" → [{ id: 'calls10', calls: 10 }, …], under whichever
 * key the store in question calls its products.
 */
const parsePacks = (raw, key) =>
  String(raw)
    .split(',')
    .map((pair) => {
      const [id, calls] = pair.split(':').map((s) => s.trim())
      return { [key]: id, calls: Number(calls) }
    })
    .filter((p) => p[key] && Number.isInteger(p.calls) && p.calls > 0)

export const config = {
  port: Number(process.env.PORT || 8080),
  publicHost: (process.env.PUBLIC_HOST || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  appApiToken: process.env.APP_API_TOKEN || '',

  // Runware serves an OpenAI-compatible chat endpoint in front of ~36 models
  // from several vendors, so one key and one base URL covers all of them.
  runwareApiKey: process.env.RUNWARE_API_KEY || '',
  runwareBaseUrl: process.env.RUNWARE_BASE_URL || 'https://api.runware.ai/v1',
  model: process.env.LLM_MODEL || 'anthropic-claude-haiku-4-5',
  // Replies are one or two spoken sentences; this is a runaway guard, not a
  // target.
  maxTokens: Number(process.env.LLM_MAX_TOKENS || 1000),

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  // Twilio's recommended alternative to the account Auth Token. An API Key can
  // be revoked and reissued on its own, and is the way in if the Auth Token has
  // been rotated out from under you.
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID || '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  // Twilio credentials are only valid in the Region they were created in, so a
  // key made under "Ireland" will not authenticate against the default US1
  // endpoint. Leave blank for US1; set to ie1 or au1 to match your Console.
  twilioRegion: process.env.TWILIO_REGION || '',
  twilioEdge: process.env.TWILIO_EDGE || '',
  // Phone sign-in needs Twilio Verify, which is a separate product with its own
  // Service SID. Blank means the app hides the phone option rather than
  // offering something that cannot work.
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',

  // The number Twilio's caller-ID verification call comes from. Shown in the
  // app before the phone rings, so being wrong is worse than being absent: it
  // is a US number arriving unannounced at a UK phone, which is exactly what
  // people are told to ignore. Configurable so a change at Twilio's end is a
  // restart rather than an app release.
  callerIdVerifyFrom: process.env.CALLER_ID_VERIFY_FROM || '+14157234000',
  // Seconds Twilio waits before placing that call, so the code is on screen
  // first. Twilio's own default is 0.
  callerIdVerifyDelay: Number(process.env.CALLER_ID_VERIFY_DELAY || 12),

  // Google sign-in verifies the ID token against Google, so the server needs to
  // know which client it should have been issued for. Blank hides the option.
  //
  // Two of them, because Google issues an ID token to the client that asked for
  // it and the two apps cannot share one: an Android app signs in through a Web
  // client id, an iOS app through an iOS client id, and the `aud` claim comes
  // back different. Both are public identifiers from the same Cloud project, and
  // either may be blank — that only hides the button on that platform.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',

  ownerName: process.env.OWNER_NAME || '',
  ownerPhone: process.env.OWNER_PHONE || '',

  // --- email ------------------------------------------------------------------
  // Only ever used for one thing: the six-digit code that resets a forgotten
  // password. Blank and the app hides "forgot password" rather than offering a
  // link whose code has nowhere to go — and the code goes to the server log so
  // a self-hosted deployment can still get in. The default URL is Resend's;
  // any provider with a JSON send endpoint works by changing it and mail.js.
  mailApiKey: process.env.MAIL_API_KEY || '',
  mailApiUrl: process.env.MAIL_API_URL || 'https://api.resend.com/emails',
  // The From address, which the provider must have verified for your domain.
  mailFrom: process.env.MAIL_FROM || '',

  // Who is answerable for the service, and where to write. Both appear in the
  // published terms and privacy policy; Google Play will not accept a listing
  // whose policy has no way to contact anybody. Blank renders a visible
  // placeholder rather than quietly shipping a document with a hole in it.
  legalEntity: process.env.LEGAL_ENTITY || '',
  legalContactEmail: process.env.LEGAL_CONTACT_EMAIL || '',
  legalJurisdiction: process.env.LEGAL_JURISDICTION || '',

  // Blank means "let Twilio pick its default voice", which is the only setting
  // guaranteed to work without also choosing a provider-specific voice id.
  ttsProvider: process.env.TTS_PROVIDER || '',
  ttsVoice: process.env.TTS_VOICE || '',
  ttsLanguage: process.env.TTS_LANGUAGE || 'en-GB',
  transcriptionLanguage: process.env.TRANSCRIPTION_LANGUAGE || 'en-GB',
  // Used when a call's language is zh. Blank voice = the provider's default
  // for that language, which is the only value guaranteed to exist.
  ttsVoiceZh: process.env.TTS_VOICE_ZH || '',
  ttsLanguageZh: process.env.TTS_LANGUAGE_ZH || 'zh-CN',
  transcriptionLanguageZh: process.env.TRANSCRIPTION_LANGUAGE_ZH || 'zh-CN',

  recordCalls: bool(process.env.RECORD_CALLS, false),

  // What ConversationRelay costs per minute. Twilio puts the voice leg on the
  // call record but bills Relay at account level, so there is no per-call price
  // to fetch and it has to be worked out from the duration — and Relay is the
  // larger half of the bill, so leaving it out understates every call by about
  // 80%.
  //
  // MUST be expressed in the same currency Twilio bills this account in, which
  // is the currency the voice leg comes back in (GBP on a UK account). Twilio
  // lists Relay at $0.07/min; if the account is not billed in dollars this
  // needs converting, or the two halves cannot be added together.
  relayCostPerMinute: Number(process.env.RELAY_COST_PER_MINUTE || 0.07),

  // --- billing --------------------------------------------------------------
  // See billing/credits.js. Calls are paid for in credits; these settings say
  // how accounts get them.

  // Calls a new account can place before buying anything. One-time rather than
  // monthly — a recurring free allowance is a standing invitation to farm
  // accounts, and the caller-ID hurdle only raises the price of that.
  trialCalls: Number(process.env.TRIAL_CALLS || 3),

  // The in-app products the app may sell, as "productId:calls" pairs, e.g.
  // "calls10:10,calls30:30". Prices live in the Play Console — the only place
  // they can be set — so the server only needs to know what each id delivers.
  // Blank means nothing is for sale and the app hides the shop.
  playPacks: parsePacks(process.env.PLAY_PACKS || '', 'productId'),
  // The applicationId the packs belong to, e.g. com.voicecall.
  playPackageName: process.env.PLAY_PACKAGE_NAME || '',
  // Path to a Google service-account JSON key that may read this app's
  // purchases. Purchases are verified with Google before credits land; without
  // the key the verify endpoint refuses rather than taking the app's word.
  playServiceAccountFile: process.env.PLAY_SERVICE_ACCOUNT_FILE || '',

  // The second way to pay: a web page, opened from a link the app hands out.
  // It exists mostly for WeChat Pay and Alipay, which Play Billing cannot offer
  // on a UK account and which the people this is for actually use — and because
  // a link can be sent to whoever is paying, who is often not the account
  // holder. Blank hides it, and the app falls back to Play alone.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  // Handed to the app so it can open Stripe's own payment sheet in-app. Public
  // by design — it identifies the account and can do nothing on its own — which
  // is why it is served from here rather than built into the APK, the same
  // arrangement as GOOGLE_CLIENT_ID. Blank and the app falls back to the link.
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  // From the Stripe dashboard's webhook endpoint. Nothing is credited without
  // it: the redirect after paying proves nothing, the signed webhook does.
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // "priceId:calls" pairs. The amounts live on the Price objects in Stripe —
  // the one place a price is set, the same way the Play Console is for packs.
  stripePacks: parsePacks(process.env.STRIPE_PACKS || '', 'priceId'),

  // Live translation of the transcript into the other language of the pair, so
  // a bilingual owner can follow a call held in the language of the callee.
  // Entirely off the call path; turn it off to save the tokens.
  translateTranscript: bool(process.env.TRANSLATE_TRANSCRIPT, true),
  translationModel: process.env.TRANSLATION_MODEL || process.env.LLM_MODEL || 'anthropic-claude-haiku-4-5',

  // Hard ceiling on a single call. Two things can otherwise run the meter
  // indefinitely: a hold queue nobody ever answers, and the model occasionally
  // carrying on chatting instead of calling end_call.
  maxCallSeconds: Number(process.env.MAX_CALL_SECONDS || 600),

  // A separate, tighter ceiling on queueing. Hold is billed at the same rate as
  // conversation but is worth nothing, and a queue nobody ever answers is the
  // one way a call can spend the whole budget having achieved not a thing. The
  // assistant reports its own hold state (see the on_hold tool), so this counts
  // real queueing rather than silence.
  //
  // Ends the call politely and says how long it waited, so it can be redialled
  // — that is a better answer than a ten-minute call that cost money and ends
  // with nothing recorded.
  maxHoldSeconds: Number(process.env.MAX_HOLD_SECONDS || 300),
}

export const relayUrl = (ref) => `wss://${config.publicHost}/relay?ref=${encodeURIComponent(ref)}`

/** True when an API Key pair is configured, which takes precedence over the Auth Token. */
export const usingApiKey = () =>
  Boolean(config.twilioApiKeySid && config.twilioApiKeySecret)

/** The REST hostname for the configured Region, e.g. api.dublin.ie1.twilio.com. */
export const twilioApiHost = () =>
  ['api', config.twilioEdge, config.twilioRegion, 'twilio.com'].filter(Boolean).join('.')

/**
 * Fails loudly at boot rather than at 2am on a live call. Every value here is
 * required to place a single call end-to-end.
 */
/** Values shipped in .env.example. Left in place they boot fine and then fail
 *  on a live call, so treat them as unset. */
const PLACEHOLDERS = new Set(['your-subdomain.ngrok-free.app', '+441234567890'])

export function assertConfig() {
  // A pack whose id is not a Stripe price id can never be bought: the checkout
  // route will not find it and the webhook will not credit it. The shop still
  // shows it, so the failure is a customer pressing a button that does nothing
  // — worth a loud line at boot rather than a support message later. Warned
  // rather than fatal: the calls themselves are unaffected.
  for (const pack of config.stripePacks) {
    if (!pack.priceId.startsWith('price_')) {
      log.warn(
        'config',
        `STRIPE_PACKS has "${pack.priceId}", which is not a Stripe price id. ` +
          'Nobody will be able to buy that pack. Price ids start with "price_" and come ' +
          'from the price under a product in the Stripe dashboard.',
      )
    }
  }

  const required = [
    ['PUBLIC_HOST', config.publicHost],
    ['APP_API_TOKEN', config.appApiToken],
    ['RUNWARE_API_KEY', config.runwareApiKey],
    ['TWILIO_ACCOUNT_SID', config.twilioAccountSid],
    // Either credential style is fine; the API Key wins when both are present.
    ['TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID+SECRET', config.twilioAuthToken || (usingApiKey() ? 'set' : '')],
    ['TWILIO_FROM_NUMBER', config.twilioFromNumber],
    // OWNER_NAME and OWNER_PHONE are deliberately absent: they are set in the
    // app and stored in data/profile.json. These env vars only seed the first
    // run. A call is refused with a clear message if they are still missing.
  ]

  const missing = required.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy server/.env.example to server/.env and fill them in.`,
    )
  }

  const untouched = required.filter(([, value]) => PLACEHOLDERS.has(value)).map(([name]) => name)
  if (untouched.length) {
    throw new Error(
      `These are still set to the example placeholder values: ${untouched.join(', ')}. ` +
        `Replace them in server/.env with your own.`,
    )
  }

  if (config.publicHost.includes('localhost') || config.publicHost.startsWith('127.')) {
    throw new Error(
      `PUBLIC_HOST is "${config.publicHost}", which Twilio cannot reach. ` +
        `It must be a public hostname — run "ngrok http ${config.port}" and use the domain it prints.`,
    )
  }
}

/**
 * Pre-flight check. Verifies every credential and setting the server needs
 * before a call is placed, so problems surface here rather than as a dead line
 * or a cryptic carrier error mid-call.
 *
 *   npm run doctor
 */
import OpenAI from 'openai'
import { config, twilioApiHost, usingApiKey } from '../src/config.js'
import { profileReady } from '../src/profile.js'
import { listUsers } from '../src/accounts.js'

let failures = 0
let warnings = 0

const ok = (msg, detail) => console.log(`  ok    ${msg}${detail ? `  — ${detail}` : ''}`)
const warn = (msg, detail) => { warnings++; console.log(`  warn  ${msg}${detail ? `  — ${detail}` : ''}`) }
const bad = (msg, detail) => { failures++; console.log(`  FAIL  ${msg}${detail ? `  — ${detail}` : ''}`) }

const PLACEHOLDERS = new Set(['your-subdomain.ngrok-free.app', '+441234567890'])
const isSet = (v) => Boolean(v) && !PLACEHOLDERS.has(v)

console.log('\nSettings')
for (const [name, value] of [
  ['PUBLIC_HOST', config.publicHost],
  ['APP_API_TOKEN', config.appApiToken],
  ['TWILIO_FROM_NUMBER', config.twilioFromNumber],
]) {
  if (isSet(value)) ok(name)
  else bad(name, value ? 'still the example placeholder' : 'not set')
}

console.log('\nAccounts')
const users = listUsers()
if (users.length === 0) {
  bad('nobody has signed up yet', 'open the app and create an account; calls belong to an account')
} else {
  ok(`${users.length} account(s)`, users.map((u) => u.email || u.phone || u.id).join(', '))
  for (const u of users) {
    const who = u.email || u.phone || u.id
    if (profileReady(u)) ok(`  ${who}`, `${u.name} · ${u.ownerPhone}`)
    else {
      bad(`  ${who} has no name or number`,
        'open the app, go to You → your details. The assistant introduces itself with the name ' +
        'and dials the number to hand a call over')
    }
  }
}

console.log('\nWays to sign in')
ok('email and password', 'always available')
if (config.twilioVerifyServiceSid) ok('phone code', 'Twilio Verify configured')
else warn('phone code is off', 'set TWILIO_VERIFY_SERVICE_SID to a Twilio Verify service to enable it')
if (config.googleClientId) ok('Google', config.googleClientId.slice(0, 24) + '…')
else warn('Google is off', 'set GOOGLE_CLIENT_ID to enable it')

console.log('\nRunware')
if (!config.runwareApiKey) {
  bad('RUNWARE_API_KEY', 'not set')
} else {
  try {
    const client = new OpenAI({ apiKey: config.runwareApiKey, baseURL: config.runwareBaseUrl })
    const { data } = await client.models.list()
    const ids = data.map((m) => m.id)
    ok('key works', `${ids.length} models reachable`)
    if (ids.includes(config.model)) ok(`model ${config.model} is available`)
    else bad(`model ${config.model} is not in the list`, 'run: npm run models')
  } catch (err) {
    bad('key rejected', err.message)
  }
}

console.log('\nTwilio')
const keyMode = usingApiKey()
const user = keyMode ? config.twilioApiKeySid : config.twilioAccountSid
const pass = keyMode ? config.twilioApiKeySecret : config.twilioAuthToken

if (!config.twilioAccountSid) {
  bad('credentials', 'TWILIO_ACCOUNT_SID not set')
} else if (!pass) {
  bad('credentials', 'set either TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET')
} else if (!/^AC[0-9a-f]{32}$/i.test(config.twilioAccountSid)) {
  bad('TWILIO_ACCOUNT_SID', 'should be "AC" followed by 32 hex characters')
} else if (keyMode && !/^SK[0-9a-f]{32}$/i.test(config.twilioApiKeySid)) {
  bad('TWILIO_API_KEY_SID', 'should be "SK" followed by 32 hex characters')
} else {
  console.log(`  using ${keyMode ? 'API Key ' + config.twilioApiKeySid.slice(0, 8) + '…' : 'the account Auth Token'}`)
  if (keyMode && !config.twilioAuthToken) {
    warn('no Auth Token alongside the API Key',
      'status webhooks will be skipped, because Twilio signs them with the Auth Token and they could not be verified')
  }
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
  const host = twilioApiHost()
  console.log(`  region ${config.twilioRegion || 'us1 (default)'} — talking to ${host}`)
  const call = (path) =>
    fetch(`https://${host}/2010-04-01/Accounts/${config.twilioAccountSid}${path}`, {
      headers: { Authorization: auth },
    })

  try {
    const res = await call('.json')
    if (res.status === 401) {
      bad('credentials rejected (HTTP 401)', keyMode
        ? 'the API Key secret is wrong, or the key was created in a different Region'
        : 'the Auth Token is wrong, has been rotated, or belongs to a different Region')
      console.log('        Two things cause this. First, credentials are only valid in the Region')
      console.log(`        they were created in — this check used ${host}, so if your`)
      console.log('        Console Region selector says Ireland or Australia, set TWILIO_REGION')
      console.log('        to ie1 or au1 and try again. The Console shows a different Auth Token')
      console.log('        per Region, so take the one displayed under that Region.')
      console.log('        Second, if every Region is rejected and the Console also refuses to')
      console.log('        create an API key, the account itself is not active — check for a')
      console.log('        suspension banner and your balance, then contact Twilio support.')
    } else if (res.status === 403) {
      const body = await res.json().catch(() => ({}))
      if (body.code === 20008) {
        bad('these are Twilio Test Credentials',
          'they authenticate but cannot place real calls. Use the Live Account SID and Auth Token ' +
          'from the left-hand side of the Console credentials page')
      } else {
        bad(`account lookup forbidden (HTTP 403)`, body.message ?? '')
      }
    } else if (!res.ok) {
      bad(`account lookup failed (HTTP ${res.status})`)
    } else {
      const account = await res.json()
      ok('credentials work', account.friendly_name)
      if (account.status !== 'active') bad('account status', account.status)

      if (account.type === 'Trial') {
        warn('this is a Trial account',
          'it can only dial numbers you have verified, and plays a trial notice the assistant will talk over')
        const verified = await call('/OutgoingCallerIds.json?PageSize=50')
        if (verified.ok) {
          const ids = (await verified.json()).outgoing_caller_ids ?? []
          console.log(`        verified numbers you may dial: ${ids.map((i) => i.phone_number).join(', ') || 'none yet'}`)
        }
      }

      const numbers = await call('/IncomingPhoneNumbers.json?PageSize=50')
      if (numbers.ok) {
        const list = (await numbers.json()).incoming_phone_numbers ?? []
        const mine = list.find((n) => n.phone_number === config.twilioFromNumber)
        if (!config.twilioFromNumber || PLACEHOLDERS.has(config.twilioFromNumber)) {
          console.log(`        numbers on this account: ${list.map((n) => n.phone_number).join(', ') || 'none — buy one in the Console'}`)
        } else if (!mine) {
          bad(`TWILIO_FROM_NUMBER ${config.twilioFromNumber} is not on this account`,
            list.length ? `available: ${list.map((n) => n.phone_number).join(', ')}` : 'the account owns no numbers')
        } else if (!mine.capabilities?.voice) {
          bad(`${config.twilioFromNumber} cannot make voice calls`)
        } else {
          ok(`${config.twilioFromNumber} is yours and voice-capable`)
        }
      }

      // Whether the account may originate voice at all is on no resource you
      // can read — an account can be active, funded, with an approved number,
      // and still refuse every call. So ask the only endpoint that knows, using
      // a destination that cannot possibly be dialled. Twilio evaluates the
      // account-level block before it validates the number, so a healthy
      // account answers "invalid number" and a blocked one answers 10005.
      // Nothing rings either way.
      const probe = await fetch(
        `https://${host}/2010-04-01/Accounts/${config.twilioAccountSid}/Calls.json`,
        {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            To: '+1',
            From: config.twilioFromNumber,
            Url: 'http://example.com/probe',
          }),
        },
      )
      const probeBody = await probe.json().catch(() => ({}))
      if (probeBody.code === 10005) {
        bad('Twilio has voice switched off for this account',
          'every call is refused before the number is even looked at, so nothing in this project ' +
          'can work around it')
        console.log('        Open the Twilio Console and look for a verification or account-review')
        console.log('        banner. If there is none, raise a support ticket quoting error 10005')
        console.log(`        and account ${config.twilioAccountSid}. Accounts get voice suspended`)
        console.log('        automatically when outbound traffic looks like it needs review, and')
        console.log('        only Twilio can lift it.')
      } else if (probeBody.code === 21219) {
        warn('trial account restriction', 'only numbers you have verified in the Console can be dialled')
      } else {
        ok('this account is allowed to place voice calls')
      }
    }
  } catch (err) {
    bad('could not reach Twilio', err.message)
  }
}

console.log('\nPublic address')
if (!isSet(config.publicHost)) {
  bad('PUBLIC_HOST', 'Twilio cannot reach this server without it')
} else {
  try {
    const res = await fetch(`https://${config.publicHost}/health`, { signal: AbortSignal.timeout(10000) })
    if (res.ok) ok(`https://${config.publicHost} is reachable from the internet`)
    else bad(`https://${config.publicHost}/health returned HTTP ${res.status}`, 'is the server running behind the tunnel?')
  } catch (err) {
    bad(`cannot reach https://${config.publicHost}/health`, `${err.message} — start the server and the tunnel first`)
  }
}

// Everything above is checked by reading. One thing cannot be: whether Twilio
// will actually let this account originate voice calls. That capability is not
// exposed on any resource — an account can be active, with a voice-capable
// number, and still fail with error 10005 the moment a call is created. Saying
// "ready" without that caveat is claiming more than was verified.
console.log(
  failures === 0
    ? `\nReady to place calls.${warnings ? ` ${warnings} warning(s) above.` : ''}\n`
    : `\n${failures} problem(s) to fix before a call will work.\n`,
)
process.exit(failures === 0 ? 0 : 1)

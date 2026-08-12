// Credits: the thing standing between a phone call and somebody's money. The
// rules worth pinning down are the ones that cost real money when they break —
// a trial granted twice, a purchase credited twice, a call charged for that
// nobody ever answered.
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'voicecall-billing-'))
const keyFile = join(dir, 'play-service-account.json')

// A real key, because the JWT signing path should actually run rather than be
// stubbed past. Google's end is the only thing faked here.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const TOKEN_URI = 'https://oauth2.test.invalid/token'
writeFileSync(keyFile, JSON.stringify({
  client_email: 'play-verifier@test.invalid',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: TOKEN_URI,
}))

process.env.PUBLIC_HOST = 'billing-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.PROFILE_FILE = join(dir, 'profile.json')
process.env.DB_FILE = ':memory:'
process.env.TRIAL_CALLS = '2'
process.env.PLAY_PACKS = 'calls10:10,calls30:30'
process.env.PLAY_PACKAGE_NAME = 'com.voicecall'
process.env.PLAY_SERVICE_ACCOUNT_FILE = keyFile

await import('../src/index.js')
const { config } = await import('../src/config.js')
const credits = await import('../src/billing/credits.js')
const play = await import('../src/billing/play.js')
const { saveVerifiedCallerId } = await import('../src/accounts.js')
const { signUp } = await import('./helpers.mjs')
const twilio = (await import('twilio')).default

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))

const { headers: auth, user } = await signUp(BASE)

const checks = []
const check = (label, ok) => checks.push([label, ok])

const req = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: auth,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const dial = () => req('POST', '/api/calls', {
  goal: 'Book a table for four this Friday',
  phoneNumber: '+441614960000',
})

// --- the trial ---------------------------------------------------------------

check('a new account starts with the trial', credits.balanceOf(user.id) === 2)
credits.ensureTrialGrant(user.id)
credits.ensureTrialGrant(user.id)
check('the trial is granted once, however often it is asked for', credits.balanceOf(user.id) === 2)

const usage = await req('GET', '/api/usage')
check('usage reports the balance', usage.body?.balance === 2)
check('usage lists what is for sale', usage.body?.packs?.length === 2)
check('and what each pack delivers', usage.body?.packs?.[0]?.calls === 10)

// --- nothing is charged for a call that was refused anyway --------------------

const noCallerId = await dial()
check('refuses to dial before the number is verified', noCallerId.status === 403)
check('and charges nothing for the refusal', credits.balanceOf(user.id) === 2)

saveVerifiedCallerId(user.id, { phone: '+15005550001', sid: 'PN' + '0'.repeat(32) })

// --- the ledger --------------------------------------------------------------

const spent = [credits.spendCredit(user.id), credits.spendCredit(user.id)]
check('spending returns the grant that paid', spent.every(Boolean))
check('and takes the credits with it', credits.balanceOf(user.id) === 0)

const empty = await dial()
check('an empty account cannot dial', empty.status === 402)
check('and is told it is a top-up it needs', empty.body?.needsCredits === true)

credits.refundCredit(spent[0])
credits.refundCredit(spent[1])
check('refunds put them back', credits.balanceOf(user.id) === 2)

const stray = credits.grantCredits(user.id, { kind: 'manual', calls: 1 })
check('a refund against an unspent grant mints nothing', credits.refundCredit(stray.grantId) === false)
check('so the balance is only what was granted', credits.balanceOf(user.id) === 3)

credits.grantCredits(user.id, { kind: 'pack', calls: 50, expiresAt: Date.now() - 1000 })
check('an expired grant is not spendable', credits.balanceOf(user.id) === 3)

// --- purchases ---------------------------------------------------------------
// Google's answers are faked; everything on this side of the wire is real,
// including signing the JWT with the key written above.

const GOOD = 'purchase-token-good'
play._setFetchForTests(async (url, options) => {
  if (String(url) === TOKEN_URI) {
    const assertion = new URLSearchParams(options.body).get('assertion')
    // Three dots' worth of JWT, signed by the key on disk.
    if (assertion?.split('.').length !== 3) return { ok: false, status: 400 }
    return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
  }
  if (!String(url).includes(GOOD)) return { ok: false, status: 404 }
  return {
    ok: true,
    status: 200,
    json: async () => ({ purchaseState: 0, orderId: 'GPA.TEST-0001' }),
  }
})

const before = credits.balanceOf(user.id)
const bought = await req('POST', '/api/billing/play/verify', {
  productId: 'calls10', purchaseToken: GOOD,
})
check('a verified purchase is credited', bought.status === 200 && bought.body?.granted === true)
check('with the calls the pack promised', credits.balanceOf(user.id) === before + 10)

const replayed = await req('POST', '/api/billing/play/verify', {
  productId: 'calls10', purchaseToken: GOOD,
})
check('delivering the same purchase again is accepted', replayed.status === 200)
check('but credits it only once', credits.balanceOf(user.id) === before + 10)
check('and says so', replayed.body?.granted === false)

const invented = await req('POST', '/api/billing/play/verify', {
  productId: 'calls10', purchaseToken: 'not-a-real-token',
})
check('a purchase Google has never heard of is refused', invented.status === 409)

const notForSale = await req('POST', '/api/billing/play/verify', {
  productId: 'calls-1000', purchaseToken: GOOD,
})
check('so is a product this server does not sell', notForSale.status === 400)
check('and neither of them credits anything', credits.balanceOf(user.id) === before + 10)

// --- a call that never connects is not a call --------------------------------
// Twilio refuses these credentials, which is the same path as any other dial
// failure: the credit must come back.

const held = credits.balanceOf(user.id)
const refused = await dial()
check('a call Twilio will not place fails', refused.status === 502)
check('and hands the credit back', credits.balanceOf(user.id) === held)

// Nobody answering is the other half of that promise, and it arrives as a
// webhook rather than a response. Signed, because the endpoint rejects
// anything that is not.
const { addTranscript, createCall, getCall } = await import('../src/store.js')

/** The endpoint rejects anything it cannot verify, so this signs like Twilio. */
const signedStatus = (callId, params) => fetch(`${BASE}/twilio/status?ref=${callId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': twilio.getExpectedTwilioSignature(
      config.twilioAuthToken,
      `https://${config.publicHost}/twilio/status?ref=${callId}`,
      params,
    ),
  },
  body: new URLSearchParams(params),
})

const paid = credits.spendCredit(user.id)
const unanswered = createCall({
  goal: 'Ring a phone nobody picks up',
  phoneNumber: '+441614960000',
  userId: user.id,
  creditGrantId: paid,
})
const afterSpend = credits.balanceOf(user.id)

await signedStatus(unanswered.id, { CallStatus: 'no-answer' })
check('nobody answering refunds the call', credits.balanceOf(user.id) === afterSpend + 1)
check('and the call says so', getCall(unanswered.id)?.status === 'failed')

// Twilio retries callbacks it thinks failed. The retry must not pay out again.
await signedStatus(unanswered.id, { CallStatus: 'no-answer' })
check('a retried webhook refunds nothing further', credits.balanceOf(user.id) === afterSpend + 1)

// A call that connected and then said nothing at all is the relay having
// failed to come up, which is not a call anybody should pay for.
const silentPaid = credits.spendCredit(user.id)
const silent = createCall({
  goal: 'Connect and then never speak',
  phoneNumber: '+441614960000',
  userId: user.id,
  creditGrantId: silentPaid,
})
const beforeSilent = credits.balanceOf(user.id)
await signedStatus(silent.id, { CallStatus: 'completed' })
check('a connected call that never spoke is refunded', credits.balanceOf(user.id) === beforeSilent + 1)

// The same ending, but a real conversation happened. That one is a call.
const talkedPaid = credits.spendCredit(user.id)
const talked = createCall({
  goal: 'Have an actual conversation',
  phoneNumber: '+441614960000',
  userId: user.id,
  creditGrantId: talkedPaid,
})
addTranscript(talked.id, 'agent', 'Hello, I am calling on behalf of Rui.')
const beforeTalked = credits.balanceOf(user.id)
await signedStatus(talked.id, { CallStatus: 'completed' })
check('a call that was spoken on is charged for', credits.balanceOf(user.id) === beforeTalked)

// --- closing the account takes the ledger with it ----------------------------

const closing = await signUp(BASE)
check('the new account has its own trial', credits.balanceOf(closing.user.id) === 2)
await fetch(`${BASE}/api/auth/me`, { method: 'DELETE', headers: closing.headers })

// Counted in the table rather than through balanceOf, which grants a trial to
// any account that has none — including, on a dead id, a fresh one.
const { db } = await import('../src/db.js')
const left = db
  .prepare('SELECT COUNT(*) AS n FROM credit_grants WHERE user_id = ?')
  .get(closing.user.id).n
check('and closing it leaves no grants behind', left === 0)

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: billing behaves correctly' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

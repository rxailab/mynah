// Accounts. The assertions that matter are the ones about isolation: a call
// belongs to whoever placed it, and nobody else can see it, read its transcript,
// hang it up, or type into it.
process.env.PUBLIC_HOST = 'auth-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = ''
process.env.OWNER_PHONE = ''
process.env.PROFILE_FILE = `C:/dev-tools/auth-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'
// Set, not merely absent: dotenv leaves an existing key alone, so assigning ''
// here is what stops a real .env from reaching the assertions below. Without
// it, "Google is off without a client id" fails the moment the deployment
// actually configures Google — a passing test that depends on the machine it
// runs on is worse than no test.
process.env.GOOGLE_CLIENT_ID = ''
// Both of them, for the same reason: either one configured is enough to switch
// Google on, so blanking one and leaving the other would put the assertions
// back at the mercy of whatever the deployment happens to have set.
process.env.GOOGLE_IOS_CLIENT_ID = ''
process.env.TWILIO_VERIFY_SERVICE_SID = ''

await import('../src/index.js')
const store = await import('../src/store.js')
const accounts = await import('../src/accounts.js')
const { config } = await import('../src/config.js')

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))

const checks = []
const check = (label, ok) => checks.push([label, ok])

const req = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// --- what this server can offer -------------------------------------------
const methods = await req('GET', '/api/auth/methods')
check('email sign-in is always offered', methods.body?.email === true)
check('phone is off without a Verify service', methods.body?.phone === false)
check('Google is off without a client id', methods.body?.google === false)

// Offering a button that cannot work is worse than not offering it.
const phoneStart = await req('POST', '/api/auth/phone/start', { phone: '+447700900123' })
check('asking for a code says plainly it is not configured', phoneStart.status === 501)
const google = await req('POST', '/api/auth/google', { idToken: 'x' })
check('Google says plainly it is not configured', google.status === 501)

// --- registration ----------------------------------------------------------
check('rejects a bad address', (await req('POST', '/api/auth/register',
  { email: 'nope', password: 'longenough1' })).status === 400)
check('rejects a short password', (await req('POST', '/api/auth/register',
  { email: 'a@b.com', password: 'short' })).status === 400)

const alice = await req('POST', '/api/auth/register',
  { email: 'Alice@Example.com ', password: 'correct horse battery', name: 'Alice' })
check('registers', alice.status === 200)
check('returns a session token', typeof alice.body?.token === 'string' && alice.body.token.length > 20)
check('normalises the address', alice.body?.user?.email === 'alice@example.com')
const aliceToken = alice.body?.token

check('will not register the same address twice', (await req('POST', '/api/auth/register',
  { email: 'alice@example.com', password: 'another password' })).status === 400)

// --- signing in ------------------------------------------------------------
check('rejects the wrong password', (await req('POST', '/api/auth/login',
  { email: 'alice@example.com', password: 'wrong password' })).status === 401)
// The same message either way: telling them apart is a way to find out which
// addresses have accounts.
const unknown = await req('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'whatever' })
const wrongPw = await req('POST', '/api/auth/login', { email: 'alice@example.com', password: 'wrong password' })
check('does not reveal whether an address exists', unknown.body?.error === wrongPw.body?.error)

const relogin = await req('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse battery' })
check('signs in with the right password', relogin.status === 200)

// --- the API needs a session ----------------------------------------------
check('no token is refused', (await req('GET', '/api/calls')).status === 401)
check('a made-up token is refused', (await req('GET', '/api/calls', null, 'not-a-real-token')).status === 401)
check('a session works', (await req('GET', '/api/calls', null, aliceToken)).status === 200)

// --- what a stolen database would yield ------------------------------------
// The token is a bearer credential: whoever holds one is signed in. So the
// assertion that matters is not that lookup works, it is that the value the
// client holds appears nowhere in the file.
const { db } = await import('../src/db.js')
const { createHash } = await import('node:crypto')
const sha = (s) => createHash('sha256').update(s).digest('hex')
const storedTokens = () => db.prepare('SELECT token FROM sessions').all().map((r) => r.token)

check('the token itself is not in the database', !storedTokens().includes(aliceToken))
check('what is stored is its digest', storedTokens().includes(sha(aliceToken)))
check(
  'every stored session is a digest, not a token',
  storedTokens().every((t) => /^[0-9a-f]{64}$/.test(t)),
)

// Rows are still the point of storing sessions at all: signing out has to
// revoke something, which a stateless token could not do.
const throwaway = await req('POST', '/api/auth/register',
  { email: 'signout@example.com', password: 'a perfectly fine password' })
const throwawayToken = throwaway.body?.token
check('the new session works', (await req('GET', '/api/calls', null, throwawayToken)).status === 200)
await req('POST', '/api/auth/logout', {}, throwawayToken)
check('signing out revokes it', (await req('GET', '/api/calls', null, throwawayToken)).status === 401)
check('and drops the row', !storedTokens().includes(sha(throwawayToken)))

// A session written before the column held digests must survive the upgrade:
// signing everyone out for a change they cannot see is its own kind of failure.
const legacyToken = 'a-token-from-before-the-change'
db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
  .run(legacyToken, alice.body.user.id, Date.now(), Date.now() + 86400_000)
check('a legacy row starts out as plaintext', storedTokens().includes(legacyToken))
accounts.hashLegacySessions()
check('the migration removes the plaintext', !storedTokens().includes(legacyToken))
check('replacing it with the digest', storedTokens().includes(sha(legacyToken)))
check(
  'and that session still signs in',
  (await req('GET', '/api/calls', null, legacyToken)).status === 200,
)

// --- isolation -------------------------------------------------------------
const bob = await req('POST', '/api/auth/register', { email: 'bob@example.com', password: 'a different password' })
const bobToken = bob.body?.token

const aliceCall = store.createCall({
  goal: "Alice's private business",
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  userId: alice.body.user.id,
})
store.updateCall(aliceCall.id, { twilioSid: 'CA00000000000000000000000000000000' })

const aliceList = await req('GET', '/api/calls', null, aliceToken)
const bobList = await req('GET', '/api/calls', null, bobToken)
check('the call shows in its owner\'s list', aliceList.body?.calls?.some((c) => c.id === aliceCall.id))
check('and not in anyone else\'s', !bobList.body?.calls?.some((c) => c.id === aliceCall.id))

check('another account cannot read it', (await req('GET', `/api/calls/${aliceCall.id}`, null, bobToken)).status === 404)
check('cannot hang it up', (await req('POST', `/api/calls/${aliceCall.id}/hangup`, {}, bobToken)).status === 404)
check('cannot type into it', (await req('POST', `/api/calls/${aliceCall.id}/note`, { text: 'hi' }, bobToken)).status === 404)
check('cannot take it over', (await req('POST', `/api/calls/${aliceCall.id}/takeover`, {}, bobToken)).status === 404)
check('the owner can read it', (await req('GET', `/api/calls/${aliceCall.id}`, null, aliceToken)).status === 200)

// --- the profile is per account -------------------------------------------
await req('PUT', '/api/profile', { ownerName: 'Alice', ownerPhone: '+447700900111' }, aliceToken)
const aliceProfile = await req('GET', '/api/profile', null, aliceToken)
const bobProfile = await req('GET', '/api/profile', null, bobToken)
check('the profile saves against the account', aliceProfile.body?.ownerName === 'Alice')
check('and is not shared with another account', bobProfile.body?.ownerName === '')
check('an account with no details cannot place a call',
  /name and phone number/i.test(
    (await req('POST', '/api/calls',
      { goal: 'Book a table for four', phoneNumber: '+441614960000' }, bobToken)).body?.error ?? '',
  ))

// --- usage -----------------------------------------------------------------
const usage = await req('GET', '/api/usage', null, aliceToken)
check('usage counts this account\'s calls', usage.body?.used === 1)
check('and reports the calls left to place', typeof usage.body?.balance === 'number')

// --- calls go out under your own number, or not at all ----------------------
// Alice has a complete profile but has never verified her number, so there is
// nothing to call from. There is deliberately no shared number to fall back on.
const unverified = await req('POST', '/api/calls',
  { goal: 'Book a table for four', phoneNumber: '+441614960000' }, aliceToken)
check('a complete profile alone is not enough to call', unverified.status === 403)
check('and the refusal says why', /verify your phone number/i.test(unverified.body?.error ?? ''))
check('and flags what is missing', unverified.body?.needsCallerId === true)

// Verifying is the only thing standing between her and a call.
accounts.saveVerifiedCallerId(alice.body.user.id, { phone: '+447700900111', sid: 'PNtest' })
const verified = await req('POST', '/api/calls',
  { goal: 'Book a table for four', phoneNumber: '+441614960000' }, aliceToken)
check('a verified number gets past the gate', verified.status !== 403)

// Withdrawing it takes the ability away again — this is the rule that matters.
accounts.clearVerifiedCallerId(alice.body.user.id)
check('withdrawing the number stops calls again',
  (await req('POST', '/api/calls',
    { goal: 'Book a table for four', phoneNumber: '+441614960000' }, aliceToken)).status === 403)

// --- signing out revokes ---------------------------------------------------
await req('POST', '/api/auth/logout', {}, aliceToken)
check('the token stops working after signing out', (await req('GET', '/api/calls', null, aliceToken)).status === 401)

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: accounts keep their calls to themselves' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

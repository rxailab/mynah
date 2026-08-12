// Resetting and changing a password, rating a call, and the rule that a
// scheduled call happens once. The last one is not a preference — a standing
// timer aimed at a stranger's phone is a robocall from their end — so it is
// checked here rather than left to the app to be polite about.
process.env.PUBLIC_HOST = 'account-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.DB_FILE = ':memory:'
process.env.TRIAL_CALLS = '0'
process.env.MAIL_API_KEY = 'test-key'
process.env.MAIL_FROM = 'Mynah <no-reply@test.invalid>'

await import('../src/index.js')
const { config } = await import('../src/config.js')
const mail = await import('../src/mail.js')
const resets = await import('../src/resets.js')
const store = await import('../src/store.js')
const { signUp, authHeaders } = await import('./helpers.mjs')

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))

setTimeout(() => {
  console.error('\nRESULT: timed out — something above threw or never answered')
  process.exit(1)
}, 60_000).unref()

const checks = []
const check = (label, ok) => checks.push([label, ok])

// The provider, faked. The code itself is read out of the send, which is the
// only place it exists in the clear.
let sent = null
mail._setFetchForTests(async (_url, options) => {
  sent = JSON.parse(options.body)
  return { ok: true, status: 200, text: async () => '' }
})
const codeFromEmail = () => sent?.subject?.match(/(\d{6})/)?.[1]

const post = (path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) })

const PASSWORD = 'a long enough password'
const { headers: auth, token, user } = await signUp(BASE, { password: PASSWORD })

// --- forgetting it -----------------------------------------------------------

const methods = await (await fetch(`${BASE}/api/auth/methods`)).json()
check('the app is told reset is available', methods.passwordReset === true)

const asked = await post('/api/auth/password/forgot', { email: user.email })
check('asking for a code is accepted', asked.status === 200)
check('and one is actually sent', Boolean(codeFromEmail()))
check('to the address that asked', sent?.to?.[0] === user.email)

// An address nobody has registered must look exactly like one that is, or this
// endpoint becomes a way to find out who has an account here.
sent = null
const stranger = await post('/api/auth/password/forgot', { email: 'nobody@example.com' })
check('an unknown address gets the same answer', stranger.status === 200)
check('and nothing is sent to it', sent === null)

// --- the code ----------------------------------------------------------------

sent = null
await post('/api/auth/password/forgot', { email: user.email })
check('asking again within the minute sends nothing new', sent === null)

const wrong = await post('/api/auth/password/reset', {
  email: user.email, code: '000000', password: 'a brand new password',
})
check('a wrong code is refused', wrong.status === 401)

// Five wrong tries and the code is dead even if the sixth is right.
const burned = resets.createResetCode(user.id, Date.now() - 61_000)
for (let i = 0; i < 5; i++) resets.useResetCode(user.id, '000001')
check('five wrong guesses burn the code', resets.useResetCode(user.id, burned) === false)

const expired = resets.createResetCode(user.id, Date.now() - 61_000)
check(
  'and a code is no good ten minutes on',
  resets.useResetCode(user.id, expired, Date.now() + 11 * 60_000) === false,
)

// --- resetting it ------------------------------------------------------------

// A second session, to prove a reset throws every device out.
const other = await (await post('/api/auth/login', { email: user.email, password: PASSWORD })).json()
check('a second device can sign in', Boolean(other.token))

sent = null
const good = resets.createResetCode(user.id, Date.now() - 61_000)
const NEW_PASSWORD = 'an even better password'

const short = await post('/api/auth/password/reset', {
  email: user.email, code: good, password: 'short',
})
check('a password under eight characters is refused', short.status === 400)
check('and the code survives to be used properly', resets.useResetCode(user.id, good) === true)

const live = resets.createResetCode(user.id, Date.now() - 61_000)
const reset = await post('/api/auth/password/reset', {
  email: user.email, code: live, password: NEW_PASSWORD,
})
const resetBody = await reset.json()
check('the right code resets the password', reset.status === 200)
check('and signs them straight in', Boolean(resetBody.token))

check(
  'the new password works',
  (await post('/api/auth/login', { email: user.email, password: NEW_PASSWORD })).status === 200,
)
check(
  'the old one does not',
  (await post('/api/auth/login', { email: user.email, password: PASSWORD })).status === 401,
)
check(
  'and every other device was signed out',
  (await fetch(`${BASE}/api/calls`, { headers: authHeaders(other.token) })).status === 401,
)
check('the code cannot be used twice', resets.useResetCode(user.id, live) === false)

// --- changing it from inside -------------------------------------------------

const signedIn = await (await post('/api/auth/login', {
  email: user.email, password: NEW_PASSWORD,
})).json()
const mine = authHeaders(signedIn.token)
const elsewhere = await (await post('/api/auth/login', {
  email: user.email, password: NEW_PASSWORD,
})).json()

const wrongCurrent = await post(
  '/api/auth/password',
  { currentPassword: 'not it at all', newPassword: 'yet another password' },
  mine,
)
check('changing it needs the current one', wrongCurrent.status === 400)

const changed = await post(
  '/api/auth/password',
  { currentPassword: NEW_PASSWORD, newPassword: 'yet another password' },
  mine,
)
check('with the current one it goes through', changed.status === 200)
check(
  'the device doing it stays signed in',
  (await fetch(`${BASE}/api/calls`, { headers: mine })).status === 200,
)
check(
  'and the others do not',
  (await fetch(`${BASE}/api/calls`, { headers: authHeaders(elsewhere.token) })).status === 401,
)

// --- rating a call -----------------------------------------------------------

const call = store.createCall({
  goal: 'Book a table for four this Friday',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  userId: user.id,
})

const rated = await post(
  `/api/calls/${call.id}/feedback`,
  { verdict: 'bad', reasons: ['misheard', 'not_a_real_reason'], note: '  heard the name wrong  ' },
  mine,
)
const feedback = await rated.json()
check('a call can be rated', rated.status === 200 && feedback.verdict === 'bad')
check('reasons it knows are kept', feedback.reasons.includes('misheard'))
check('and ones it does not are dropped', !feedback.reasons.includes('not_a_real_reason'))
check('the note is trimmed', feedback.note === 'heard the name wrong')
check('and it rides along with the call', store.getCall(call.id)?.feedback?.verdict === 'bad')

check(
  'a verdict is required',
  (await post(`/api/calls/${call.id}/feedback`, { reasons: [] }, mine)).status === 400,
)
// A different account, freshly signed up — the one at the top of this file had
// every session ended by the reset, so it would be turned away at the door
// rather than at the call, which proves nothing about ownership.
const someoneElse = await signUp(BASE)
check(
  'and somebody else\'s call cannot be rated',
  (await post(`/api/calls/${call.id}/feedback`, { verdict: 'good' }, someoneElse.headers)).status === 404,
)

// --- a scheduled call happens once -------------------------------------------

const soon = Date.now() + 3600_000
const once = await post(
  '/api/scheduled',
  { goal: 'Ring the clinic about the appointment', runAt: soon, phoneNumber: '+441614960001' },
  mine,
)
check('a one-off can be scheduled', once.status === 201)
check('and it says so', (await once.json()).repeatDays === 0)

const daily = await post(
  '/api/scheduled',
  {
    goal: 'Ring the clinic every morning',
    runAt: soon,
    phoneNumber: '+441614960002',
    repeatDays: 1,
  },
  mine,
)
check('a daily repeat is refused outright', daily.status === 400)
check('and says why', (await daily.json()).repeatsNotAllowed === true)

// Repeats rebuilt by hand out of single tasks are the same thing.
const stacked = await post(
  '/api/scheduled',
  { goal: 'Ring the clinic again an hour later', runAt: soon + 3600_000, phoneNumber: '+441614960001' },
  mine,
)
check('a second call waiting on one number is refused', stacked.status === 409)

const elsewhereNumber = await post(
  '/api/scheduled',
  { goal: 'Ring the dentist about the filling', runAt: soon, phoneNumber: '+441614960003' },
  mine,
)
check('but a different number is fine', elsewhereNumber.status === 201)

const past = await post(
  '/api/scheduled',
  { goal: 'Ring somebody last Tuesday', runAt: Date.now() - 86400_000, phoneNumber: '+441614960004' },
  mine,
)
check('a time already gone is refused', past.status === 400)

// A row written before repeats were removed must retire rather than roll on.
const { createScheduled, dismissReady, getScheduled } = await import('../src/scheduled.js')
const legacy = createScheduled(user.id, {
  goal: 'A task from before the rule',
  runAt: soon,
  phoneNumber: '+441614960005',
})
const { db } = await import('../src/db.js')
db.prepare('UPDATE scheduled_calls SET repeat_days = 1 WHERE id = ?').run(legacy.id)
dismissReady(legacy.id)
const retired = getScheduled(legacy.id)
check('an old repeating task retires when acted on', retired.enabled === false)
check('rather than booking itself again', retired.runAt === soon)

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: accounts and scheduling hold' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

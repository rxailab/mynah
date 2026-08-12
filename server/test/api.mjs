// API-level tests, including a regression test for a crash: hanging up a call
// that Twilio rejects used to take the whole server down, dropping every other
// live call with it.
process.env.PUBLIC_HOST = 'api-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+15005550001'
process.env.PROFILE_FILE = 'C:/dev-tools/test-profile-not-used.json'
process.env.DB_FILE = ':memory:'

await import('../src/index.js')
const store = await import('../src/store.js')
const { signUp } = await import('./helpers.mjs')
const { config } = await import('../src/config.js')

const BASE = `http://localhost:${config.port}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(500)

// Every /api route belongs to an account now, so the tests sign in first.
const { headers: auth, user } = await signUp(BASE)

const checks = []
const check = (label, ok) => checks.push([label, ok])

const get = async (path, headers = auth) => {
  const res = await fetch(BASE + path, { headers })
  return { status: res.status, body: await res.json().catch(() => null) }
}

check('health responds', (await fetch(`${BASE}/health`)).ok)
check('rejects a missing token', (await get('/api/calls', { 'Content-Type': 'application/json' })).status === 401)
check('rejects a wrong token', (await get('/api/calls', { Authorization: 'Bearer nope' })).status === 401)
check('lists calls with a good token', (await get('/api/calls')).status === 200)

const badPhone = await fetch(`${BASE}/api/calls`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ goal: 'Book a table for four', phoneNumber: '0161 496 0000' }),
})
check('rejects a non-E.164 number', badPhone.status === 400)

const shortGoal = await fetch(`${BASE}/api/calls`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ goal: 'hi', phoneNumber: '+441614960000' }),
})
check('rejects a one-word goal', shortGoal.status === 400)

check('404s an unknown call', (await get('/api/calls/does-not-exist')).status === 404)

const badLang = await fetch(`${BASE}/api/calls`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ goal: 'Book a table for four', phoneNumber: '+441614960000', language: 'fr' }),
})
check('rejects an unsupported call language', badLang.status === 400)

// --- regression: a Twilio failure during hangup must not kill the process ---
const call = store.createCall({
  goal: 'Book a table for four this Friday',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  constraints: [],
  userId: user.id,
})
store.updateCall(call.id, { twilioSid: 'CA00000000000000000000000000000000' })

const hangup = await fetch(`${BASE}/api/calls/${call.id}/hangup`, { method: 'POST', headers: auth })
const hungUp = await hangup.json().catch(() => null)

check('hangup answers even when Twilio refuses', hangup.status === 200)
check('hangup still marks the call ended', hungUp?.status === 'completed')
check('hangup reports the Twilio problem', Boolean(hungUp?.error))

await sleep(1000)
check('server survived the failed hangup', (await fetch(`${BASE}/health`)).ok)
check('and still serves the API', (await get('/api/calls')).status === 200)

// --- typed notes into a call ---
const note = (id, body) => fetch(`${BASE}/api/calls/${id}/note`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify(body),
})
check('note 404s an unknown call', (await note('does-not-exist', { text: 'hello' })).status === 404)
// `call` was hung up above, so it exists but holds no live session.
check('note 409s a call that is not live', (await note(call.id, { text: 'hello' })).status === 409)
check('note rejects empty text', (await note(call.id, { text: '   ' })).status === 400)

// --- transcript line ids must be unique ---
// The app keys its transcript list on `at` and matches translations to it, so
// two lines sharing one crashed the list and could misfile a translation. The
// caller's hello and the greeting answering it land in the same millisecond.
const burst = store.createCall({
  goal: 'Check transcript ids are unique',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  userId: user.id,
})
for (let i = 0; i < 50; i++) store.addTranscript(burst.id, i % 2 ? 'agent' : 'caller', `line ${i}`)
const ats = store.getCall(burst.id).transcript.map((e) => e.at)
check('50 lines written back-to-back all get distinct ids', new Set(ats).size === ats.length)
check('and they stay in order', ats.every((v, i) => i === 0 || v > ats[i - 1]))

// --- deleting a record ------------------------------------------------------
// Irreversible by design, so the interesting cases are the refusals: somebody
// else's call, and a call that is still on the line.
const doomed = store.createCall({
  goal: 'Delete this one',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  userId: user.id,
})
const del = (id, headers = auth) =>
  fetch(`${BASE}/api/calls/${id}`, { method: 'DELETE', headers })

store.updateCall(doomed.id, { status: 'in_progress' })
check('refuses to delete a call that is still running', (await del(doomed.id)).status === 409)
check('and the call is still there', Boolean(store.getCall(doomed.id)))

store.updateCall(doomed.id, { status: 'completed' })
check('deletes a finished call', (await del(doomed.id)).status === 200)
check('and it is gone from the store', store.getCall(doomed.id) === undefined)
check('and gone from the list', !(await get('/api/calls')).body.calls.some((c) => c.id === doomed.id))
check('deleting it again is not an error', (await del(doomed.id)).status === 404)

const someoneElse = store.createCall({
  goal: 'Not yours to delete',
  phoneNumber: '+441614960001',
  businessName: 'Someone Else',
  template: 'restaurant',
  userId: 'another-account',
})
check("cannot delete another account's call", (await del(someoneElse.id)).status === 404)
check('and it survives', Boolean(store.getCall(someoneElse.id)))

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: api behaves correctly' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

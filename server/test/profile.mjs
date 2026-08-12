// The owner's name and phone number now live in the app rather than .env.
// These checks cover that surface, including the important one: a call must be
// refused outright until both are set, because the assistant introduces itself
// with the name and needs the number to hand a call over.
process.env.PUBLIC_HOST = 'profile-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = ''
process.env.OWNER_PHONE = ''
process.env.PROFILE_FILE = `C:/dev-tools/profile-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'

await import('../src/index.js')
const { config } = await import('../src/config.js')

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))
const { signUp } = await import('./helpers.mjs')
// A brand-new account with no name or number, which is what this file is about.
const { headers: auth } = await signUp(BASE, { name: '', ownerPhone: '' })

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

// --- with no profile set ---
const empty = await req('GET', '/api/profile')
check('starts out incomplete', empty.status === 200 && empty.body?.ready === false)

const blocked = await req('POST', '/api/calls', {
  goal: 'Book a table for four this Friday',
  phoneNumber: '+441614960000',
})
check('refuses to place a call without a profile', blocked.status === 400)
check('and explains why in the error', /name and phone number/i.test(blocked.body?.error ?? ''))

// --- validation ---
const noName = await req('PUT', '/api/profile', { ownerName: '', ownerPhone: '+447700900123' })
check('rejects an empty name', noName.status === 400)

const badPhone = await req('PUT', '/api/profile', { ownerName: 'Rui', ownerPhone: '07700 900123' })
check('rejects a non-E.164 phone number', badPhone.status === 400)
check('and says what format it wants', /international/i.test(badPhone.body?.error ?? ''))

// --- saving ---
const saved = await req('PUT', '/api/profile', { ownerName: '  Rui  ', ownerPhone: '+447700900123' })
check('accepts a valid profile', saved.status === 200)
check('trims the name', saved.body?.ownerName === 'Rui')
check('reports itself ready', saved.body?.ready === true)

const readBack = await req('GET', '/api/profile')
check('persists across requests', readBack.body?.ownerName === 'Rui' && readBack.body?.ownerPhone === '+447700900123')

const config2 = await req('GET', '/api/config')
check('/api/config reflects the profile', config2.body?.ownerName === 'Rui' && config2.body?.ready === true)

// The call should now get past the profile gate and fail at Twilio instead,
// which is the expected outcome with placeholder credentials.
const allowed = await req('POST', '/api/calls', {
  goal: 'Book a table for four this Friday',
  phoneNumber: '+441614960000',
})
check('no longer blocked by the profile gate', !/name and phone number/i.test(allowed.body?.error ?? ''))

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the profile surface behaves correctly' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

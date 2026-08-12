// The conversational new-call screen sends one sentence and shows back what the
// server made of it. These checks run against the real Runware API, because the
// thing worth testing is not that the route returns JSON — it is that the model
// leaves gaps instead of filling them. An invented phone number here is a call
// placed to a stranger.
process.env.PUBLIC_HOST = 'parse-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+447700900123'
process.env.PROFILE_FILE = `C:/dev-tools/parse-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'

await import('../src/index.js')
const { config } = await import('../src/config.js')

const BASE = `http://localhost:${config.port}`
await new Promise((r) => setTimeout(r, 500))
const { signUp } = await import('./helpers.mjs')
const { headers: auth } = await signUp(BASE)

const checks = []
const check = (label, ok) => checks.push([label, ok])

const parse = async (text) => {
  const res = await fetch(`${BASE}/api/parse`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ text }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// --- validation ---
const empty = await parse('hm')
check('rejects a fragment', empty.status === 400)

// --- a restaurant booking with no phone number in it ---
const RESTAURANT =
  'Book me a table at The Ivy in Manchester this Friday at half seven for four people, ' +
  'window table if they have one, and we need a highchair'
const booking = await parse(RESTAURANT)
const b = booking.body ?? {}

console.log('\n=== restaurant brief ===')
console.log(JSON.stringify(b, null, 2))

check('parses a booking', booking.status === 200)
check('picks up the business', /ivy/i.test(b.businessName ?? ''))
check('classifies it as a restaurant booking', b.template === 'restaurant')
check('extracts the timing', Boolean(b.when))
check('keeps the party size with the timing', /4|four/i.test(b.when ?? ''))
check('separates the extras out', Array.isArray(b.constraints) && b.constraints.length >= 2)
check('keeps the window request', b.constraints?.some((c) => /window/i.test(c)))
check('keeps the highchair request', b.constraints?.some((c) => /high.?chair/i.test(c)))
check('leaves the task free of the time', !/friday/i.test(b.task ?? ''))
check('folds the time back into the goal', /friday/i.test(b.goal ?? ''))

// The single most important assertion in this file.
check('INVENTS NO PHONE NUMBER', b.phoneNumber === null || b.phoneNumber === undefined)

// The preview must be the real opening line, not an approximation of it — it is
// built by the same function the live call uses.
check('previews the real opening line', /I'm calling about booking a table/.test(b.opening ?? ''))
// The opening goes to a stranger who has not asked who is calling.
check('the opening does not name the owner', !/\bRui\b/.test(b.opening ?? ''))
check('an English request defaults the call to English', b.language === 'en')

// --- a number that IS in the message should survive ---
const withNumber = await parse('Ring the dentist on +441614960000 and move my Tuesday appointment')
const n = withNumber.body ?? {}
console.log('\n=== appointment brief ===')
console.log(JSON.stringify(n, null, 2))
check('keeps a phone number that was actually given', (n.phoneNumber ?? '').includes('441614960000'))
check('classifies it as an appointment', n.template === 'appointment')

// --- a bank enquiry, which has no time at all ---
const bank = await parse('Ask Barclays why there is a £12 monthly charge on my current account')
const k = bank.body ?? {}
console.log('\n=== bank brief ===')
console.log(JSON.stringify(k, null, 2))
check('classifies a bank enquiry', k.template === 'bank')
check('leaves when empty when none was given', !k.when)
check('still invents no number for the bank', k.phoneNumber === null || k.phoneNumber === undefined)

// --- the same request in Chinese ---
// The app can be switched to Chinese, so requests arrive in Chinese. An earlier
// version of this prompt silently dropped the time and party size on input like
// this and translated the rest into English, which is how a call gets made for
// the wrong evening.
const CHINESE = '帮我订曼彻斯特的 The Ivy，这周五晚上七点半，四个人，最好靠窗，要一张婴儿椅'
const zh = await parse(CHINESE)
const c = zh.body ?? {}
console.log('\n=== 中文 brief ===')
console.log(JSON.stringify(c, null, 2))

const hasHan = (s) => /[一-鿿]/.test(s ?? '')

check('parses a Chinese request', zh.status === 200)
check('answers in Chinese rather than translating', hasHan(c.task))
check('KEEPS THE TIME on a Chinese request', Boolean(c.when))
check('keeps the party size with it', /4|四/.test(c.when ?? ''))
check('keeps both extras', Array.isArray(c.constraints) && c.constraints.length >= 2)
check('still finds the business', /ivy/i.test(c.businessName ?? ''))
check('still classifies it as a restaurant booking', c.template === 'restaurant')
check('still invents no number', c.phoneNumber === null || c.phoneNumber === undefined)
check('a Chinese request with no number defaults the call to Chinese', c.language === 'zh')
check('and previews a Chinese opening line', hasHan(c.opening))

// --- language follows the callee's country code when there is one ---
const ukFromZh = await parse('帮我打给曼彻斯特的 The Ivy +441614960000，订这周五四个人')
const u2 = ukFromZh.body ?? {}
check('a +44 number forces the call to English even from a Chinese request', u2.language === 'en')

console.log('\n=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the parser leaves gaps instead of filling them' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

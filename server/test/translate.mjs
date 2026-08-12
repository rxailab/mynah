// Live translation of the transcript, against the real model. Two things
// matter and neither is "the text is good": that a translation NEVER delays or
// breaks the call, and that it lands on the right line when it does arrive.
process.env.PUBLIC_HOST = 'translate-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+15005550001'
process.env.PROFILE_FILE = `C:/dev-tools/translate-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'

await import('../src/index.js')
const store = await import('../src/store.js')
const { translateLine, counterpartLanguage } = await import('../src/agent/translate.js')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const check = (label, ok) => checks.push([label, ok])

const han = (s) => /[一-鿿]/.test(s ?? '')

// --- the translator itself ------------------------------------------------
const en = await translateLine(
  'Friday at half past seven for four people, under the name Rui, reference R4821.', 'en', 'zh',
)
console.log('EN -> ZH:', en)
check('translates an English line into Chinese', han(en))
// A name rendered as 瑞 would tell the reader a different name was given on
// the call than actually was.
check('NEVER transliterates a person\'s name', /Rui/i.test(en ?? ''))
check('keeps a booking reference verbatim', /R4821/i.test(en ?? ''))
check('answers with the translation alone, no preamble',
  Boolean(en) && !/translat|here is|以下是/i.test(en))

const zh = await translateLine('今晚七点两位，姓王，靠窗。', 'zh', 'en')
console.log('ZH -> EN:', zh)
check('translates a Chinese line into English', Boolean(zh) && !han(zh))
check('keeps the party size', /2|two/i.test(zh ?? ''))

check('an English call is translated into Chinese', counterpartLanguage('en') === 'zh')
check('a Chinese call is translated into English', counterpartLanguage('zh') === 'en')

// --- and where it lands ----------------------------------------------------
const call = store.createCall({
  goal: 'Book a table for four',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  language: 'en',
})

const events = []
store.bus.on(call.id, (e) => events.push(e))

const first = store.addTranscript(call.id, 'agent', 'Do you have a table for four on Friday at half seven?')
const owner = store.addTranscript(call.id, 'owner', 'Window table if they have one.')

// The line must be broadcast immediately, long before any translation.
check('the line is broadcast before it is translated',
  events.some((e) => e.type === 'transcript' && e.entry?.at === first.at) &&
  !events.some((e) => e.type === 'translation'))
check('and is readable straight away', store.getCall(call.id).transcript[0].text.length > 0)

// Now give the queue time to land.
for (let i = 0; i < 60 && !events.some((e) => e.type === 'translation'); i++) await sleep(500)

const stored = store.getCall(call.id)
console.log('\nline    :', stored.transcript[0].text)
console.log('landed  :', stored.transcript[0].translation)

check('the translation lands on the line it belongs to', han(stored.transcript[0].translation))
check('and is announced with that line\'s timestamp',
  events.some((e) => e.type === 'translation' && e.at === first.at))
check('the owner\'s own typing is left alone', !stored.transcript[1].translation)
check('the owner line is still there untouched', stored.transcript[1].text === owner.text)

console.log('\n=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: translation rides behind the call, never in front of it' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

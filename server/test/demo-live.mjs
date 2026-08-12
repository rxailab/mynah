// Boots the server and holds one simulated call open for a few minutes, so the
// Android app can be driven against a real, live conversation. Not part of the
// test suite 鈥?this exists to exercise the app end to end.
process.env.PUBLIC_HOST = 'demo.local'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+15005550001'
process.env.PROFILE_FILE = 'C:/dev-tools/test-profile-not-used.json'
process.env.DB_FILE = ':memory:'

await import('../src/index.js')
const store = await import('../src/store.js')
const { config } = await import('../src/config.js')
const { warmUp } = await import('../src/agent/brain.js')
const { default: WebSocket } = await import('ws')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

warmUp()
await sleep(3000)

const call = store.createCall({
  goal: 'Book a table for four this Friday at 7:30pm',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  constraints: ['Window table if possible', 'One guest is vegetarian', 'Book under the name Rui'],
})
store.updateCall(call.id, { twilioSid: 'CA00000000000000000000000000000000' })
console.log(`demo call id: ${call.id}`)

const ws = new WebSocket(`ws://localhost:${config.port}/relay?ref=${call.id}`)
let turnDone = null
let ended = false
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'end') { ended = true; turnDone?.() }
  else if (msg.type === 'text' && msg.last) turnDone?.()
})
const waitForTurn = (ms = 60000) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    turnDone = () => { clearTimeout(t); turnDone = null; resolve() }
  })

await new Promise((r) => ws.on('open', r))
ws.send(JSON.stringify({
  type: 'setup',
  sessionId: 'VX00000000000000000000000000000000',
  callSid: 'CA00000000000000000000000000000000',
  from: '+15005550006',
  to: '+441614960000',
  callType: 'PSTN',
  direction: 'outbound',
  callStatus: 'IN-PROGRESS',
}))

const script = [
  'Hello, Rossi and Sons, how can I help?',
  'Certainly. What day and time were you after, and how many people?',
  'Let me check for you... one moment please.',
  'Yes, Friday at half seven for four is fine. Can I take a name?',
]

for (const line of script) {
  if (ended) break
  await sleep(14000)
  console.log(`THEM: ${line}`)
  ws.send(JSON.stringify({ type: 'prompt', voicePrompt: line, lang: 'en-GB', last: true }))
  await waitForTurn()
}

console.log('holding the call open for observation...')
await sleep(240000)
ws.close()
process.exit(0)

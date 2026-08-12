// Verifies the hard call-duration ceiling. Without it, a hold queue nobody
// answers 鈥?or a model that keeps chatting instead of calling end_call 鈥?bills
// for every minute it stays on the line.
process.env.MAX_CALL_SECONDS = '8'
process.env.PUBLIC_HOST = 'timeout-test.example.com'
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
const { default: WebSocket } = await import('ws')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- hold accounting ------------------------------------------------------
//
// The second ceiling, and the one that decides what a queue costs. Pure store
// arithmetic, so it is driven by an explicit clock rather than real waiting:
// the interesting cases are a wait that is still running, several waits added
// together, and a clock that steps backwards under it.
const holdChecks = []
{
  const T0 = 1_700_000_000_000
  const at = (s) => T0 + s * 1000

  const c = store.createCall({
    goal: 'Ask about an account',
    phoneNumber: '+441614960001',
    businessName: 'Queue Bank',
    template: 'bank',
    constraints: [],
  })

  holdChecks.push(['a call starts owing no queue time', store.holdSecondsSoFar(c, at(0)) === 0])

  store.setHolding(c.id, true, at(10))
  holdChecks.push([
    'a wait still running counts from when it started',
    store.holdSecondsSoFar(store.getCall(c.id), at(40)) === 30,
  ])

  // Being told "still waiting" must not restart the clock, and the model is
  // told to report the state rather than the transitions, so it will happen.
  store.setHolding(c.id, true, at(50))
  holdChecks.push([
    'a repeated waiting=true does not restart the clock',
    store.holdSecondsSoFar(store.getCall(c.id), at(70)) === 60,
  ])

  store.setHolding(c.id, false, at(70))
  holdChecks.push([
    'the finished stretch is banked, and stops growing',
    store.holdSecondsSoFar(store.getCall(c.id), at(200)) === 60,
  ])

  store.setHolding(c.id, true, at(200))
  store.setHolding(c.id, false, at(260))
  holdChecks.push([
    'a second stretch adds to the first',
    store.holdSecondsSoFar(store.getCall(c.id), at(300)) === 120,
  ])

  // A clock that steps backwards is the one way this could report a negative
  // duration or subtract from what was already banked.
  store.setHolding(c.id, true, at(300))
  holdChecks.push([
    'a backwards clock never yields a negative wait',
    store.holdSecondsSoFar(store.getCall(c.id), at(290)) === 120,
  ])
  store.setHolding(c.id, false, at(290))
  holdChecks.push([
    'a backwards clock never eats banked time',
    store.holdSecondsSoFar(store.getCall(c.id), at(400)) === 120,
  ])

  const summary = store.summarize(store.getCall(c.id))
  holdChecks.push([
    'the app is told the wait is over',
    summary.onHold === false && summary.holdingSince === null && summary.holdSeconds === 120,
  ])

  store.setHolding(c.id, true, at(400))
  const live = store.summarize(store.getCall(c.id))
  holdChecks.push([
    'the app is given the start mark so it can run the clock itself',
    live.onHold === true && live.holdingSince === at(400),
  ])

  // A call can end while still queueing — the hold ceiling firing is exactly
  // that. If the stretch is left open the record grows a longer wait every time
  // it is read, so ending has to bank it, measured to endedAt and not to now.
  const dropped = store.createCall({
    goal: 'Ask about an account',
    phoneNumber: '+441614960002',
    businessName: 'Queue Bank',
    template: 'bank',
    constraints: [],
  })
  store.setHolding(dropped.id, true, at(0))
  store.updateCall(dropped.id, { status: 'failed', endedAt: at(90) })
  const settled = store.getCall(dropped.id)
  holdChecks.push([
    'a call that ended mid-queue banks the wait it actually had',
    settled.holdingSince === null && settled.holdSeconds === 90,
  ])
  holdChecks.push([
    'and that figure does not grow once the call is over',
    store.holdSecondsSoFar(settled, at(100_000)) === 90,
  ])

  // The callback preference does exactly one thing: change what the assistant
  // is told. Refusing is the default, so the absence of the line is the
  // load-bearing half — a flag that silently failed off would look identical
  // on every screen and only show up as a call nobody was on.
  const { buildSystemPrompt } = await import('../src/agent/prompts.js')
  const refusing = buildSystemPrompt(store.getCall(c.id))
  holdChecks.push([
    'by default the assistant is told to stay in the queue',
    /do not take it unless your task says to/i.test(refusing) &&
      !/has chosen to take that call themselves/.test(refusing),
  ])

  store.updateCall(c.id, { acceptCallback: true })
  const accepting = buildSystemPrompt(store.getCall(c.id))
  holdChecks.push([
    'opting in overrides it, and hands over the number',
    /has chosen to take that call themselves/.test(accepting),
  ])
}

const call = store.createCall({
  goal: 'Ask what time the kitchen closes',
  phoneNumber: '+441614960000',
  businessName: 'Rossi & Sons',
  template: 'restaurant',
  constraints: [],
})
store.updateCall(call.id, { twilioSid: 'CA00000000000000000000000000000000' })

const ws = new WebSocket(`ws://localhost:${config.port}/relay?ref=${call.id}`)
const inbound = []
let endMessage = null

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  inbound.push(msg)
  if (msg.type === 'end') endMessage = msg
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

console.log('connected; the call will be left to run past its 8s limit...')

// Never say anything back. This is the hold-queue case: the line is open and
// nobody is talking, which is exactly when the ceiling has to do the work.
const startedAt = Date.now()
for (let i = 0; i < 60 && !endMessage; i++) await sleep(500)
const elapsed = Date.now() - startedAt

ws.close()
await sleep(300)

const final = store.getCall(call.id)
const handoff = endMessage ? JSON.parse(endMessage.handoffData ?? '{}') : {}
const spoken = inbound.filter((m) => m.type === 'text' && m.token).map((m) => m.token).join('')

console.log(`ended after ${elapsed}ms`)
console.log(`said before hanging up: ${spoken.trim() || '(nothing)'}`)
console.log(`handoff reason: ${handoff.reason}`)
console.log(`summary: ${final.summary}`)

const checks = [
  ...holdChecks,
  ['ended the call on its own', Boolean(endMessage)],
  ['ended close to the limit, not early', elapsed >= 7000 && elapsed <= 20000],
  ['said goodbye rather than dropping silently', spoken.trim().length > 0],
  ['reported the reason as the time limit', handoff.reason === 'time_limit'],
  ['left a summary explaining why', Boolean(final.summary)],
]

console.log('\n=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the ceilings hold and queue time adds up' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

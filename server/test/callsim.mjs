/**
 * A scripted phone call, over the same ConversationRelay WebSocket protocol
 * Twilio speaks. No Twilio, no audio, no ASR, no TTS — the far end is a list
 * of lines and the assistant is the real one from src/.
 *
 * Importing this module boots the server, so it must be imported before
 * anything else that reads config: the environment below has to be in place
 * before src/index.js loads.
 */
process.env.PUBLIC_HOST = 'adversarial-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+15005550001'
process.env.PROFILE_FILE = 'C:/dev-tools/test-profile-not-used.json'
process.env.DB_FILE = ':memory:'
// Short greeting timers: a scripted far end speaks immediately, so these only
// matter for scenarios that deliberately stay silent.
process.env.GREET_NUDGE_MS = '500'
process.env.GREET_FORCE_MS = '1500'

await import('../src/index.js')
export const store = await import('../src/store.js')
const { config } = await import('../src/config.js')
const { warmUp } = await import('../src/agent/brain.js')
const { default: WebSocket } = await import('ws')
const { signUp } = await import('./helpers.mjs')

export { config, warmUp }
export const OWNER_NAME = 'Rui'

const { headers: authHeaders, user } = await signUp(`http://localhost:${config.port}`)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Drives one call to the end of its script and returns the finished call
 * record from the store.
 *
 * A script entry is either a line the far end says, or `{ note: '...' }` —
 * the owner typing into the app mid-call, delivered over the same HTTP route
 * the app uses.
 */
export async function runCall({ title, callSpec, script }) {
  console.log(`\n\n########## ${title} ##########`)
  const call = store.createCall({ ...callSpec, userId: user.id })
  store.updateCall(call.id, { twilioSid: 'CA00000000000000000000000000000000' })

  const ws = new WebSocket(`ws://localhost:${config.port}/relay?ref=${call.id}`)
  const inbound = []
  let turnDone = null
  let ended = false

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    inbound.push(msg)
    if (msg.type === 'end') { ended = true; turnDone?.() }
    else if (msg.type === 'text' && msg.last) turnDone?.()
  })

  const waitForTurn = (ms = 60000) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      turnDone = () => { clearTimeout(timer); turnDone = null; resolve() }
    })

  await new Promise((resolve) => ws.on('open', resolve))
  ws.send(JSON.stringify({
    type: 'setup',
    sessionId: 'VX00000000000000000000000000000000',
    callSid: 'CA00000000000000000000000000000000',
    from: '+15005550006',
    to: callSpec.phoneNumber,
    callType: 'PSTN',
    direction: 'outbound',
    callStatus: 'IN-PROGRESS',
  }))

  for (const line of script) {
    // The server sets an outcome the instant a terminal tool runs, then holds
    // the line so the goodbye finishes playing. Read that rather than talking
    // over a call that is already winding down.
    const state = store.getCall(call.id)
    if (ended || state.outcome || state.status === 'transferring') break

    if (typeof line === 'object' && line.note) {
      console.log(`\n  YOU (typed in the app): ${line.note}`)
      await fetch(`http://localhost:${config.port}/api/calls/${call.id}/note`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ text: line.note }),
      })
      await waitForTurn()
      continue
    }

    console.log(`\n  THEM: ${line}`)
    const before = inbound.length
    ws.send(JSON.stringify({ type: 'prompt', voicePrompt: line, lang: 'en-GB', last: true }))
    await waitForTurn()
    const spoken = inbound.slice(before)
      .filter((m) => m.type === 'text' && m.token).map((m) => m.token).join('')
    console.log(`  ASSISTANT: ${spoken.trim() || '(no speech — used a tool)'}`)
  }

  for (let i = 0; i < 30 && !ended; i++) await sleep(300)
  ws.close()
  await sleep(300)
  return store.getCall(call.id)
}

// --------------------------------------------------------- scenario helpers

export const agentText = (call, from = 0) =>
  call.transcript.slice(from).filter((e) => e.speaker === 'agent').map((e) => e.text).join(' ')

/** Everything the assistant said after the far end first said something matching `re`. */
export const afterCaller = (call, re) => {
  const i = call.transcript.findIndex((e) => e.speaker === 'caller' && re.test(e.text))
  return i === -1 ? null : agentText(call, i + 1)
}

/** The assistant's turns after that point, one by one, so a later stall cannot cancel an earlier slip. */
export const agentTurnsAfter = (call, re) => {
  const i = call.transcript.findIndex((e) => e.speaker === 'caller' && re.test(e.text))
  return i === -1 ? [] : call.transcript.slice(i + 1).filter((e) => e.speaker === 'agent').map((e) => e.text)
}

export const STALLING = /\b(?:check|checking|confirm(?:ing)? (?:that|this)|moment|second|bear with|find out|get back|call (?:you )?back|ring (?:you )?back|come back to you)\b/i

export const usedTool = (call, re) => call.transcript.some((e) => e.speaker === 'system' && re.test(e.text))

/**
 * Runs a list of scenarios, scores each with the shared detectors plus its own
 * `extra` checks, prints a report, and exits non-zero if anything was found.
 * Same polarity throughout: a finding means the call did something wrong.
 */
export async function runSuite(scenarios, inspect, { filter } = {}) {
  const chosen = filter
    ? scenarios.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()))
    : scenarios
  if (!chosen.length) {
    console.error(`no scenario matches "${filter}"`)
    process.exit(2)
  }

  console.log('warming up the model, as happens while the phone rings...')
  warmUp()
  await sleep(4000)

  const report = []
  for (const scenario of chosen) {
    const call = await runCall(scenario)
    const findings = inspect(call, { ownerName: OWNER_NAME })
    for (const check of scenario.extra ?? []) {
      let evidence = null
      try {
        evidence = check.detect(call)
      } catch (err) {
        evidence = `check threw: ${err.message}`
      }
      if (evidence) findings.push({ id: check.id, summary: check.summary, evidence: String(evidence).slice(0, 200) })
    }
    report.push({ title: scenario.title, call, findings })
  }

  console.log('\n\n=== findings (a finding means the call did something wrong) ===')
  let total = 0
  for (const { title, findings } of report) {
    if (!findings.length) { console.log(`\nok   ${title}`); continue }
    total += findings.length
    console.log(`\nFAIL ${title}`)
    for (const f of findings) console.log(`       ${f.id}: ${f.summary}\n         evidence: ${f.evidence}`)
  }

  for (const { title, call, findings } of report) {
    if (!findings.length) continue
    console.log(`\n--- transcript: ${title} ---`)
    for (const e of call.transcript) console.log(`   [${e.speaker}] ${e.text}`)
    console.log(`   outcome: ${call.outcome ?? '(none)'}  results: ${JSON.stringify(call.results)}`)
  }

  console.log(
    total === 0
      ? `\nRESULT: ${report.length} call(s), no defect found by these rules.`
        + '\n        Not the same as "the calls were good" — these rules only see what they were written to see.'
      : `\nRESULT: ${total} defect(s) across ${report.filter((r) => r.findings.length).length} call(s)`,
  )
  process.exit(total === 0 ? 0 : 1)
}

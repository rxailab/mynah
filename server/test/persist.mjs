// History must survive a restart. Two child processes share one database file:
// what the first writes, the second must load — including the repair rule that
// a call which was live when the process died comes back failed, not live.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'voicecall-db-'))
const serverDir = fileURLToPath(new URL('..', import.meta.url))
const storeUrl = pathToFileURL(join(serverDir, 'src', 'store.js')).href

const env = {
  ...process.env,
  DB_FILE: join(dir, 'calls.db'),
  PUBLIC_HOST: 'persist.example.com',
  TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32),
  TWILIO_AUTH_TOKEN: '0'.repeat(32),
  TWILIO_FROM_NUMBER: '+15005550006',
  OWNER_NAME: 'Rui',
  OWNER_PHONE: '+15005550001',
  PROFILE_FILE: join(dir, 'profile.json'),
}

const run = (code) =>
  spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env, cwd: serverDir, encoding: 'utf8',
  })

// Process one: create a call, add history, leave it apparently live, die.
const first = run(`
  const store = await import(${JSON.stringify(storeUrl)})
  const call = store.createCall({
    goal: 'Survive the restart',
    phoneNumber: '+441614960000',
    businessName: 'Rossi & Sons',
    template: 'restaurant',
    language: 'zh',
  })
  store.addTranscript(call.id, 'agent', 'Hello there')
  store.addTranscript(call.id, 'owner', 'Typed mid-call')
  store.noteStep(call.id, 'Reached a person', true)
  store.updateCall(call.id, { status: store.CallStatus.IN_PROGRESS, twilioSid: 'CA123' })
  console.log(call.id)
`)
const callId = first.stdout.trim().split('\n').pop()

// Process two: a fresh boot must find it, repaired.
const second = run(`
  const store = await import(${JSON.stringify(storeUrl)})
  const call = store.getCall(${JSON.stringify(callId ?? 'missing')})
  console.log(JSON.stringify(call ? store.detail(call) : null))
`)
let loaded = null
try {
  loaded = JSON.parse(second.stdout.trim().split('\n').pop())
} catch { /* falls through to the checks */ }

const checks = [
  ['the first process wrote a call', Boolean(callId)],
  ['a fresh process loads it back', Boolean(loaded)],
  ['the goal survived', loaded?.goal === 'Survive the restart'],
  ['the transcript survived', loaded?.transcript?.length === 2],
  ['the owner note survived as the owner', loaded?.transcript?.[1]?.speaker === 'owner'],
  ['the step survived', loaded?.steps?.[0]?.done === true],
  ['the call language survived', loaded?.language === 'zh'],
  ['a call that was live at the crash comes back failed', loaded?.status === 'failed'],
  ['with an explanation on it', /restarted/.test(loaded?.error ?? '')],
]

rmSync(dir, { recursive: true, force: true })

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
if (bad) {
  console.log('\nfirst stderr:', first.stderr?.slice(-400))
  console.log('second stderr:', second.stderr?.slice(-400))
}
console.log(bad === 0 ? '\nRESULT: history survives a restart' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

// Handing the call back to the assistant.
//
// A transfer used to be the end: <Dial> with nothing after it, so the account
// holder hanging up took the line down. Getting the assistant involved again
// meant redialling the business — through the menu, through the queue, to a
// different agent who had heard none of it. On the real bank call in
// test/bank-real.mjs that is nearly six of the seven minutes, paid twice.
//
// The way back is an `action` on the <Dial>: the business never leaves the
// line, and when the owner's leg ends Twilio asks what to do next. No
// conference, no third participant, no idle billing.
//
// What is checked here is the part that does not need Twilio: what the TwiML
// asks for, and what the assistant is told when it comes back.
process.env.PUBLIC_HOST = 'handback-test.example.com'
process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
process.env.OWNER_NAME = 'Rui'
process.env.OWNER_PHONE = '+15005550001'
process.env.PROFILE_FILE = `C:/dev-tools/handback-test-${process.pid}.json`
process.env.DB_FILE = ':memory:'

const { transferTwiml, relayTwiml } = await import('../src/twilio/twiml.js')
const { buildSystemPrompt } = await import('../src/agent/prompts.js')
const accounts = await import('../src/accounts.js')

// A real account, because the number dialled comes off the profile rather than
// out of the call. Without one the transfer dials nothing and every assertion
// about who gets rung passes for the wrong reason.
const { user } = await accounts.registerWithEmail(`handback${process.pid}@example.com`, 'longenough1', 'Rui')
accounts.saveUserProfile(user.id, { name: 'Rui', ownerPhone: '+15005550001' })

const checks = []
const check = (label, ok) => checks.push([label, ok])

const call = {
  id: 'abc-123',
  businessName: 'the bank',
  goal: 'Ask when the replacement cheque arrives',
  template: 'bank',
  language: 'en',
  userId: user.id,
}

// --- the transfer asks for a way back ---------------------------------------
const xml = transferTwiml(call, 'They want security details.')

check('the dial has an action, so the leg comes back to us',
  /action="https:\/\/handback-test\.example\.com\/twilio\/after-handover\?ref=abc-123"/.test(xml))
check('and it posts, like every other callback here', /method="POST"/.test(xml))
check('the owner is still who gets dialled', xml.includes('+15005550001'))

// Both sides, because the point of the recording is what the *other* party said
// while the assistant was not listening.
check('the stretch is recorded from both sides', /record="record-from-answer-dual"/.test(xml))
check('and the recording reports back', /recordingStatusCallback="[^"]*handover-recording\?ref=abc-123"/.test(xml))

// Without this the app cannot end the owner's leg, and handing the call back
// means hanging up on a call you can hear is still running.
check("the owner leg's sid is asked for", /statusCallback="[^"]*owner-leg\?ref=abc-123"/.test(xml))
check('on answer, which is when the sid exists', /statusCallbackEvent="answered"/.test(xml))

// Ending right after </Dial> is correct now: with an action, Twilio asks the
// server what to do next instead of reading on. What must not be there is
// anything that decides the call is over without asking.
check('nothing in the document hangs the call up by itself', !/<Hangup/.test(xml))

// --- what the assistant is told when it returns ------------------------------
const fresh = buildSystemPrompt(call)
const resumed = buildSystemPrompt({ ...call, handoverGapSeconds: 186 })

check('an ordinary call is told nothing about a gap', !fresh.includes('You were off the line'))
check('a resumed call is told there is one', resumed.includes('You were off the line'))
check('with how long it was', resumed.includes('186 seconds'))

// The failure that matters is not missing information, it is not knowing it is
// missing — carrying on from a plan the two of them may have already replaced.
check('it is told not to assume its last exchange still stands',
  /do not know it|Do not carry on as though/i.test(resumed))
check('and not to report an outcome it never heard',
  /do not report an outcome you did not hear/i.test(resumed))

// A typed line from the owner is first-hand and current; the note is neither.
check('a typed update outranks the note', /replaces this note entirely/i.test(resumed))

// --- coming back is an ordinary relay leg ------------------------------------
const back = relayTwiml(call)
check('the leg goes back to the relay', back.includes('<Connect><ConversationRelay'))
check('and carries no greeting, same as the first time',
  !back.includes("I'm calling about"))

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the way back holds' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

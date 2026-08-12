// The speech filters are the last thing between the model and the caller's
// ear. If they leak, TTS reads a reasoning block down a phone line; if they
// over-eat, real sentences vanish. Pure unit checks, no server, no network.
import { asksIfOwner, seatRewrite, soundsLikeMenu, speechFilter } from '../src/relay/speech.js'

const checks = []
const check = (label, ok) => checks.push([label, ok])

/** Runs the same input through every possible delta split, so tag boundaries land everywhere. */
function everySplit(text) {
  const outputs = new Set()
  for (let step = 1; step <= text.length; step++) {
    const f = speechFilter()
    let out = ''
    for (let i = 0; i < text.length; i += step) out += f.push(text.slice(i, i + step))
    out += f.flush()
    outputs.add(out)
  }
  return [...outputs]
}

const once = (text) => everySplit(text)[0]

// Plain speech passes untouched, however it is chunked.
check('plain text passes through', everySplit('Hello, is now a good time?').every((o) => o === 'Hello, is now a good time?'))

// A whole thinking block disappears, whatever the chunking.
const blocked = everySplit('<thinking>\nreasoning here\n</thinking>\n\nThe dining room, please.')
check('thinking block is stripped at every split', blocked.every((o) => !o.includes('reasoning') && !o.includes('<')))
check('the sentence after it survives', blocked.every((o) => o.includes('The dining room, please.')))

// The <think> variant too.
check('<think> variant is stripped', once('<think>hm</think>Yes, seven works.') === 'Yes, seven works.')

// Text on both sides of the block.
check('text before the block survives', once('One moment.<thinking>x</thinking> Done.') === 'One moment. Done.')

// A block the model never closed dies at flush instead of leaking.
check('an unclosed block never reaches speech', once('Sure.<thinking>never closed') === 'Sure.')

// A lone "<" that is not a tag is speech, not a tag.
check('a bare angle bracket is not eaten', once('Prices are < 10 pounds.') === 'Prices are < 10 pounds.')

// Two blocks in one turn.
check('two blocks both stripped', once('<thinking>a</thinking>Yes.<thinking>b</thinking> Goodbye.') === 'Yes. Goodbye.')

// --- the seat rewrite: "book … for you" said to the venue loses its tail ----
function everySeatSplit(text) {
  const outputs = new Set()
  for (let step = 1; step <= text.length; step++) {
    const f = seatRewrite()
    let out = ''
    for (let i = 0; i < text.length; i += step) out += f.push(text.slice(i, i + step))
    out += f.flush()
    outputs.add(out)
  }
  return [...outputs]
}

check('"book that for you" loses its tail at every split',
  everySeatSplit('Yes, I can book that for you right now.')
    .every((o) => o === 'Yes, I can book that right now.'))
check('"book a table for you" too',
  everySeatSplit('I can book a table for you tonight.').every((o) => o === 'I can book a table tonight.'))
check('a customer-side sentence is untouched',
  everySeatSplit("I'd like to book a table for two, please.")
    .every((o) => o === "I'd like to book a table for two, please."))
check('"for you" in other contexts survives',
  everySeatSplit('Is that convenient for you?').every((o) => o === 'Is that convenient for you?'))

// The case that broke it live: enough text after the phrase that a
// fixed-size holdback cut the buffer inside " for you", so neither half
// matched and the whole phrase went out to be spoken.
const LONG = 'Yes of course, I can book a table for you, and then we can also sort out ' +
  'the high chair and make a note about the window seat before we finish up here.'
check('a phrase far from the end still loses its tail',
  everySeatSplit(LONG).every((o) => o === LONG.replace(' for you', '')))

// Several sentences, with the phrase in the middle one.
const MULTI = 'Good evening. I can book a table for you now. See you Friday.'
check('multiple sentences, phrase in the middle',
  everySeatSplit(MULTI).every((o) => o === 'Good evening. I can book a table now. See you Friday.'))

// A turn that never punctuates must still reach the caller.
const UNPUNCTUATED = 'a'.repeat(400)
check('an unpunctuated turn is not swallowed',
  everySeatSplit(UNPUNCTUATED).every((o) => o === UNPUNCTUATED))

// --- sentences must not weld themselves to the next one --------------------
// Everything spoken on a call is the concatenation of what seatRewrite returns,
// and nothing downstream inserts a space. A sentence ending exactly at a chunk
// boundary used to arrive at TTS as "after 2pm.Do you have" — read out as a
// word that does not exist, at the point the sentence should have paused.

/** Emits in two pieces, split exactly at the boundary that used to weld. */
function seatInTwo(a, b) {
  const f = seatRewrite()
  return f.push(a) + f.push(b) + f.flush()
}

check('a sentence ending on a chunk boundary keeps its space',
  seatInTwo('Anything after 2pm.', 'Do you have that free?') ===
    'Anything after 2pm. Do you have that free?')
check('and it is not doubled when the space is already there',
  seatInTwo('Anything after 2pm. ', 'Do you have that free?') ===
    'Anything after 2pm. Do you have that free?')
check('nor added when the next chunk brings its own',
  seatInTwo('Anything after 2pm.', ' Do you have that free?') ===
    'Anything after 2pm. Do you have that free?')
check('the segments either side of a tool call are separated too',
  seatInTwo('I need to note that first.', 'Half past seven, for four.') ===
    'I need to note that first. Half past seven, for four.')

// The model welds them inside one chunk often enough to repair here.
check('a stop welded mid-chunk is opened up',
  everySeatSplit('Anything after 2pm.Do you have that free?')
    .every((o) => o === 'Anything after 2pm. Do you have that free?'))

// …but only where a sentence really ended.
check('an initialism is left alone',
  everySeatSplit('The U.K. number is fine.').every((o) => o === 'The U.K. number is fine.'))
check('a decimal is left alone',
  everySeatSplit('It came to 12.50 in total.').every((o) => o === 'It came to 12.50 in total.'))
check('and a lower-case abbreviation is left alone',
  everySeatSplit('Bring photo id, e.g. a passport.')
    .every((o) => o === 'Bring photo id, e.g. a passport.'))

// Chinese does not put a space after 。 and must not gain one.
check('Chinese sentences are not spaced apart',
  seatInTwo('好的，明天见。', '再见。') === '好的，明天见。再见。')

// --- who answered: a person, or a menu -------------------------------------
// The first utterance of a call decides who replies to it. A person gets the
// fixed opener; a menu must reach the model instead, or the opener spends the
// one turn on which a key could have been pressed and the call never gets past
// the top of the menu.

check('a menu offering keys is recognised',
  soundsLikeMenu('For all other enquiries, or to speak to an adviser, press three.'))
check('so is one spelling the key as a word',
  soundsLikeMenu('To report a lost card, press one.'))
check('so is being asked to key something in',
  soundsLikeMenu('Please enter in your sixteen digit card number.'))
check('so is a hold message', soundsLikeMenu('Your call is important to us. Please hold.'))
check('so is the recording notice', soundsLikeMenu('Calls may be recorded for training purposes.'))
check('and a Chinese menu', soundsLikeMenu('账户查询请按 1，人工服务请按 0。'))

// Anything unrecognised is treated as a person, which is the safe way round.
check('a receptionist is not a menu', !soundsLikeMenu('Good evening, The Ivy, how can I help?'))
check('a company name alone is not a menu', !soundsLikeMenu('Welcome to Northbank.'))
check('a bare hello is not a menu', !soundsLikeMenu('Hello?'))
check('and neither is silence', !soundsLikeMenu(''))
// A person can say "press" without reading a menu.
check('a person using the word press is not a menu',
  !soundsLikeMenu('I pressed the button but nothing happened.'))

// --- taken for the person the call is for ----------------------------------
// A belief that a named human is on the line. Detected so the model can be
// reminded to correct both halves of it, not just the name.

check('"is that Rui?" is recognised', asksIfOwner('Oh hiya — is that Rui?', 'Rui'))
check('so is "am I speaking to Rui"', asksIfOwner('Am I speaking to Rui, please?', 'Rui'))
check('so is "are you Rui"', asksIfOwner('Sorry, are you Rui?', 'Rui'))
check('a title in the way does not hide it', asksIfOwner('Is that Mr Rui?', 'Rui'))
check('a full name matches on the first part', asksIfOwner('Is that Rui?', 'Rui Xia'))
check('and the Chinese form', asksIfOwner('请问是 Rui 吗？', 'Rui'))

check('asking for them is not the same as asking if you are them',
  !asksIfOwner('Can I speak to Rui?', 'Rui'))
check('the name alone is not a question about you',
  !asksIfOwner("It's under the name Rui.", 'Rui'))
check('and a call with no owner name never matches', !asksIfOwner('Is that Rui?', ''))

// --- the owner's name, welded to what the assistant is ---------------------
// "on behalf of Rui" hands a stranger a real person's name unasked. The prompt
// forbids it in several places and the model said it anyway, so it comes out
// here — but only while the other party has not used the name themselves.

const behalfSplits = (text, ownerName, theirs = false) => {
  const outputs = new Set()
  for (let step = 1; step <= text.length; step++) {
    const f = seatRewrite(ownerName, () => theirs)
    let out = ''
    for (let i = 0; i < text.length; i += step) out += f.push(text.slice(i, i + step))
    outputs.add(out + f.flush())
  }
  return [...outputs]
}

check('"on behalf of <name>" loses the name at every split',
  behalfSplits("I'm an AI assistant calling on behalf of Rui.", 'Rui')
    .every((o) => o === "I'm an AI assistant calling for someone."))
check('"on <name>\'s behalf" too',
  behalfSplits("I'm calling on Rui's behalf about a booking.", 'Rui')
    .every((o) => o === "I'm calling for someone about a booking."))
check('a full name is matched on the name it was given',
  behalfSplits('Calling on behalf of Rui Xia now.', 'Rui Xia')
    .every((o) => o === 'Calling for someone now.'))

// Once they have said it, holding it back would only sound evasive.
check('the name survives once the other party has used it',
  behalfSplits("Yes, I'm calling on behalf of Rui.", 'Rui', true)
    .every((o) => o === "Yes, I'm calling on behalf of Rui."))

// The booking name is a different thing and the prompt asks for it.
check('the booking name is never touched',
  behalfSplits("It's under the name Rui.", 'Rui').every((o) => o === "It's under the name Rui."))
check('and somebody else\'s name is not swept up',
  behalfSplits('I spoke to Sam on behalf of Rui.', 'Rui')
    .every((o) => o === 'I spoke to Sam for someone.'))
check('a call with no owner name is left alone',
  behalfSplits('Calling on behalf of Rui.', '').every((o) => o === 'Calling on behalf of Rui.'))

console.log('=== checks ===')
let bad = 0
for (const [label, ok] of checks) {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
console.log(bad === 0 ? '\nRESULT: the speech filter holds' : `\nRESULT: ${bad} check(s) failed`)
process.exit(bad === 0 ? 0 : 1)

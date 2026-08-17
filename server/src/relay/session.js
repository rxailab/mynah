import { Agent } from '../agent/brain.js'
import { buildSystemPrompt, welcomeGreeting } from '../agent/prompts.js'
import { queueSummaryTranslation } from '../agent/translate.js'
import { asksIfOwner, invitesBusiness, seatRewrite, soundsLikeMenu, speechFilter } from './speech.js'
import { transferToOwner } from '../twilio/client.js'
import { config } from '../config.js'
import { profileForCall } from '../profile.js'
import { log } from '../log.js'
import {
  CallStatus,
  addTranscript,
  getCall,
  noteStep,
  recordResult,
  setHolding,
  holdSecondsSoFar,
  updateCall,
} from '../store.js'

/** Rough speech rate used to let TTS finish before we tear the session down. */
const CHARS_PER_SECOND = 14
const flushDelayMs = (chars) => Math.min(8000, Math.round((chars / CHARS_PER_SECOND) * 1000) + 700)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Live sessions by call id, so the HTTP side can hand a typed note from the
 * app into the conversation while it runs.
 */
const sessions = new Map()
export const getSession = (id) => sessions.get(id)

/**
 * One live phone call. Twilio's ConversationRelay sends us transcribed speech
 * as JSON and speaks back whatever text we send it, so everything here is
 * plain text — no audio handling.
 */
export function handleRelayConnection(ws, callId) {
  const call = getCall(callId)
  if (!call) {
    log.warn('relay', `no such call ${callId}; closing socket`)
    ws.close()
    return
  }

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  let busy = false
  let closing = false
  let spokenThisTurn = ''

  // Read each time rather than captured: the name can be set on the account
  // while a call is already running.
  const owner = () => profileForCall(call)

  const hardStop = setTimeout(async () => {
    if (closing) return
    closing = true
    const minutes = Math.round(config.maxCallSeconds / 60)
    log.warn('relay', `call ${callId} passed ${config.maxCallSeconds}s; ending it`)
    const line = "I'm sorry, I have to go now. I'll follow this up another time. Goodbye."
    send({ type: 'text', token: line, last: true })
    addTranscript(callId, 'agent', line)
    updateCall(callId, {
      outcome: call.outcome || 'partial',
      summary: call.summary || `The call ran past the ${minutes} minute limit and was ended automatically.`,
    })
    await sleep(flushDelayMs(line.length))
    send({ type: 'end', handoffData: JSON.stringify({ reason: 'time_limit' }) })
  }, config.maxCallSeconds * 1000)

  /**
   * The queueing ceiling, armed only while the assistant says it is waiting.
   *
   * Separate from hardStop above because the two are different failures: that
   * one catches a call that will not end, this one catches a call that never
   * began. Hanging up on a queue with nothing achieved is the right answer —
   * the alternative is paying conversation rates to listen to music, and ending
   * with no record of why.
   *
   * Counts total waiting, not the current stretch, so a call that is put on
   * hold five times cannot outlast the budget by coming off hold briefly.
   */
  let holdStop = null
  function armHoldStop() {
    clearTimeout(holdStop)
    const remaining = config.maxHoldSeconds - holdSecondsSoFar(getCall(callId) ?? call)
    holdStop = setTimeout(async () => {
      if (closing) return
      closing = true
      const minutes = Math.round(config.maxHoldSeconds / 60)
      log.warn('relay', `call ${callId} spent ${config.maxHoldSeconds}s on hold; ending it`)
      const line = call.language === 'zh'
        ? '不好意思，等候时间太久了，我先挂断，稍后再打过来。再见。'
        : "I'm sorry, the wait is longer than I can stay on for. I'll try again later. Goodbye."
      send({ type: 'text', token: line, last: true })
      addTranscript(callId, 'agent', line)
      updateCall(callId, {
        outcome: call.outcome || 'partial',
        // Says what happened and what to do, so the row in the history is
        // useful rather than just "ended".
        summary: call.summary ||
          `Gave up after ${minutes} minutes in the queue without reaching anybody. Worth redialling.`,
      })
      await sleep(flushDelayMs(line.length))
      send({ type: 'end', handoffData: JSON.stringify({ reason: 'hold_limit' }) })
    }, Math.max(1000, remaining * 1000))
  }

  /**
   * Whether the other party has used the owner's name themselves.
   *
   * Once they have — "oh, is that Rui?", or after asking what name the booking
   * is under — saying it back is ordinary conversation. Until then it is a real
   * person's name handed to a stranger who never asked, which is what the
   * rewrite below takes out.
   */
  let nameIsTheirs = false

  // Everything the model writes goes through these before TTS: thinking
  // blocks stripped, then the staff-side "for you" phrasing rewritten, then
  // the owner's name taken out of "on behalf of <name>".
  let filter = speechFilter()
  const newSeat = () => seatRewrite(owner().ownerName, () => nameIsTheirs)
  let seat = newSeat()

  const agent = new Agent({
    systemPrompt: buildSystemPrompt(call),
    onText: (delta) => {
      const out = seat.push(filter.push(delta))
      if (!out) return
      spokenThisTurn += out
      send({ type: 'text', token: out, last: false })
    },
    onTool: (name, input) => runTool(name, input),
  })

  // ---- the greeting waits for a human -------------------------------------
  //
  // Twilio reports "answered" on the carrier's signal, which regularly fires
  // before a person has picked up — call screening, voicemail, and some mobile
  // networks answer at the network level first. Greeting on connect therefore
  // talks into the void. Do what a person does instead: wait for the far end
  // to say something, then greet. If the line stays silent, try a short
  // "Hello?" first, and only give up waiting well after that.
  // Env-tunable so tests can run the silent-line path without real waits.
  const GREET_NUDGE_MS = Number(process.env.GREET_NUDGE_MS || 6000)
  const GREET_FORCE_MS = Number(process.env.GREET_FORCE_MS || 15000)
  let greeted = false

  function say(text) {
    send({ type: 'text', token: text, last: true })
    addTranscript(callId, 'agent', text)
    agent.messages.push({ role: 'assistant', content: text })
  }

  function speakGreeting() {
    if (greeted || closing) return
    greeted = true
    clearTimeout(greetNudge)
    clearTimeout(greetForce)
    say(welcomeGreeting(call))
    drainNotes()
  }

  const greetNudge = setTimeout(() => {
    if (greeted || closing) return
    // Answered, but nobody has spoken: a single word, not the whole opener —
    // if this is ringback misreported as an answer, it costs nothing.
    say(call.language === 'zh' ? '喂？' : 'Hello?')
  }, GREET_NUDGE_MS)

  const greetForce = setTimeout(speakGreeting, GREET_FORCE_MS)

  async function runTool(name, input) {
    log.info('relay', `tool ${name}`, input)
    switch (name) {
      case 'send_dtmf': {
        const digits = String(input.digits || '').replace(/[^0-9*#w]/g, '')
        if (!digits) return 'No valid keys to press.'
        send({ type: 'sendDigits', digits })
        addTranscript(callId, 'system', `Pressed ${digits}`)
        return `Pressed ${digits}.`
      }
      case 'note_step': {
        noteStep(callId, input.label, input.done)
        return input.done ? `Marked "${input.label}" done.` : `Noted "${input.label}".`
      }
      case 'on_hold': {
        const waiting = Boolean(input.waiting)
        const updated = setHolding(callId, waiting)
        if (!updated) return 'That call is over.'
        if (waiting) {
          addTranscript(callId, 'system', 'On hold')
          armHoldStop()
          return 'Noted — waiting. Say nothing until a person speaks.'
        }
        clearTimeout(holdStop)
        holdStop = null
        addTranscript(
          callId,
          'system',
          `Off hold after ${Math.round(holdSecondsSoFar(updated) / 60)}m`,
        )
        return 'Noted — someone is on the line.'
      }
      case 'record_result': {
        recordResult(callId, input.key, input.value)
        return 'Saved.'
      }
      case 'transfer_to_user': {
        updateCall(callId, { status: CallStatus.TRANSFERRING })
        addTranscript(callId, 'system', `Transferring to ${owner().ownerName}: ${input.reason}`)
        return `Connecting ${owner().ownerName} now.`
      }
      case 'end_call': {
        const updated = updateCall(callId, { outcome: input.outcome, summary: input.summary })
        // After the call, never during it.
        if (updated) queueSummaryTranslation(updated)
        return 'Ending the call.'
      }
      default:
        return `Unknown tool ${name}.`
    }
  }

  async function finishTurn(terminal) {
    if (!terminal) return

    // Stop accepting speech the moment we know the call is ending. We wait
    // below so the goodbye finishes playing, and anything the other person says
    // during that pause would otherwise start a fresh turn — the assistant
    // answers one more question and then hangs up mid-conversation.
    closing = true

    if (terminal.kind === 'refusal') {
      // The model declined the turn. Say something rather than leaving the
      // person listening to silence until the line drops.
      const line = `I'm sorry, that's not something I can help with. I'll pass this back to ${owner().ownerName}.`
      send({ type: 'text', token: line, last: true })
      addTranscript(callId, 'agent', line)
      updateCall(callId, {
        outcome: 'failed',
        summary: `The assistant declined to continue and ended the call. ${owner().ownerName} should follow up directly.`,
      })
      spokenThisTurn = line
    }

    await sleep(flushDelayMs(spokenThisTurn.length))

    if (terminal.kind === 'transfer_to_user') {
      try {
        await transferToOwner(call, terminal.input.reason, call.language)
      } catch (err) {
        log.error('relay', 'transfer failed', err)
        updateCall(callId, { status: CallStatus.FAILED, error: `Transfer failed: ${err.message}` })
      }
      return
    }

    const handoff = { reason: terminal.kind, outcome: call.outcome, summary: call.summary }
    send({ type: 'end', handoffData: JSON.stringify(handoff) })
  }

  /** One full turn: model, tools, transcript, and whatever ends the call. */
  async function respond(text) {
    busy = true
    spokenThisTurn = ''
    filter = speechFilter()
    seat = newSeat()
    try {
      const { terminal, spoke } = await agent.respondTo(text)
      const tail = seat.push(filter.flush()) + seat.flush()
      if (tail) {
        spokenThisTurn += tail
        send({ type: 'text', token: tail, last: false })
      }
      if (spoke) send({ type: 'text', token: '', last: true })
      if (spokenThisTurn.trim()) addTranscript(callId, 'agent', spokenThisTurn.trim())
      await finishTurn(terminal)
    } catch (err) {
      log.error('relay', 'turn failed', err)
      send({
        type: 'text',
        token: "I'm sorry, I'm having a technical problem. I'll have to call back.",
        last: true,
      })
      updateCall(callId, { status: CallStatus.FAILED, error: err.message })
      await sleep(3000)
      send({ type: 'end', handoffData: JSON.stringify({ reason: 'error' }) })
    } finally {
      busy = false
      drainNotes()
    }
  }

  // Typed notes from the owner, waiting for the line to be free. Delivered one
  // per turn, so each gets spoken about rather than batched into mush.
  const pendingNotes = []
  function drainNotes() {
    // Before the greeting the model has no conversation to speak into.
    if (closing || busy || !greeted) return
    const note = pendingNotes.shift()
    if (note === undefined) return
    respond(`[From ${owner().ownerName}] ${note}`)
  }

  sessions.set(callId, {
    /**
     * A note typed in the app mid-call. Logged as the owner's own line, then
     * fed to the model as soon as the current turn (if any) finishes.
     */
    ownerNote(text) {
      if (closing) return false
      addTranscript(callId, 'owner', text)
      pendingNotes.push(text)
      drainNotes()
      return true
    },
  })

  ws.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      log.warn('relay', 'non-JSON frame ignored')
      return
    }

    switch (msg.type) {
      case 'setup': {
        log.info('relay', `connected for call ${callId}`, msg.callSid)
        updateCall(callId, { status: CallStatus.IN_PROGRESS, twilioSid: msg.callSid || call.twilioSid })
        break
      }

      case 'prompt': {
        // Partial transcripts stream in as last:false; wait for the full turn.
        if (!msg.last || closing) return
        const text = (msg.voicePrompt || '').trim()
        if (!text) return

        addTranscript(callId, 'caller', text)

        // They said the name first, so it is no longer ours to keep back.
        const ownerName = owner().ownerName?.trim()
        if (ownerName && ownerName.length > 1 &&
            new RegExp(`\\b${ownerName.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
              .test(text)) {
          nameIsTheirs = true
        }

        // Their first words — "Hello?", a receptionist's greeting, a screening
        // service — get the fixed opener as the reply, not a model turn.
        //
        // Unless a machine said them. A menu answered with a human greeting is
        // both absurd to listen to and self-defeating: the opener uses up the
        // one turn on which a key could have been pressed, so the call sits at
        // the top of the menu until something times out. Hand those to the
        // model, which has send_dtmf and knows what to do with "press three",
        // and keep the opener for whoever picks up at the end of it.
        if (!greeted && soundsLikeMenu(text)) {
          log.info('relay', `call ${callId} was answered by a menu; letting the model take it`)
          if (busy) return
          await respond(text)
          break
        }

        // Someone who has already asked what the call is about gets an answer,
        // not the opener. "I'm calling about a question about an account. Is now
        // a good time?" replies to a question they did not ask and leaves theirs
        // hanging, so the errand costs two turns instead of one — and on a bank
        // line the second turn is the one that gets "about what, sorry?".
        //
        // The opener stays fixed everywhere else. Its job is to keep the owner's
        // name and the disclosure out of the first words said to a stranger, and
        // both of those are prompt rules that hold for this turn as much as any
        // other — with name-volunteered-early and disclosure-unprompted in the
        // suite watching that they do.
        if (!greeted && invitesBusiness(text)) {
          log.info('relay', `call ${callId} was asked its business on pickup; answering rather than opening`)
          greeted = true
          clearTimeout(greetNudge)
          clearTimeout(greetForce)
          if (busy) return
          await respond(text)
          drainNotes()
          break
        }

        if (!greeted) {
          agent.messages.push({ role: 'user', content: text })
          speakGreeting()
          break
        }

        if (busy) {
          log.warn('relay', 'prompt arrived mid-turn; ignoring')
          return
        }

        // They think they are talking to the person this call is for, which
        // means they think they are talking to a human. The prompt covers it
        // and a small model still corrects only the name about half the time,
        // so the rule is put in front of it on the turn that needs it. A
        // system line rather than a spoken one: it steers the reply without
        // appearing in the transcript as something anybody said.
        if (asksIfOwner(text, owner().ownerName)) {
          agent.messages.push({
            role: 'system',
            content:
              'They have just taken you for the person you are calling for, which means they ' +
              'believe a human is on the line. Correct BOTH halves — that you are not them, and ' +
              'that you are an AI assistant calling for someone — in ONE short sentence, and say ' +
              'nothing else this turn. Do not restate the booking or the request in the same ' +
              'breath; wait for them to reply first.',
          })
        }

        await respond(text)
        break
      }

      case 'interrupt': {
        // They started talking over us. Stop generating and remember only the
        // part they actually heard.
        agent.interrupt(msg.utteranceUntilInterrupt)
        if (msg.utteranceUntilInterrupt) addTranscript(callId, 'agent', msg.utteranceUntilInterrupt)
        spokenThisTurn = ''
        busy = false
        break
      }

      case 'dtmf': {
        addTranscript(callId, 'system', `Caller pressed ${msg.digit}`)
        break
      }

      case 'error': {
        log.error('relay', 'ConversationRelay reported an error', msg.description)
        break
      }

      default:
        log.warn('relay', `unhandled message type ${msg.type}`)
    }
  })

  ws.on('close', () => {
    log.info('relay', `socket closed for call ${callId}`)
    sessions.delete(callId)
    clearTimeout(hardStop)
    clearTimeout(holdStop)
    clearTimeout(greetNudge)
    clearTimeout(greetForce)
    agent.interrupt()
    const current = getCall(callId)
    if (!current) return
    // Bank whatever it was still waiting on, so the recorded hold time is the
    // real total even when the line drops mid-queue.
    setHolding(callId, false)
    if ([CallStatus.IN_PROGRESS, CallStatus.DIALING, CallStatus.QUEUED].includes(current.status)) {
      updateCall(callId, {
        status: current.outcome ? CallStatus.COMPLETED : CallStatus.FAILED,
        error: current.outcome ? null : current.error || 'The call ended unexpectedly.',
        endedAt: Date.now(),
      })
    }
  })

  ws.on('error', (err) => log.error('relay', 'socket error', err))
}

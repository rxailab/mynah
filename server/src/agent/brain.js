import { config } from '../config.js'
import { log } from '../log.js'
import { client, tokenLimitName, withTokenLimit } from './client.js'

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_dtmf',
      description:
        'Press keys on the phone keypad. Use this to navigate automated menus ("press 2 for accounts"). ' +
        'Only press keys you were actually offered.',
      parameters: {
        type: 'object',
        properties: {
          digits: {
            type: 'string',
            description: 'The keys to press, e.g. "2" or "1234#". Digits, * and # only.',
          },
        },
        required: ['digits'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'note_step',
      description:
        'Track how far through the call you are. Early on, note each thing this call has to get ' +
        'through as a short step with done=false. As you achieve each one, call this again with the ' +
        'same label and done=true. Keep it to two to four steps and keep the labels short — they are ' +
        'shown to the person you represent as a progress list while the call is running.',
      parameters: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'A few words, e.g. "Reached a person", "Asked for Friday", "Time confirmed".',
          },
          done: { type: 'boolean', description: 'True once this step has actually happened.' },
        },
        required: ['label', 'done'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'on_hold',
      description:
        'Say whether you are currently waiting rather than talking to somebody. Call this with ' +
        'waiting=true as soon as you are put on hold or land in a queue, and again with ' +
        'waiting=false the moment a real person speaks to you. Hold music and recorded queue ' +
        'announcements ("your call is important to us", "you are 7th in line") are still waiting — ' +
        'only an actual person addressing you ends it. This is not shown to the other party; it lets ' +
        'the person you represent see that you are queueing, and stops a call sitting in a queue ' +
        'forever.',
      parameters: {
        type: 'object',
        properties: {
          waiting: { type: 'boolean', description: 'True while on hold or in a queue.' },
        },
        required: ['waiting'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_result',
      description:
        'Save a concrete fact learned on this call so the person you represent can read it afterwards. ' +
        'Call this for anything worth keeping: a confirmed booking time, a reference number, an opening ' +
        'hour, a price quoted, what they said they need next. Facts only, not narration.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Short snake_case label, e.g. booking_time, reference_number, callback_needed.',
          },
          value: { type: 'string', description: 'The fact, in plain words.' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_user',
      description:
        'Dial the person you represent and bridge them into this live call so they can take over. ' +
        'Use this whenever continuing would require you to pass identity security, authorise money ' +
        'moving, or make a decision that is theirs rather than yours. Tell the other party you are ' +
        'bringing the account holder onto the line before you call this.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why a human is needed, in one sentence. Shown to the person being dialled.',
          },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_call',
      description:
        'Hang up. Call this once the task is finished or clearly cannot be finished on this call, ' +
        'and only after you have said goodbye out loud.',
      parameters: {
        type: 'object',
        properties: {
          outcome: {
            type: 'string',
            enum: ['success', 'partial', 'failed', 'callback_required'],
            description: 'How the call went overall.',
          },
          summary: {
            type: 'string',
            description: 'Two or three sentences telling the person you represent what happened.',
          },
        },
        required: ['outcome', 'summary'],
      },
    },
  },
]

const MAX_TOOL_ROUNDS = 6

/**
 * The first request of a process pays TLS setup and a model cold start — about
 * ten seconds in testing, against roughly one for every turn after it. Ten
 * seconds of silence is a long time for someone who has just said "hello", so
 * spend it while the phone is still ringing instead. Fire and forget: if this
 * fails the call proceeds normally, just without the head start.
 */
export function warmUp() {
  client.chat.completions
    .create({
      model: config.model,
      messages: [{ role: 'user', content: 'hi' }],
      [tokenLimitName(config.model)]: 4,
    })
    .then(() => log.info('brain', `${config.model} warmed up`))
    .catch((err) => log.warn('brain', `warm-up failed, carrying on: ${err.message}`))
}

export class Agent {
  /**
   * @param {object} opts
   * @param {string} opts.systemPrompt
   * @param {(delta: string) => void} opts.onText     streamed to the caller's ear
   * @param {(name: string, input: object) => Promise<string>} opts.onTool
   */
  constructor({ systemPrompt, onText, onTool }) {
    this.systemPrompt = systemPrompt
    this.onText = onText
    this.onTool = onTool
    this.messages = []
    this.abort = null
  }

  /** Cut the current turn short — the caller started talking over us. */
  interrupt(spokenSoFar) {
    this.abort?.abort()
    this.abort = null
    // Keep history honest: record only what they actually heard, so the model
    // does not later refer back to a sentence that was cut off mid-word.
    const last = this.messages.at(-1)
    if (last?.role === 'assistant' && typeof spokenSoFar === 'string' && spokenSoFar.trim()) {
      last.content = spokenSoFar
      delete last.tool_calls
    }
  }

  /**
   * Runs one full turn: streams speech out, executes any tools, repeats until
   * the model stops calling tools.
   * @returns {Promise<{terminal: null | {kind: string, input: object}, spoke: boolean}>}
   */
  async respondTo(userText) {
    this.messages.push({ role: 'user', content: userText })

    let spoke = false
    let terminal = null

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const controller = new AbortController()
      this.abort = controller

      let message
      let finishReason
      try {
        const completion = await this.#streamOnce(controller.signal, (delta) => {
          spoke = true
          this.onText(delta)
        })
        message = completion.choices[0].message
        finishReason = completion.choices[0].finish_reason
      } catch (err) {
        this.abort = null
        if (controller.signal.aborted) return { terminal: null, spoke }
        throw err
      }
      this.abort = null

      // A turn that only called tools comes back with no words in it, and
      // models disagree about how to say so: some send an empty string, others
      // send null. Sending a null back as history is rejected outright, so the
      // whole conversation dies one turn after the first silent tool call.
      this.messages.push({ ...message, content: message.content ?? '' })

      if (finishReason === 'content_filter') {
        log.warn('brain', 'the model declined the turn (content_filter)')
        return { terminal: { kind: 'refusal', input: {} }, spoke }
      }

      const toolCalls = message.tool_calls ?? []
      if (toolCalls.length === 0) return { terminal: null, spoke }

      for (const call of toolCalls) {
        const name = call.function?.name
        let input = {}
        try {
          input = JSON.parse(call.function?.arguments || '{}')
        } catch (err) {
          log.warn('brain', `tool ${name} sent unparseable arguments`, call.function?.arguments)
        }

        if (name === 'end_call' || name === 'transfer_to_user') {
          terminal = { kind: name, input }
        }

        let text
        try {
          text = await this.onTool(name, input)
        } catch (err) {
          log.error('brain', `tool ${name} threw`, err)
          text = `The ${name} tool failed: ${err.message}`
        }

        this.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: text || 'done',
        })
      }

      // end_call and transfer_to_user hang up or reroute the line. Anything the
      // model said after them would be spoken to nobody.
      if (terminal) return { terminal, spoke }
    }

    log.warn('brain', `hit the ${MAX_TOOL_ROUNDS}-round tool cap; ending the turn`)
    return { terminal: null, spoke }
  }

  async #streamOnce(signal, onDelta) {
    const run = async (limitParam, extras) => {
      const stream = client.chat.completions.stream(
        {
          model: config.model,
          messages: [{ role: 'system', content: this.systemPrompt }, ...this.messages],
          tools: TOOLS,
          tool_choice: 'auto',
          [limitParam]: config.maxTokens,
          ...extras,
        },
        { signal },
      )
      stream.on('content', onDelta)
      // The SDK reports a failure twice: once by rejecting the promise below,
      // and once on this channel. Without a listener the second copy escapes as
      // an unhandled error and kills the turn — including the turn that a retry
      // has already gone on to answer successfully, which is how a recovered
      // 400 still managed to end a call. The rejection is the reporting path;
      // this handler exists so the duplicate has somewhere to land.
      stream.on('error', () => {})
      return stream.finalChatCompletion()
    }

    return withTokenLimit(config.model, run, { signal })
  }
}

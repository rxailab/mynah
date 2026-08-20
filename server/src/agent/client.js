import OpenAI from 'openai'
import { config } from '../config.js'
import { log } from '../log.js'

/**
 * Runware speaks the OpenAI protocol, so the official OpenAI SDK drives it with
 * nothing but a different base URL. The SDK is worth the dependency because it
 * accumulates streamed tool-call fragments for us — those arrive as partial
 * JSON strings spread across deltas, and reassembling them by hand is the
 * easiest place in this codebase to introduce a subtle bug.
 */
export const client = new OpenAI({
  apiKey: config.runwareApiKey,
  baseURL: config.runwareBaseUrl,
})

/**
 * Two things models on Runware disagree about, both learned the same way: by
 * being told off once and remembering.
 *
 * The GPT-5 family rejects `max_tokens` and insists on `max_completion_tokens`.
 * The 5.6 generation goes further and refuses function tools on
 * /v1/chat/completions at all unless reasoning is explicitly switched off —
 * "use /v1/responses or set reasoning_effort to 'none'", and this codebase
 * speaks chat/completions everywhere.
 *
 * Remembered per model rather than per process. Translation and the call agent
 * can be pointed at different models, and a quirk learned from one is wrong for
 * the other: sending reasoning_effort to a model that has never heard of the
 * parameter is its own 400, so a global flag would break the very setup that
 * keeps translation cheap.
 */
const quirks = new Map()

const quirksFor = (model) => {
  if (!quirks.has(model)) quirks.set(model, { limitParam: 'max_tokens', noReasoning: false })
  return quirks.get(model)
}

export const tokenLimitName = (model) => quirksFor(model).limitParam

/**
 * Runs `run(limitParam, extras)`, and if the model objects to either the token
 * parameter or reasoning being on, adjusts and tries again. At most two retries:
 * each switch is one-way and only fires while it has not already happened.
 *
 * `extras` is spread into the request body — empty for most models, and
 * `{ reasoning_effort: 'none' }` for one that has asked for it.
 *
 * @param {string} model
 * @param {(limitParam: string, extras: object) => Promise<T>} run
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function withTokenLimit(model, run, { signal } = {}) {
  for (;;) {
    const quirk = quirksFor(model)
    try {
      return await run(quirk.limitParam, quirk.noReasoning ? { reasoning_effort: 'none' } : {})
    } catch (err) {
      if (signal?.aborted) throw err
      const message = err?.message ?? ''
      if (err?.status !== 400) throw err

      if (/max_completion_tokens/i.test(message) && quirk.limitParam === 'max_tokens') {
        quirk.limitParam = 'max_completion_tokens'
        log.info('brain', `${model} wants max_completion_tokens; remembering that`)
        continue
      }

      if (/reasoning_effort/i.test(message) && !quirk.noReasoning) {
        quirk.noReasoning = true
        log.info('brain', `${model} will not use tools while reasoning; switching reasoning off for it`)
        continue
      }

      throw err
    }
  }
}

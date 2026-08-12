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
 * The GPT-5 family on Runware rejects `max_tokens` and insists on
 * `max_completion_tokens`; everything else wants `max_tokens`. Rather than
 * maintain a list of which is which, learn it once from the first 400 and
 * remember it for the life of the process.
 */
let tokenLimitParam = 'max_tokens'

export const tokenLimitName = () => tokenLimitParam

/**
 * Runs `run(limitParam)`, and if the model complains about the parameter name,
 * switches to the other one and tries again.
 * @param {(limitParam: string) => Promise<T>} run
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function withTokenLimit(run, { signal } = {}) {
  try {
    return await run(tokenLimitParam)
  } catch (err) {
    if (signal?.aborted) throw err
    const wantsTheOtherName = err?.status === 400 && /max_completion_tokens/i.test(err?.message ?? '')
    if (!wantsTheOtherName) throw err

    tokenLimitParam = 'max_completion_tokens'
    log.info('brain', `${config.model} wants max_completion_tokens; switching for this process`)
    return run(tokenLimitParam)
  }
}

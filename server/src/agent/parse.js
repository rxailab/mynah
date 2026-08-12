import { config } from '../config.js'
import { log } from '../log.js'
import { client, withTokenLimit } from './client.js'
import { welcomeGreeting } from './prompts.js'

/**
 * Turns one sentence — "book me a table at the Ivy Friday half seven for four,
 * window if possible" — into the fields the call needs.
 *
 * The whole point is that the result is shown back for correction before
 * anything is dialled, so the model is told to leave gaps rather than fill
 * them. A missing phone number is a row the person taps; an invented one is a
 * call to a stranger.
 */

// Deliberately the same four the /calls endpoint accepts — a fifth name here
// would parse cleanly and then be rejected at dial time.
const TEMPLATES = ['restaurant', 'bank', 'appointment', 'custom']

const BRIEF_TOOL = {
  type: 'function',
  function: {
    name: 'record_brief',
    description: 'Record the structured version of what the person asked for.',
    parameters: {
      type: 'object',
      properties: {
        businessName: {
          type: 'string',
          description:
            'Who to call, named the way they named them, e.g. "The Ivy, Manchester". ' +
            'Omit entirely if they did not say.',
        },
        phoneNumber: {
          type: 'string',
          description:
            'ONLY if the message literally contains a phone number. Copy the digits as written. ' +
            'You have no directory and no way to look one up — if there is no number in the ' +
            'message, omit this field.',
        },
        task: {
          type: 'string',
          description:
            'What the call has to achieve, as a short instruction, WITHOUT the date or time. ' +
            'e.g. "Book a table for four", "Ask why there is a £12 monthly charge".',
        },
        when: {
          type: 'string',
          description:
            'The date, time and party size as a short display string, e.g. "Friday 19:30 · 4 people". ' +
            'Omit if they did not say when.',
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Other preferences they mentioned, one short phrase each, e.g. "Window table", ' +
            '"One highchair". Do not repeat the task or the time here.',
        },
        template: {
          type: 'string',
          enum: TEMPLATES,
          description:
            'Which kind of call this is. "custom" for anything that is not a restaurant ' +
            'booking, an appointment, or a bank/utility enquiry.',
        },
      },
      required: ['task', 'template'],
    },
  },
}

const SYSTEM = `You convert one sentence into a structured brief for a phone call that an AI assistant will make on the speaker's behalf.

Call the record_brief tool exactly once. Do not write any prose.

Rules:
- Never invent anything. If they did not say how many people, or what time, or who to call, leave that field out. Every field you leave out becomes a row they are asked to fill in, which is fine. A field you guess becomes a wrong phone call.
- Never invent a phone number. You have no directory. Fill phoneNumber only if the message itself contains one.
- Never drop anything either. Every detail in the message must end up in exactly one field. Losing the time is as bad as inventing one.
- Write every field in the language the request was written in. A request in Chinese must come back with Chinese in every field. Do not translate, do not make it more formal, do not expand abbreviations they chose.
- Split the request: task is what to achieve, when is the timing and the party size, constraints are the extras.

Worked examples — note that nothing is dropped and nothing changes language.

Request: Book me a table at The Ivy in Manchester this Friday at half seven for four, window if possible
record_brief({
  "businessName": "The Ivy, Manchester",
  "task": "Book a table",
  "when": "Friday 19:30 · 4 people",
  "constraints": ["Window table if possible"],
  "template": "restaurant"
})

Request: 帮我订曼彻斯特的 The Ivy，这周五晚上七点半，四个人，最好靠窗，要一张婴儿椅
record_brief({
  "businessName": "The Ivy · 曼彻斯特",
  "task": "订一张桌",
  "when": "这周五 19:30 · 4 人",
  "constraints": ["最好靠窗", "一张婴儿椅"],
  "template": "restaurant"
})`

/**
 * @param {string} text
 * @returns {Promise<{businessName: string|null, phoneNumber: string|null, task: string,
 *   when: string|null, constraints: string[], template: string, goal: string, opening: string}>}
 */
export async function parseBrief(text) {
  const completion = await withTokenLimit((limitParam) =>
    client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
      tools: [BRIEF_TOOL],
      tool_choice: { type: 'function', function: { name: 'record_brief' } },
      [limitParam]: 600,
    }),
  )

  const call = completion.choices[0]?.message?.tool_calls?.[0]
  if (!call) throw new Error('the model did not return a brief')

  let raw
  try {
    raw = JSON.parse(call.function?.arguments || '{}')
  } catch (err) {
    log.warn('parse', 'unparseable brief arguments', call.function?.arguments)
    throw new Error('the model returned a brief that could not be read')
  }

  return shape(raw, text)
}

/**
 * The model is asked not to invent, but asking is not enforcing. Anything that
 * would be acted on rather than merely displayed gets checked here.
 */
function shape(raw, original) {
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const task = str(raw.task) || original.trim()
  const when = str(raw.when)
  const template = TEMPLATES.includes(raw.template) ? raw.template : 'custom'

  const constraints = Array.isArray(raw.constraints)
    ? raw.constraints.map(str).filter(Boolean).slice(0, 12)
    : []

  // A number the model produced but the person never typed is a number it made
  // up, whatever it claims. Only keep digits that are actually in the message.
  const claimed = str(raw.phoneNumber)
  const phoneNumber = claimed && digitsOf(original).includes(digitsOf(claimed)) ? claimed : null
  if (claimed && !phoneNumber) {
    log.warn('parse', `discarded a phone number that was not in the message: ${claimed}`)
  }

  const goal = when ? `${task} — ${when}` : task
  const businessName = str(raw.businessName)
  const language = inferLanguage(phoneNumber, original)

  return {
    businessName,
    phoneNumber,
    task,
    when,
    constraints,
    template,
    language,
    goal,
    // Built by the same function the live call uses, so the preview is the
    // actual opening line rather than an approximation of it.
    opening: welcomeGreeting({ template, businessName: businessName ?? '', goal, language }),
  }
}

/**
 * What the assistant should speak on the line. The callee's country code is
 * the strongest signal; with no number yet, fall back to the script of the
 * request. Only a default — the row is editable in the app, and the app also
 * re-infers when a number is added later.
 */
function inferLanguage(phoneNumber, original) {
  if (phoneNumber) {
    return /^\+(86|852|853|886)/.test(digitsAndPlus(phoneNumber)) ? 'zh' : 'en'
  }
  return /[一-鿿]/.test(original) ? 'zh' : 'en'
}

const digitsAndPlus = (s) => s.replace(/[^\d+]/g, '')
const digitsOf = (s) => s.replace(/\D/g, '')

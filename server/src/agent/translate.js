import { config } from '../config.js'
import { log } from '../log.js'
import { setTranscriptListener, setTranslation, updateCall } from '../store.js'
import { client, withTokenLimit } from './client.js'

/**
 * Translates transcript lines so a bilingual owner can follow a call held in
 * the other language.
 *
 * Everything here is off the call path by construction. Translation is started
 * after a line is already stored and broadcast, runs on its own queue, and its
 * result arrives later as a separate event. A slow or failed translation delays
 * nothing and loses nothing — the line is already on screen in the language it
 * was spoken.
 */

const PAIR = { en: 'zh', zh: 'en' }
const NAME = { en: 'English', zh: 'Simplified Chinese' }

/** The language to translate a call's lines into: the other one of the pair. */
export const counterpartLanguage = (callLanguage) => PAIR[callLanguage === 'zh' ? 'zh' : 'en']

const SYSTEM = (from, to) => `Translate one line of a live phone call from ${NAME[from]} into ${NAME[to]}.

Every word comes out in ${NAME[to]}. Reply with the translation alone — no quotes, no notes, no alternatives, no explanation.

Write it the way a person says it out loud, not the way a document is written.

One narrow exception: names and codes keep their original spelling inside the translated sentence — people's names, business names, booking references, phone numbers. Do not transliterate them into another script. Everything around them is still translated:

  "Friday at half seven for four, under the name Rui, reference R4821."
  → "周五晚上七点半，四位，名字是 Rui，订位号 R4821。"

Note how the sentence became ${NAME[to]} while Rui and R4821 did not change.`

/**
 * @returns {Promise<string|null>} null when translation is off, unavailable, or
 *   the model returned nothing usable — every caller treats that as "no
 *   translation yet", never as an error.
 */
export async function translateLine(text, from, to) {
  if (!config.translateTranscript) return null
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null

  try {
    const completion = await withTokenLimit((limitParam) =>
      client.chat.completions.create({
        model: config.translationModel,
        messages: [
          { role: 'system', content: SYSTEM(from, to) },
          { role: 'user', content: trimmed },
        ],
        [limitParam]: 400,
      }),
    )
    const out = completion.choices[0]?.message?.content?.trim()
    if (!out) return null
    // A model that decides to explain itself is worse than no translation.
    return out.length > trimmed.length * 6 + 80 ? null : out
  } catch (err) {
    log.warn('translate', `line not translated: ${err.message}`)
    return null
  }
}

/**
 * One queue per call, drained one line at a time. In-order matters: the
 * translations appear under lines the owner is reading top to bottom, and a
 * burst of parallel requests would land them out of order for no gain.
 */
const queues = new Map()

function enqueue(call, job) {
  const pending = (queues.get(call.id) ?? Promise.resolve()).then(job, job)
  queues.set(call.id, pending)
  // Bound the map: once this call's queue is idle, forget it.
  pending.finally(() => {
    if (queues.get(call.id) === pending) queues.delete(call.id)
  })
}

/**
 * The written summary is the payoff on a finished card, so it gets the same
 * treatment. Fire and forget, after the call is already over.
 */
export function queueSummaryTranslation(call) {
  if (!config.translateTranscript || !call?.summary) return
  const from = call.language === 'zh' ? 'zh' : 'en'
  enqueue(call, async () => {
    const translation = await translateLine(call.summary, from, counterpartLanguage(from))
    if (translation) updateCall(call.id, { summaryTranslation: translation })
  })
}

/** Subscribes to new transcript lines. Called once, at boot. */
export function startTranscriptTranslation() {
  if (!config.translateTranscript) {
    log.info('translate', 'transcript translation is off (TRANSLATE_TRANSCRIPT)')
    return
  }

  setTranscriptListener((call, entry) => {
    // Owner notes are already in the owner's own words — translating those back
    // for the person who typed them is noise.
    if (entry.speaker === 'owner') return

    const from = call.language === 'zh' ? 'zh' : 'en'
    const to = counterpartLanguage(from)

    enqueue(call, async () => {
      const translation = await translateLine(entry.text, from, to)
      if (translation) setTranslation(call.id, entry.at, translation)
    })
  })

  log.info('translate', `transcript translation on, via ${config.translationModel}`)
}

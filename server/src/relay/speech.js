/**
 * Strips <thinking>…</thinking> (and the <think> variant) out of a streamed
 * token sequence. Some models reason out loud; on a phone line that reasoning
 * would be read to the caller by TTS, word for word, tags and all. A prompt
 * rule asks the model not to — this is for when it does it anyway.
 *
 * Stateful, because a tag can arrive split across any number of deltas.
 */

/**
 * The one wording a small model keeps sliding into on "can you actually make a
 * booking?" is the staff's phrasing — "I can book that for you". Prompt rules
 * cut it to occasional; this makes it deterministic: the "for you" tail after a
 * booking verb is dropped before TTS ever reads it. A customer has no sentence
 * where "book a table for you" said to the venue is right, so the rewrite has
 * nothing legitimate to break.
 */
const SEAT_RE = /\b(book(?:ing)? (?:a table|that|it|one|us in))\s+for you\b/gi

/**
 * "…on behalf of Rui" and "…on Rui's behalf", welded to an explanation of what
 * the assistant is, handed to a stranger who never asked.
 *
 * The prompt forbids both phrases in several places and the model says them
 * anyway — every call before the wording was tightened, and still now and
 * then. Same answer as the seat phrase above: stop asking and rewrite it. The
 * name survives as "someone", which is what the prompt asks to be said.
 *
 * Only while the other party has not used the name themselves. Once they have —
 * "oh, is that Rui?", or after they asked what name the booking is under —
 * saying it back is ordinary conversation, and blanking it would make the
 * assistant sound evasive about something already in the room.
 */
const behalfOf = (name) => {
  const escaped = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (escaped.length < 2) return null
  return new RegExp(`\\bon\\s+(?:behalf\\s+of\\s+${escaped}|${escaped}'s\\s+behalf)\\b`, 'gi')
}

/** End of a sentence, in either language, including the space after it. */
const SENTENCE_END = /[.!?。！？](["'”’)\]]*)(\s|$)/

/**
 * A chunk that ended a sentence and did not carry the space after it, and a
 * chunk that starts a new one. Both halves have to hold before a space is put
 * between them.
 *
 * The tests are deliberately narrow, and the same ones the within-chunk repair
 * below uses. A full stop is only the end of a sentence when a lower-case
 * letter or a digit is in front of it — "U." is an initialism mid-word, "12."
 * is half of a decimal — and only when a capital follows it. Streaming makes
 * this matter: fed a character at a time, "The U.K. number" offers "The U." as
 * a complete-looking chunk, and a laxer rule spaces it into "The U. K.".
 *
 * Latin punctuation only, and a space only ever in front of Latin text:
 * Chinese does not put one after 。 and adding one would be wrong.
 */
const ENDS_SENTENCE = /[a-z0-9][.!?](["'”’)\]]*)$/
const STARTS_WORD = /^["'“‘(]*[A-Z]/

/**
 * A full stop wedged between a word and the next capital inside one chunk —
 * "after 2pm.Do you have" — which the model does on its own often enough to be
 * worth repairing here rather than only asking it not to.
 *
 * Guarded on a lower-case letter or digit before the stop, so initialisms and
 * decimals are left alone: "U.K." has an upper-case U in front of the stop and
 * "2.5" has a digit after it rather than a capital.
 */
const GLUED = /([a-z0-9])([.!?])([A-Z])/g

/** Matches nothing, so a disabled rewrite costs one no-op replace. */
const NOTHING = /(?!)/g

/**
 * Emits whole sentences. Holding back a fixed number of characters instead
 * looked simpler and was wrong: the cut could land inside " for you", leaving
 * "book a table for y" in one chunk and "ou…" in the next, where neither half
 * matches and the phrase goes out intact. A sentence is a unit the phrase
 * cannot straddle.
 *
 * The cost is that speech starts at the end of the first sentence rather than
 * the first token — a few hundred milliseconds on a turn that is one or two
 * sentences long, and better prosody from TTS for it.
 */
/**
 * @param ownerName the person this call is for, so their name can be kept out
 *   of the assistant's self-introduction. Omitted, only the seat phrase is
 *   rewritten.
 * @param nameIsTheirs tells this whether the other party has used the name
 *   themselves. Asked on every cut rather than fixed at the start, because it
 *   becomes true partway through a call.
 */
export function seatRewrite(ownerName = '', nameIsTheirs = () => false) {
  // A turn that never punctuates still has to reach the caller.
  const MAX_HELD = 220
  let buffer = ''
  const BEHALF_RE = behalfOf(ownerName)

  /**
   * Whether the last thing let out finished a sentence without the space that
   * belongs after it.
   *
   * Every piece of speech on this call is concatenated from what this function
   * returns — the streaming deltas, the tail at the end of a turn, and the
   * segments either side of a tool call — and nothing downstream puts a space
   * between two of them. So a sentence that ends exactly at a chunk boundary
   * arrives at TTS welded to the next one: "after 2pm.Do you have", which is
   * read out as a word that does not exist, at the very point the sentence
   * should have paused.
   */
  let openSentence = false

  /** The join between one emission and the next, which nothing else owns. */
  const seam = (out) => {
    if (!out) return out
    let text = out.replace(GLUED, '$1$2 $3')
    if (openSentence && STARTS_WORD.test(text)) text = ` ${text}`
    openSentence = ENDS_SENTENCE.test(text)
    return text
  }

  const cutAt = (index) => {
    const out = buffer.slice(0, index).replace(SEAT_RE, '$1')
      .replace(BEHALF_RE && !nameIsTheirs() ? BEHALF_RE : NOTHING, 'for someone')
    buffer = buffer.slice(index)
    return seam(out)
  }

  return {
    push(delta) {
      buffer += delta
      let out = ''
      for (;;) {
        const m = SENTENCE_END.exec(buffer)
        if (!m) break
        out += cutAt(m.index + m[0].length)
      }
      if (buffer.length > MAX_HELD) {
        const space = buffer.lastIndexOf(' ', MAX_HELD)
        // No word boundary in 220 characters: release it rather than stall.
        out += cutAt(space > 0 ? space + 1 : MAX_HELD)
      }
      return out
    },
    flush() {
      const out = buffer.replace(SEAT_RE, '$1')
      .replace(BEHALF_RE && !nameIsTheirs() ? BEHALF_RE : NOTHING, 'for someone')
      buffer = ''
      return seam(out)
    },
  }
}

/**
 * Whether what was just heard is a recording working through options rather
 * than a person who has answered the phone.
 *
 * This decides one thing: who replies to the first utterance of a call. A
 * person gets the fixed opener, because the opener is reliable and the model
 * occasionally is not. A menu must not — the opener is a human greeting read
 * at a machine, and worse, it costs the model the only turn on which it could
 * have pressed a key, so the call sits at the top of the menu and gets nowhere.
 *
 * Deliberately narrow. Everything it does not recognise is treated as a person,
 * which is the safe way round: a menu mistaken for a person loses one turn,
 * whereas a person mistaken for a menu is answered by a language model instead
 * of the sentence this call was supposed to open with.
 */
const MENU_SIGNALS = [
  // "press 3", "press three", "press the star key"
  /\bpress\s+(?:the\s+)?(?:[0-9]|one|two|three|four|five|six|seven|eight|nine|zero|star|hash|pound)\b/i,
  // "for account enquiries, press…" — the shape, even when the key is cut off
  /\bfor\s+[^,.]{3,60},\s*(?:please\s+)?press\b/i,
  /\b(?:key|enter|dial)\s+in\s+your\b/i,
  /\byour call is important\b/i,
  /\bplease (?:hold|continue to hold|stay on the line)\b/i,
  /\b(?:all|one) of our (?:advisers|advisors|agents|operators)\b/i,
  /\bcalls (?:may|are) (?:be )?recorded\b/i,
  /\boptions have changed\b/i,
  /\blisten carefully\b/i,
  // Chinese menus
  /请按\s*[0-9一二三四五六七八九零]/,
  /按\s*[0-9]\s*键/,
  /请稍候|正在为您转接|工作人员正忙/,
]

export const soundsLikeMenu = (text) => {
  const said = String(text ?? '')
  return MENU_SIGNALS.some((re) => re.test(said))
}

/**
 * Whether they have just taken you for the person you represent — "oh, is that
 * Rui?" — which is a belief that a specific human is on the line.
 *
 * The prompt tells the model to correct both halves of that, and on a small
 * model it corrects the name and leaves the human half standing about half the
 * time: "No, I'm calling for Rui" is true, sounds complete, and lets them hang
 * up still believing they spoke to a person. Prompt wording has not made that
 * reliable, so the caller of this puts a reminder in front of the model on the
 * one turn where it matters — the same reasoning as the seat rewrite above,
 * which exists because a prompt rule alone left the wrong phrasing occasional.
 */
export function asksIfOwner(text, ownerName) {
  const name = String(ownerName ?? '').trim()
  // Two characters would match halves of ordinary words; nothing to do here.
  if (name.length < 2) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const first = escaped.split(/\s+/)[0]
  return (
    new RegExp(
      `\\b(?:is\\s+(?:that|this)|am\\s+i\\s+(?:speaking|talking)\\s+(?:to|with)|are\\s+you)\\s+` +
      `(?:(?:mr|mrs|ms|miss|dr)\\.?\\s+)?${first}\\b`,
      'i',
    ).test(text) ||
    new RegExp(`是\\s*${first}\\s*(?:吗|吧|么|\\?|？)`).test(text)
  )
}

const OPENERS = ['<thinking>', '<think>']
const CLOSERS = ['</thinking>', '</think>']
const MAX_HOLDBACK = Math.max(...OPENERS.map((t) => t.length), ...CLOSERS.map((t) => t.length)) - 1

export function speechFilter() {
  let buffer = ''
  let thinking = false

  /** Longest suffix of `s` that could still grow into one of `tags`. */
  const holdback = (s, tags) => {
    const max = Math.min(s.length, MAX_HOLDBACK)
    for (let k = max; k > 0; k--) {
      const tail = s.slice(s.length - k)
      if (tags.some((t) => t.startsWith(tail))) return k
    }
    return 0
  }

  const firstMatch = (s, tags) => {
    let best = -1
    let tag = null
    for (const t of tags) {
      const i = s.indexOf(t)
      if (i !== -1 && (best === -1 || i < best)) { best = i; tag = t }
    }
    return { index: best, tag }
  }

  return {
    /** Feed one delta in; get the speakable part out (possibly empty). */
    push(delta) {
      buffer += delta
      let out = ''

      for (;;) {
        if (thinking) {
          const { index, tag } = firstMatch(buffer, CLOSERS)
          if (index === -1) {
            // Still inside the block. Drop what cannot be part of a closer and
            // keep only a tail that might complete one next delta.
            buffer = buffer.slice(buffer.length - holdback(buffer, CLOSERS))
            return out
          }
          buffer = buffer.slice(index + tag.length)
          thinking = false
          continue
        }

        const { index, tag } = firstMatch(buffer, OPENERS)
        if (index !== -1) {
          out += buffer.slice(0, index)
          buffer = buffer.slice(index + tag.length)
          thinking = true
          continue
        }

        const keep = holdback(buffer, OPENERS)
        out += buffer.slice(0, buffer.length - keep)
        buffer = keep ? buffer.slice(buffer.length - keep) : ''
        return out
      }
    },

    /** End of turn: release anything held back — unless it is thinking, which dies here. */
    flush() {
      const out = thinking ? '' : buffer
      buffer = ''
      thinking = false
      return out
    },
  }
}

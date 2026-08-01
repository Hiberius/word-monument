/**
 * Layer-2 moderation: a safety classifier on Groq, run after payment.
 *
 * Plain `fetch`, no SDK, for the same reason as the Stripe client elsewhere:
 * SDKs drag in Node HTTP agent chains that do not run under workerd.
 *
 * The model is a policy-conditioned classifier rather than a fixed taxonomy,
 * which matters here. A general-purpose moderation endpoint scores text against
 * categories designed for chat logs, and an inscription is not a chat log: it
 * is four words on a gravestone. Handing it an explicit policy is what stops it
 * flagging grief and profanity, which is most of what people will actually pay
 * to write.
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODERATION_TIMEOUT_MS = 20_000
const MODERATION_MODEL = 'openai/gpt-oss-safeguard-20b'

/** Bumped whenever POLICY changes, and stored with the verdict, so a decision
 *  made months ago can be read against the rules that produced it. */
export const POLICY_VERSION = 1

/**
 * Deliberately narrow. Everything this does not name is SAFE, including things
 * a generic classifier reliably gets wrong on this surface: grief, religion,
 * political opinion, swearing as emphasis, and strings that are not words at
 * all. Verified against the live model: "FUCK CANCER" and "RIP DAD 1954 2019"
 * come back SAFE, while a named threat and an incitement come back UNSAFE.
 */
const POLICY = `You classify short inscriptions that people pay to engrave permanently on a public wall. Each is a few words, often a name, a date, or a dedication.

Return UNSAFE only if the inscription contains: hate or slurs targeting a group, harassment or threats against a person, sexual content involving minors, incitement to violence, or doxxing of a private individual.

Return SAFE for everything else, including grief, religion, politics as opinion, profanity used as emphasis, and text you do not understand.

Answer with exactly one word: SAFE or UNSAFE.`

export interface ModerationResult {
  flagged: boolean
  categories: Record<string, boolean>
  /** This classifier is binary, so there is no score to record. The shape is
   *  kept because the admin view and the jsonb column already read it. */
  scores: Record<string, number>
}

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Returns null on any network error, timeout, rate limit, missing key, or
 * unparseable answer. The caller MUST treat null as "retry later", never as
 * flagged and never as clear: `moderation_checked_at` stays NULL and the cron
 * sweep picks the row up again.
 */
export async function moderateText(text: string): Promise<ModerationResult | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[moderation/groq] GROQ_API_KEY is not configured')
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        messages: [
          { role: 'system', content: POLICY },
          { role: 'user', content: text },
        ],
        // Zero because two identical inscriptions must never get different
        // verdicts. The token ceiling is high despite the one-word answer:
        // this model reasons before answering, and a tight cap truncates it
        // into returning nothing at all.
        temperature: 0,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      // 429 lands here too, which is correct: a rate-limited check is a check
      // that has not happened yet.
      console.error(`[moderation/groq] request failed with status ${response.status}`)
      return null
    }

    const data = (await response.json()) as GroqChatResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      console.error('[moderation/groq] response had no content')
      return null
    }

    return parseVerdict(content)
  } catch (error) {
    console.error('[moderation/groq] request error', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Exported for tests: this is the part that breaks if the model's output
 * drifts, and it should be checkable without a network call.
 */
export function parseVerdict(raw: string): ModerationResult | null {
  const verdict = raw.trim().toUpperCase()

  // Matched at the edges rather than by equality, because a model that starts
  // answering in sentences should still be understood, while one that says
  // both words in a hedge should not be guessed at.
  const saysSafe = /(^|\W)SAFE(\W|$)/.test(verdict) && !/UNSAFE/.test(verdict)
  const saysUnsafe = /UNSAFE/.test(verdict)

  if (saysUnsafe) {
    return {
      flagged: true,
      categories: { policy_violation: true },
      scores: { policy_version: POLICY_VERSION },
    }
  }

  if (saysSafe) {
    return { flagged: false, categories: {}, scores: { policy_version: POLICY_VERSION } }
  }

  // Neither word, or both ambiguously: not a classification, so not a
  // clearance either.
  console.error('[moderation/groq] unrecognized verdict', raw.slice(0, 120))
  return null
}

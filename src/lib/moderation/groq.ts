/**
 * Layer-2 moderation, running Llama Guard on Groq.
 *
 * Replaces the OpenAI moderations endpoint. Groq's free tier covers this
 * comfortably at the volume a purchase-triggered check produces, and Llama
 * Guard is a purpose-built safety classifier rather than a general model asked
 * politely to behave like one, so its output shape is fixed and parseable.
 *
 * Plain `fetch`, no SDK, for the same reason as the Stripe client elsewhere in
 * this project: SDKs drag in Node HTTP agent chains that do not run under the
 * Cloudflare Workers runtime.
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODERATION_TIMEOUT_MS = 6000;
const MODERATION_MODEL = 'meta-llama/llama-guard-4-12b';

/**
 * Llama Guard answers with the literal word `safe`, or `unsafe` followed by a
 * newline and one or more hazard codes. The full taxonomy is wider than this,
 * but only the categories that can plausibly appear in an inscription are
 * named: the rest are recorded under their raw code rather than dropped, so a
 * surprise still reaches the moderation queue with something readable in it.
 */
const HAZARD_CODES: Record<string, string> = {
  S1: 'violent_crimes',
  S2: 'non_violent_crimes',
  S3: 'sex_crimes',
  S4: 'child_exploitation',
  S5: 'defamation',
  S6: 'specialized_advice',
  S7: 'privacy',
  S8: 'intellectual_property',
  S9: 'indiscriminate_weapons',
  S10: 'hate',
  S11: 'self_harm',
  S12: 'sexual_content',
  S13: 'elections',
  S14: 'code_interpreter_abuse',
}

/**
 * Categories that do not describe a permanent public inscription and would
 * only produce noise in the queue. An eight-letter phrase cannot meaningfully
 * be election interference or an intellectual property violation, and a
 * moderator who has to dismiss those repeatedly stops reading the queue.
 */
const IGNORED_HAZARDS = new Set(['S6', 'S8', 'S13', 'S14'])

export interface ModerationResult {
  flagged: boolean
  categories: Record<string, boolean>
  /** Llama Guard is a classifier, not a scorer: a hit is 1, everything else is
   *  absent. Kept so the stored shape matches what the admin view already
   *  reads, rather than changing the column for one provider swap. */
  scores: Record<string, number>
}

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Returns null on any network error, timeout, missing key, or unparseable
 * response. The caller MUST treat null as "retry later", never as flagged or
 * clear: `moderation_checked_at` stays NULL and the sweep picks it up again.
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
        // Llama Guard classifies the last turn in a conversation, so the
        // inscription is presented as a user turn. Temperature 0 because two
        // identical inscriptions must not get different verdicts, and the
        // token cap is small because a valid answer is at most a few tokens.
        messages: [{ role: 'user', content: text }],
        temperature: 0,
        max_tokens: 32,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`[moderation/groq] request failed with status ${response.status}`)
      return null
    }

    const data = (await response.json()) as GroqChatResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim().length === 0) {
      console.error('[moderation/groq] response had no content')
      return null
    }

    return parseGuardVerdict(content)
  } catch (error) {
    console.error('[moderation/groq] request error', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Exported for the unit tests: the parser is the part most likely to break if
 * the model's output drifts, and it should be checkable without a network call.
 */
export function parseGuardVerdict(raw: string): ModerationResult | null {
  const lines = raw
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const verdict = lines[0]?.toLowerCase()

  if (verdict === 'safe') {
    return { flagged: false, categories: {}, scores: {} }
  }

  if (verdict !== 'unsafe') {
    // Anything other than the two documented answers means the model did not
    // classify, which is a retry rather than a clearance.
    console.error('[moderation/groq] unrecognized verdict', raw.slice(0, 120))
    return null
  }

  // Codes may arrive comma-separated on one line or split across lines.
  const codes = lines
    .slice(1)
    .flatMap((line) => line.split(','))
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^S\d{1,2}$/.test(code))

  const relevant = codes.filter((code) => !IGNORED_HAZARDS.has(code))

  // Unsafe with only ignored categories is not worth a moderator's attention,
  // but the codes are still recorded so a pattern of them is visible later.
  const categories: Record<string, boolean> = {}
  const scores: Record<string, number> = {}
  for (const code of codes) {
    const name = HAZARD_CODES[code] ?? code.toLowerCase()
    categories[name] = !IGNORED_HAZARDS.has(code)
    scores[name] = IGNORED_HAZARDS.has(code) ? 0 : 1
  }

  // `unsafe` with no parseable code at all is a malformed answer, not a clean
  // one: flag it so a human looks rather than letting it through silently.
  const flagged = relevant.length > 0 || codes.length === 0

  return { flagged, categories, scores }
}

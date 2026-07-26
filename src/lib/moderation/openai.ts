/**
 * Thin fetch-based client for the OpenAI moderations endpoint.
 *
 * Deliberately uses plain `fetch` rather than the `openai` npm SDK - the
 * SDK pulls in a Node-HTTP-agent dependency chain that does not run under
 * the Cloudflare Workers runtime (same risk class as the Stripe SDK issue
 * elsewhere in this project).
 */

const OPENAI_MODERATIONS_URL = 'https://api.openai.com/v1/moderations';
const MODERATION_TIMEOUT_MS = 6000;
const MODERATION_MODEL = 'omni-moderation-latest';

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
}

interface OpenAIModerationApiResult {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
}

interface OpenAIModerationApiResponse {
  results?: OpenAIModerationApiResult[];
}

/**
 * Returns null on any network error, timeout, or malformed response - the
 * caller MUST treat null as "retry later", never as flagged or clear.
 */
export async function moderateText(text: string): Promise<ModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[moderation/openai] OPENAI_API_KEY is not configured');
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_MODERATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[moderation/openai] moderation request failed with status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as OpenAIModerationApiResponse;
    const result = data.results?.[0];
    if (!result) {
      console.error('[moderation/openai] moderation response had no results');
      return null;
    }

    return {
      flagged: Boolean(result.flagged),
      categories: result.categories ?? {},
      scores: result.category_scores ?? {},
    };
  } catch (error) {
    console.error('[moderation/openai] moderation request error', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

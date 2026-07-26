/**
 * KV-backed sliding-window-ish (fixed window) rate limiter.
 *
 * `KVNamespace` is the ambient Cloudflare Workers runtime type supplied by
 * `wrangler types` (see the `cf-typegen` script and `wrangler.toml`) - no
 * import needed, same pattern `@opennextjs/cloudflare`'s own types use.
 */

interface RateLimitBucket {
  count: number;
  resetAt: number; // epoch ms
}

// Per-isolate fast path. Workers isolates are ephemeral and may be reused
// across requests, so this in-memory map is purely an optimization to
// short-circuit obvious repeat-offenders without a KV round trip - KV
// remains the cross-isolate source of truth.
const memoryBuckets = new Map<string, RateLimitBucket>();

/**
 * True means the request is allowed.
 *
 * - If `kv` is undefined (e.g. local `next dev` without Cloudflare
 *   bindings), fails OPEN - always allows - rather than throwing.
 * - On any KV error, also fails open and logs a warning rather than
 *   blocking real traffic on a KV outage.
 */
export async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Date.now();

  const cached = memoryBuckets.get(key);
  if (cached) {
    if (cached.resetAt <= now) {
      memoryBuckets.delete(key);
    } else if (cached.count >= limit) {
      return false;
    }
  }

  if (!kv) {
    return true;
  }

  try {
    const raw = await kv.get(key);
    const parsed = raw ? (JSON.parse(raw) as RateLimitBucket) : null;

    if (parsed && parsed.resetAt > now) {
      if (parsed.count >= limit) {
        memoryBuckets.set(key, parsed);
        return false;
      }

      const updated: RateLimitBucket = { count: parsed.count + 1, resetAt: parsed.resetAt };
      const ttlSeconds = Math.max(1, Math.ceil((parsed.resetAt - now) / 1000));
      await kv.put(key, JSON.stringify(updated), { expirationTtl: ttlSeconds });
      memoryBuckets.set(key, updated);
      return true;
    }

    const created: RateLimitBucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    await kv.put(key, JSON.stringify(created), { expirationTtl: windowSeconds });
    memoryBuckets.set(key, created);
    return true;
  } catch (error) {
    console.warn('[rate-limit-kv] KV error, failing open', error);
    return true;
  }
}

/**
 * Constant-time string comparison via Web Crypto. Used anywhere a
 * server-known secret is compared against a client-supplied value (cron
 * shared-secret headers, etc.) - a plain `===`/`!==` comparison short-circuits
 * on the first mismatched byte, which is exactly the kind of timing
 * side-channel this codebase already avoids for the Stripe webhook signature
 * check (see src/lib/stripe/webhook.ts) via crypto.subtle.verify.
 *
 * Hashing both sides first means the comparison is over fixed-length digests
 * regardless of the original strings' lengths, so no timing signal leaks
 * length information either.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);

  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

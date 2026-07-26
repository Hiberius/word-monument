/**
 * Client IP extraction + hashing. Raw IPs are never stored or logged -
 * only the truncated hash produced by hashIp is persisted.
 */

/**
 * In production (behind Cloudflare), only `cf-connecting-ip` is trusted -
 * it is set by Cloudflare's edge and cannot be spoofed by the client.
 * Outside production (local `next dev`, no Cloudflare in front), that
 * header will not be present, so we fall back to the first entry of
 * `x-forwarded-for` purely to make local rate-limit testing possible. That
 * header is trivially spoofable and must never be trusted in production.
 */
export function getClientIp(headers: Headers): string {
  if (process.env.NODE_ENV === 'production') {
    const cfConnectingIp = headers.get('cf-connecting-ip');
    return cfConnectingIp?.trim() || '0.0.0.0';
  }

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstEntry = forwardedFor.split(',')[0]?.trim();
    if (firstEntry) {
      return firstEntry;
    }
  }

  return '127.0.0.1';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const IP_HASH_LENGTH = 16;

let cachedHmacKey: Promise<CryptoKey> | null = null;

function getIpHashKey(): Promise<CryptoKey> {
  if (!cachedHmacKey) {
    const secret = process.env.IP_HASH_SECRET;
    if (!secret) {
      throw new Error('IP_HASH_SECRET is not configured');
    }
    cachedHmacKey = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return cachedHmacKey;
}

/**
 * HMAC-SHA256(IP_HASH_SECRET, ip), not a bare SHA-256(ip). A bare hash of an
 * IPv4 address is trivially reversible - the entire ~4.3 billion-address
 * space can be brute-forced in well under a minute on commodity hardware -
 * which would fully deanonymize any stored reserved_by_ip_hash /
 * reporter_ip_hash the moment anyone with DB read access looked at one.
 * Keying it with a server-only secret makes that infeasible without the key.
 */
export async function hashIp(ip: string): Promise<string> {
  const key = await getIpHashKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return bytesToHex(new Uint8Array(signature)).slice(0, IP_HASH_LENGTH);
}

import bcrypt from 'bcryptjs';

/**
 * Cookie name used for the admin session. Whoever builds the admin
 * login/logout routes should set/clear a cookie under this exact name with
 * the value returned by createAdminSessionCookieValue.
 */
export const ADMIN_SESSION_COOKIE_NAME = 'wm_admin_session';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface AdminSessionPayload {
  issuedAt: number;
  expiresAt: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not configured');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Uses bcryptjs (pure JS) - the native `bcrypt` package does not run under Cloudflare Workers. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !password) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('[security/admin-auth] password verification error', error);
    return false;
  }
}

/**
 * Produces `<base64url payload>.<hex HMAC-SHA256 signature>`, suitable for
 * direct use as a cookie value.
 */
export async function createAdminSessionCookieValue(): Promise<string> {
  const now = Date.now();
  const payload: AdminSessionPayload = { issuedAt: now, expiresAt: now + SESSION_DURATION_MS };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey();
  const signatureBytes = await crypto.subtle.sign('HMAC', key, payloadBytes);

  return `${payloadB64}.${bytesToHex(new Uint8Array(signatureBytes))}`;
}

/** Never throws - returns false on any malformed, invalid, or expired input. */
export async function verifyAdminSessionCookieValue(value: string): Promise<boolean> {
  try {
    if (!value) {
      return false;
    }

    const separatorIndex = value.lastIndexOf('.');
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      return false;
    }

    const payloadB64 = value.slice(0, separatorIndex);
    const signatureHex = value.slice(separatorIndex + 1);

    const payloadBytes = base64UrlDecode(payloadB64);
    const key = await getHmacKey();
    const isValidSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(signatureHex),
      payloadBytes
    );

    if (!isValidSignature) {
      return false;
    }

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<AdminSessionPayload>;
    if (typeof payload.expiresAt !== 'number') {
      return false;
    }

    return payload.expiresAt > Date.now();
  } catch (error) {
    console.error('[security/admin-auth] session verification error', error);
    return false;
  }
}

function parseCookieHeader(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const name = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

/** Use as the first statement of every admin API route handler. */
export async function requireAdmin(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return false;
  }

  const sessionValue = parseCookieHeader(cookieHeader)[ADMIN_SESSION_COOKIE_NAME];
  if (!sessionValue) {
    return false;
  }

  return verifyAdminSessionCookieValue(sessionValue);
}

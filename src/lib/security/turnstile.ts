const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success?: boolean;
}

/**
 * Verifies a Cloudflare Turnstile token server-side. Returns false on any
 * error (missing secret, network failure, non-2xx, malformed response) -
 * never throws.
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey || !token) {
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secretKey);
    body.set('response', token);
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as TurnstileVerifyResponse;
    return data.success === true;
  } catch (error) {
    console.error('[security/turnstile] verification error', error);
    return false;
  }
}

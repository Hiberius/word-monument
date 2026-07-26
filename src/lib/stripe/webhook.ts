/**
 * Verifies Stripe webhook signatures via Web Crypto (crypto.subtle), not the
 * `stripe` npm SDK's constructEvent - see client.ts for why the SDK is banned
 * at runtime on this stack.
 */

const MAX_TIMESTAMP_AGE_SECONDS = 300 // 5 minutes - replay protection, fails closed

interface ParsedSignatureHeader {
  timestamp: number
  v1Signatures: string[]
}

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: number | null = null
  const v1Signatures: string[] = []

  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2)
    if (key === 't' && value) {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        throw new Error('Stripe-Signature header contains an unparseable timestamp')
      }
      timestamp = parsed
    } else if (key === 'v1' && value) {
      v1Signatures.push(value)
    }
  }

  if (timestamp === null) {
    throw new Error('Stripe-Signature header is missing a timestamp')
  }

  if (v1Signatures.length === 0) {
    throw new Error('Stripe-Signature header is missing a v1 signature')
  }

  return { timestamp, v1Signatures }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Stripe-Signature header contains a malformed hex signature')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function constructStripeEventAsync(rawBody: string, signatureHeader: string, secret: string): Promise<any> {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header')
  }

  if (!secret) {
    throw new Error('Missing Stripe webhook secret')
  }

  const { timestamp, v1Signatures } = parseSignatureHeader(signatureHeader)

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > MAX_TIMESTAMP_AGE_SECONDS) {
    throw new Error('Stripe-Signature timestamp is outside the allowed tolerance window, possible replay')
  }

  const signedPayload = `${timestamp}.${rawBody}`
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify',
  ])

  let verified = false
  for (const signature of v1Signatures) {
    let signatureBytes: Uint8Array
    try {
      signatureBytes = hexToBytes(signature)
    } catch {
      continue
    }

    // crypto.subtle.verify performs a genuinely constant-time comparison internally.
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as BufferSource,
      encoder.encode(signedPayload) as BufferSource
    )
    if (isValid) {
      verified = true
      break
    }
  }

  if (!verified) {
    throw new Error('Stripe webhook signature verification failed')
  }

  return JSON.parse(rawBody)
}

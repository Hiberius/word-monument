/**
 * Hand-rolled fetch()-based Stripe REST client.
 *
 * DO NOT import or use the `stripe` npm package at runtime anywhere in this app.
 * On Cloudflare Workers (via @opennextjs/cloudflare), the official SDK's outbound
 * calls have been observed to hang indefinitely and never resolve. This client
 * uses plain fetch() with an explicit AbortController timeout instead.
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const REQUEST_TIMEOUT_MS = 12_000

type StripeErrorBody = { error?: { message?: string; type?: string } }

function appendFormEntry(entries: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormEntry(entries, `${key}[${index}]`, item))
    return
  }

  if (typeof value === 'object') {
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      appendFormEntry(entries, `${key}[${nestedKey}]`, nestedValue)
    }
    return
  }

  entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
}

function encodeFormBody(params: Record<string, unknown>): string {
  const entries: string[] = []
  for (const [key, value] of Object.entries(params)) {
    appendFormEntry(entries, key, value)
  }
  return entries.join('&')
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    let url = `${STRIPE_API_BASE}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secretKey}`,
    }
    // Idempotency-Key makes a retried mutation a safe no-op that returns the
    // original result, so a lost response can't produce a duplicate refund.
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey
    }
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    }

    if (method === 'POST') {
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
      if (params) {
        init.body = encodeFormBody(params)
      }
    } else if (params) {
      const query = encodeFormBody(params)
      if (query) {
        url = `${url}?${query}`
      }
    }

    let response: Response
    try {
      response = await fetch(url, init)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Stripe API request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`)
      }
      throw err
    }

    const text = await response.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Stripe API returned a non-JSON response (status ${response.status}) for ${path}`)
    }

    if (!response.ok) {
      const message = (json as StripeErrorBody)?.error?.message ?? `Stripe API error (status ${response.status}) for ${path}`
      throw new Error(message)
    }

    return json as T
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function createCheckoutSession(params: {
  lineItemDescription: string
  amountCents: number
  successUrl: string
  cancelUrl: string
  clientReferenceId: string
  reservationId: string
  expiresAtUnixSeconds: number
}): Promise<{ id: string; url: string }> {
  const body = {
    mode: 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.clientReferenceId,
    expires_at: params.expiresAtUnixSeconds,
    // Card only, deliberately. Delayed-notification methods (ACH/SEPA/BACS
    // debit etc.) fire checkout.session.completed immediately with
    // payment_status: 'unpaid' while the debit is still processing - cells
    // would get marked sold and published before money actually changed
    // hands, with no automatic reversal if the debit later fails. Card
    // payments settle synchronously, so completed always means paid.
    payment_method_types: ['card'],
    metadata: {
      reservation_id: params.reservationId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: params.amountCents,
          product_data: {
            name: params.lineItemDescription,
          },
        },
      },
    ],
  }

  const session = await stripeRequest<{ id: string; url: string }>('POST', '/checkout/sessions', body)
  return { id: session.id, url: session.url }
}

export async function createRefund(
  paymentIntentId: string,
  amountCents?: number,
): Promise<{ id: string; status: string }> {
  // Keyed on the payment intent so a retry (e.g. the anomaly-refund path firing
  // twice on a webhook redelivery) can never issue a second refund. A partial
  // refund (amountCents set) uses a distinct key from the full-refund path,
  // but stays idempotent per payment intent.
  const params: Record<string, unknown> = { payment_intent: paymentIntentId }
  if (typeof amountCents === 'number') {
    params.amount = amountCents
  }
  const refund = await stripeRequest<{ id: string; status: string }>(
    'POST',
    '/refunds',
    params,
    typeof amountCents === 'number' ? `refund:partial:${paymentIntentId}` : `refund:${paymentIntentId}`,
  )
  return { id: refund.id, status: refund.status }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retrieveCheckoutSession(sessionId: string): Promise<any> {
  return stripeRequest<unknown>('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`)
}

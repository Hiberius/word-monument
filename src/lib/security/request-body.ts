/**
 * Bounded JSON body reader. Mirrors the pattern already used in
 * src/app/api/webhooks/stripe/route.ts (Content-Length pre-check + a
 * post-read byte-length re-check, so a spoofed/missing Content-Length header
 * can't bypass the cap) - pulled out here so /api/reserve, /api/checkout,
 * and /api/reports don't each buffer an unbounded body into memory before
 * their own field-level validation gets a chance to reject it.
 */
export type BoundedJsonResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 413 | 400; error: string }

export async function readBoundedJson(request: Request, maxBytes: number): Promise<BoundedJsonResult> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, status: 413, error: 'Payload too large.' }
    }
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return { ok: false, status: 400, error: 'Could not read request body.' }
  }

  if (new TextEncoder().encode(rawBody).length > maxBytes) {
    return { ok: false, status: 413, error: 'Payload too large.' }
  }

  if (!rawBody) {
    return { ok: false, status: 400, error: 'Empty request body.' }
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body.' }
  }
}

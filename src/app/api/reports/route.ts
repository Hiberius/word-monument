import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getClientIp, hashIp } from '@/lib/security/rate-limit';
import { checkRateLimit } from '@/lib/security/rate-limit-kv';
import { readBoundedJson } from '@/lib/security/request-body';
import { reportCell } from '@/lib/db/reports';

const REPORT_RATE_LIMIT = 5;
const REPORT_RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REASON_LENGTH = 500;
// Headroom over MAX_REASON_LENGTH (500 chars) plus a cellId and JSON overhead.
const MAX_BODY_BYTES = 4 * 1024;

interface ReportRequestBody {
  cellId?: unknown;
  reason?: unknown;
}

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.RATE_LIMIT;
  } catch (error) {
    console.warn('[api/reports] Cloudflare context unavailable, skipping KV-backed rate limiting', error);
    return undefined;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // Rate limit BEFORE reading the body - an oversized/malicious payload
  // shouldn't get parsed at all once an IP is already over its limit.
  const clientIp = getClientIp(request.headers);
  const ipHash = await hashIp(clientIp);

  const kv = await getRateLimitKv();
  const allowed = await checkRateLimit(
    kv,
    `rl:report:${ipHash}`,
    REPORT_RATE_LIMIT,
    REPORT_RATE_LIMIT_WINDOW_SECONDS
  );

  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const parsed = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as ReportRequestBody;

  const { cellId, reason } = body;

  if (typeof cellId !== 'number' || !Number.isInteger(cellId) || cellId < 0) {
    return NextResponse.json({ error: 'cellId must be a non-negative integer' }, { status: 400 });
  }

  if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `reason must be a non-empty string up to ${MAX_REASON_LENGTH} characters` },
      { status: 400 }
    );
  }

  const reported = await reportCell(cellId, reason.trim(), ipHash);

  return NextResponse.json({ reported }, { status: 200 });
}

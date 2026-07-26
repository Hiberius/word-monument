import path from "node:path";
import type { NextConfig } from "next";

// Security response headers applied to every route. CSP is pragmatic: it
// allowlists the third parties this app actually loads (Cloudflare Turnstile,
// Stripe, Supabase) and uses 'unsafe-inline' because there is no nonce
// pipeline and no user-HTML injection surface (React escapes everything; no
// dangerouslySetInnerHTML on user content). frame-ancestors 'none' + HSTS +
// nosniff + Referrer/Permissions-Policy close the headers the audit flagged
// as entirely missing. A nonce-based script-src is a future hardening.
// 'unsafe-eval' only in development - Next's dev/HMR bundler needs it, but it
// must never ship to production. Production script-src stays eval-free.
const IS_DEV = process.env.NODE_ENV !== "production";
const SCRIPT_SRC = [
  "script-src 'self' 'unsafe-inline'",
  IS_DEV ? "'unsafe-eval'" : "",
  "https://challenges.cloudflare.com https://js.stripe.com",
]
  .filter(Boolean)
  .join(" ");

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://challenges.cloudflare.com",
  "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly - a stray package-lock.json in the
  // user's home directory (predates this project) otherwise makes Next.js
  // guess the wrong root and warn on every build.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

// Enables `getCloudflareContext()` (bindings, env, cf properties) to work
// during `next dev`, not just in the built Worker. No-op in production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

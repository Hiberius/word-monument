# Setup guide

Word Monument sells permanent, individually numbered words engraved into a public digital monument - each word is purchased once, reserved briefly during checkout, and then locked in forever once payment succeeds. The app is a Next.js 15 site backed by Supabase (reservations, ledger, content moderation) and Stripe (payment), deployed as a Cloudflare Worker via OpenNext.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Fill in `.env.local` with:

- Your Supabase project's URL, anon key, and service role key.
- Test-mode Stripe keys (see below).
- A Turnstile site key/secret pair (test keys are fine locally).
- An OpenAI API key, if the content-moderation path needs it locally.
- An `ADMIN_PASSWORD_HASH` generated with `bcryptjs` (never store a plaintext password) and a random `ADMIN_SESSION_SECRET` (32+ bytes) for the admin session cookie.
- A `CRON_SECRET` value - the shared-secret header the cron routes expect.
- An `IP_HASH_SECRET` (32+ bytes) - the HMAC key used to pseudonymize IPs. **Required**: the rate limiter throws at startup if it's missing.

Generate the random secrets with either:

```bash
openssl rand -base64 48          # ADMIN_SESSION_SECRET / CRON_SECRET / IP_HASH_SECRET
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'your-admin-password'   # ADMIN_PASSWORD_HASH
```

## Supabase schema

Apply **every** migration in `supabase/migrations/`, in filename order (`0001`
through the highest-numbered file). Skipping any of them leaves the app broken
in ways that are not obvious: the reservation RPC gains its per-cell colour
argument in `0008`, checkout hardening lands in `0009`, and `0010` is what makes
the public counters readable and stops the public anon key from writing to the
grid. With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each migration's SQL into the Supabase dashboard SQL editor, oldest first. `0001` also seeds all 1,000,000 `cells` rows; if it hits the statement timeout, run it in batches. Until a real project is connected the app runs in demo mode (local stand-in content, no writes) - see `src/lib/supabase/public.ts`.

## Running Stripe in test mode

1. Use a Stripe test-mode key for `STRIPE_SECRET_KEY` (no publishable key is needed: the app redirects to Stripe's hosted Checkout page). A restricted key (`rk_…`) works, but it must grant write access to **Checkout Sessions** and **Refunds** (and read on **PaymentIntents**) or the flow will 4xx.
2. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and log in (`stripe login`).
3. Forward webhooks to the local webhook route and copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Trigger events on demand while developing, e.g.:

   ```bash
   stripe trigger checkout.session.completed
   stripe trigger checkout.session.expired
   ```

## Deploying

Deploy is a manual, locally-run flow - CI (`.github/workflows/ci.yml`) only ever runs lint, typecheck, and a plain `next build`, and never touches Cloudflare or Supabase secrets.

```bash
npm run ship
```

`ship` runs a Next.js build, the OpenNext Cloudflare build, the Cloudflare deploy, and a post-deploy smoke-test placeholder, in that order.

### One-time setup (before the first deploy)

1. Create the two KV namespaces and paste the returned ids into `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create NEXT_INC_CACHE_KV
   npx wrangler kv namespace create RATE_LIMIT
   ```

2. Create the R2 bucket used for the incremental cache:

   ```bash
   npx wrangler r2 bucket create word-monument-cache
   ```

3. Set the server-only secrets on the Worker. These are read at runtime, so
   `wrangler secret` is the right home for them:

   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put ADMIN_SESSION_SECRET
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put IP_HASH_SECRET
   ```

4. **Every `NEXT_PUBLIC_*` value must be present when you BUILD, not on the
   Worker.** Next.js inlines `NEXT_PUBLIC_*` into the JavaScript bundle at build
   time, so a `wrangler secret` or a `[vars]` entry can never reach the browser:
   the client would read `undefined`. In practice that means the Turnstile
   widget never renders and nobody can complete a checkout, with no error to
   explain it.

   Put them in `.env.local` (gitignored) or export them in whatever shell or CI
   job runs the build, then build and deploy:

   ```bash
   # .env.local, read automatically by `npm run build:cf`
   NEXT_PUBLIC_SITE_URL=https://your-domain.com
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
   ```

   `NEXT_PUBLIC_SITE_URL` in particular is baked into canonical tags, the
   sitemap, OG image URLs and the Stripe success/cancel URLs, so changing your
   domain means rebuilding, not just editing config. Re-run `npm run build:cf &&
   npm run deploy:cf` after any change to these.

## Before going live

- [ ] Apply **all** migrations, including `0010` (locks the public read surface)
      and `0011` (stops a stale Stripe expiry event from freeing a live hold).
      Verify afterwards that the anon key cannot write:
      `PATCH /rest/v1/cells_public` must return a permission error, and
      `GET /rest/v1/monument_stats` must return a row rather than an empty array.
- [ ] Build with every `NEXT_PUBLIC_*` set (see the deploy section). Confirm the
      Turnstile widget actually renders on `/checkout` in the deployed build:
      if it is missing, the values did not reach the bundle and no one can pay.
- [ ] Point `NEXT_PUBLIC_SITE_URL` at the real domain and rebuild, then check a
      page's canonical tag and `/sitemap.xml` show that domain.
- [ ] Decide whether both the apex and `www` resolve to the Worker. Both work
      with the current origin check, but pick one as canonical and redirect the
      other so search engines and OG links agree.
- [ ] Run a full Stripe test-mode run-through: a successful payment, a failed payment, an abandoned checkout, and a webhook retry - before switching to live keys.
- [ ] Swap the operator identity placeholder (`OPERATOR_NAME` / `CONTACT_EMAIL` in `src/lib/site.ts`) for the real legal entity name and a monitored business email - it appears on the legal pages and the About contact section.
- [ ] Load-test the reservation endpoint to confirm no double-sells occur under concurrent requests (and that the per-IP advisory lock in `reserve_cells_atomic` holds the per-IP cap under concurrency).
- [ ] Harden the CSP: replace `script-src 'unsafe-inline'` in `next.config.ts` with a per-request nonce (see `rules/web/security.md`) so CSP is real XSS defense-in-depth, not just a present header. Verify the Stripe/Turnstile embeds still load.
- [ ] Get a legal review of the Terms and Content Policy language.
- [ ] Confirm the real domain is registered and pointed at the deployment.

# I'm selling one million letters on the internet, a dollar each, forever

**[wordmonument.com](https://wordmonument.com)** is a grid of 1,000,000 cells.
Each cell holds exactly one character. Each cell costs exactly one dollar. Each
cell sells exactly once, ever. You pick your cells, you type your word, you pay,
and what you wrote stays on the monument permanently. No edits, no resale, no
accounts, no feed, no algorithm. When the grid is full, it closes forever.

In 2005, a student named Alex Tew sold a million pixels for a dollar each to pay
for university, and the Million Dollar Homepage became one of the strangest
success stories of the early web. Twenty years later his page is still up, and
it is a graveyard: most of the links are dead, the companies are gone, the
banners point at nothing. It turns out pixels sold to advertisers age like
advertising.

This project is the same bet with the variable flipped: sell to people instead
of companies, and sell letters instead of pixels. Nobody has an emotional
attachment to a pixel. A letter is a name, a date, a person you lost, a joke
only four people understand. The Million Dollar Homepage was a billboard. This
is a monument.

This repo is the whole thing: the site, the payment pipeline, the moderation
system, the million-cell renderer, and every migration, exactly as deployed.
This README is the story of the four problems that turned out to be hard.

---

## Problem 1: never sell the same cell twice

This is the entire product. Sell a cell twice and you have either taken money
for nothing or destroyed the one promise the product makes. Everything else can
be mediocre; this cannot.

The naive flow (check if available, then write) is a race condition with a
credit card attached. Two buyers hit the same cell within milliseconds, both
checks pass, both get charged. So the whole flow is built backwards from that
failure:

- **Reservations are atomic.** A single Postgres function locks the candidate
  rows with `SELECT ... FOR UPDATE` in ascending id order (constant order means
  two overlapping requests cannot deadlock each other), and either reserves
  every requested cell or reserves nothing and tells you exactly which cells
  you lost. There is no separate "check" step to race against.
- **The reservation TTL and the Stripe session are the same clock.** Stripe's
  hosted checkout can keep a session alive for about 30 minutes minimum. A
  10-minute database hold with a 30-minute payment page is a double-sell with
  extra steps: the hold expires, someone else buys the cell, the first payment
  still lands. Here the hold is 35 minutes and the Stripe session is set to
  expire at the same instant, so the two windows cannot disagree by
  construction.
- **The webhook is the only thing that marks cells sold**, it verifies Stripe's
  HMAC signature before parsing anything, and it is idempotent: every event id
  lands in a table with a unique constraint, so Stripe's retries (which are a
  feature, not a bug) cannot double-apply a purchase.
- **When the race happens anyway**, because a payment can always arrive after a
  sweep released the hold, the webhook refunds the exact shortfall
  automatically and writes the case to an anomalies table. Auditable, not
  silent.
- **Expired holds are swept** by a cron running `FOR UPDATE SKIP LOCKED`, so
  the sweeper can never block, or be blocked by, a purchase completing in the
  same instant.

The test suite for this runs against a real PostgreSQL with every migration
applied, fires concurrent reservations at intersecting cell sets, and asserts
that no cell ever ends up owned twice. Forty assertions. The two times a test
failed, the test was wrong and the code was right, which is the outcome you
want from a suite you wrote after designing for the race from day one.

## Problem 2: Stripe's SDK does not survive Cloudflare Workers

The official `stripe` npm package hangs on Workers. Not errors: hangs. It
assumes Node's HTTP agent internals that the Workers runtime does not provide,
and `stripe.checkout.sessions.create()` simply never resolves.

So the Stripe client here is about a hundred lines of hand-rolled `fetch`
against `api.stripe.com/v1`: form-encoded bodies, an `AbortController` timeout,
and nothing else. Webhook signatures are verified with `crypto.subtle`, which
Workers provide natively: read the raw body before parsing, cap its size,
reject timestamps older than five minutes to kill replays, constant-time
compare the HMAC.

The same reasoning applies to the OpenAI moderation call: raw `fetch`, no SDK.
The rule that fell out of this project: on Workers, an SDK is a liability you
adopt, and a REST API is a contract you can hold in one file.

## Problem 3: draw a million cells without melting anything

A million DOM nodes is not a web page, it is a crime scene. The grid is one
`<canvas>` with a renderer that picks a level of detail from pixels-per-cell:

1. Zoomed all the way out, the whole monument is one bitmap built from a
   400-row density rollup (the million cells divide into 400 tiles of 50x50).
2. Closer, each tile is a solid rectangle. Still no per-cell data on the wire.
3. Closer still, real cells appear as rectangles.
4. Close enough to read, glyphs render in a monospace face, and an HTML overlay
   shows the registry coordinates under your cursor.

Pan and zoom never touch React. The viewport lives in a mutable ref, gestures
write to it directly, and a `requestAnimationFrame` loop repaints. React state
updates happen when you select a cell, not sixty times a second while you drag.
Wheel deltas are normalized per browser (Chrome reports pixels, Firefox reports
lines, and if you read `deltaY` raw, one Firefox notch is worth a thirtieth of
a Chrome one).

Cell data arrives through one cached API route in tile-aligned bounding boxes.
The route snaps every requested box outward to tile edges, and the edge cache
key is derived from the snapped bounds, not the raw URL, so panning by one cell
(or an attacker jittering the coordinates) cannot mint fresh cache entries. A
viral traffic spike hits Cloudflare's edge, not the database connection pool.
This matters because the traffic spike is the point of the product; the one
moment everything works is the one moment everything is on fire.

## Problem 4: people will type things you do not want to sell

Selling permanent public text for a dollar is an invitation. Moderation is two
layers on purpose:

- **Before a reservation exists**: the characters themselves are an explicit
  allowlist (letters, digits, a small punctuation set, a curated emoji list
  compared by exact string, because Unicode grapheme tricks are a real attack
  surface). The assembled message is checked against a blocklist in grid
  reading order, not selection order, so you cannot hide a slur by buying its
  letters out of sequence. Normalization catches the homoglyph games. This
  gate runs before the hold because a reservation locks cells away from real
  buyers for 35 minutes, and letting garbage burn hold slots is a denial of
  service on people trying to pay you.
- **After payment**: an async moderation check runs on sold content and flags
  rather than deletes, a public report button exists on every sold cell, and a
  password-gated admin queue reviews flags. Removal blanks the cell
  permanently and logs the action. The cell is not resold.

The failure mode that cannot be prevented in software: two innocent purchases
landing next to each other and reading as something else. That one is policy,
reporting, and a fast admin, not code.

## The stack, and why it is boring on purpose

| Piece | Choice | The reason |
|---|---|---|
| Framework | Next.js 15, App Router | Server rendering for the pages crawlers read, client canvas for the grid |
| Runtime | Cloudflare Workers via OpenNext | The whole site runs at the edge; there is no origin server to fall over |
| Database | Supabase Postgres | The concurrency model above is row locks and `SECURITY DEFINER` functions; you want a real Postgres for that |
| Payments | Stripe hosted Checkout | Card data never touches this codebase, and the hosted page is the one thing buyers already trust |
| Cache | R2 + KV + the edge Cache API | ISR pages in R2, rate limiting in KV, grid reads in the edge cache |
| State | A hand-rolled store on `useSyncExternalStore` | The cart is a Set and a subscribe function; a state library would be more code than the state |
| Auth | None for buyers, one password for the admin | Accounts are a database of emails waiting to leak; the product does not need them |

The database privileges deserve one sentence: every table denies everything by
default, the public surface is a single column-allowlisted view plus explicit
SELECT-only policies, and the browser's anon key physically cannot write to the
grid. This is verified by a test that replays Supabase's own permissive
bootstrap grants and then proves the anon role still cannot flip a sold cell.
(If you run Supabase yourself, check what its bootstrap grants to `anon` on
views: the answer surprised me, and it is the closest this project came to
shipping a grid a stranger could erase.)

There are also no analytics, no tracking pixels, and no cookies beyond the
admin's session. Not as a flex: the product genuinely does not need to know who
you are, and the privacy page is shorter and truer for it.

## Rules of the monument

1. One dollar per cell, one character per cell.
2. Every cell sells exactly once. No edits, no resale, no exceptions.
3. Nobody can buy more than 300 cells in one purchase, so nobody buys the
   center of the grid in an afternoon.
4. What you write is permanent, unless it breaks the content policy, in which
   case it is removed and the cell dies with it. Removed is not resold.
5. When the millionth cell sells, the monument closes. There is no second
   monument.

## Run it yourself

```bash
git clone https://github.com/Hiberius/word-monument
cd word-monument
npm install
npm run dev
```

With no configuration it runs in demo mode with generated content and payments
disabled, which is enough to explore everything above. Wiring a real Supabase
project, Stripe test keys and the Cloudflare deployment is covered in
[docs/SETUP.md](docs/SETUP.md).

## Questions people actually ask

**Is this the Million Dollar Homepage?**
It is a tribute to it and an argument with it, in equal parts. Same economics,
opposite audience: Tew sold to advertisers, this sells to people. His page
became a wall of dead links because everything on it pointed elsewhere.
Nothing here points anywhere; the words are the destination.

**Why would anyone pay a dollar for a letter?**
The same reason people carve initials into benches and pay for stars they will
never visit. It is not a rational purchase, it is a small permanent mark. The
expected purchase is a word, not a letter: a name at $7, a date at $10, a
sentence at $40.

**What stops you from deleting it all next year?**
Less than you would like, honestly: a public promise, the terms of service,
and the fact that the entire codebase and its history are in this repo for
anyone to fork. Permanence on the internet is a practice, not a property.
The honest version of the promise: the monument outlives interest, or it
never mattered.

**What happens when it sells out?**
It closes to new purchases and stays up. Selling out is the finished state,
not the successful one.

**Can I buy a whole region and write a manifesto?**
Up to 300 cells per purchase, and the content policy applies to what you
write. Beyond that, the grid is first come, first carved.

---

Built by one person. The commit history is the honest build log, arguments
with reviewers included. If you write something on the monument that means
something, the operator would genuinely like to know the story:
hello@wordmonument.com.

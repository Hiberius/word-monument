import { A, Aside, C, Code, Figure, H2, Lede, OL, P, UL } from './prose'

const RESERVE_SQL = `-- Lock candidates in ascending id order (deadlock-safe).
PERFORM 1 FROM cells WHERE id = ANY (p_cell_ids) ORDER BY id FOR UPDATE;

-- Self-heal lapsed reservations back to available before checking.
UPDATE cells
SET status = 'available',
    character = NULL,
    background_color = NULL,
    reservation_id = NULL,
    reserved_until = NULL,
    reserved_by_ip_hash = NULL,
    owner_label = NULL,
    updated_at = v_now
WHERE id = ANY (p_cell_ids)
  AND status = 'reserved'
  AND reserved_until < v_now;

SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::integer[])
INTO v_unavailable
FROM cells
WHERE id = ANY (p_cell_ids)
  AND status <> 'available';

IF cardinality(v_unavailable) > 0 THEN
  RETURN QUERY SELECT false, v_unavailable;
  RETURN;
END IF;`

const VIEW_SQL = `CREATE VIEW cells_public AS
  SELECT id, x, y, status, character, background_color, updated_at
  FROM cells;

REVOKE ALL ON cells_public FROM anon, authenticated;
GRANT SELECT ON cells_public TO anon, authenticated;`

const REPO = 'https://github.com/Hiberius/word-monument'

export default function PointTheAgentsAtEachOther() {
  return (
    <>
      <Lede>
        One of the fixes the AI proposed would have released a stranger&rsquo;s reserved cells
        while their card was being charged.
      </Lede>

      <P>
        It looked reasonable in the diff. Expired reservations should be freed, and the fix freed
        them by matching <C>reserved_by_ip_hash</C> against the incoming request.
      </P>

      <P>
        Adversarial reviewers, whose only instruction was to refute it, killed it. A hash of an IP
        address is not a person. Behind CGNAT or a VPN exit node it is a hash of a crowd. Someone
        halfway through Stripe Checkout would have had their held cells freed underneath them and
        resold while their payment was still in flight. It was reverted entirely. The code was
        correct. The blast radius was outside the diff anyone was looking at.
      </P>

      <P>
        That is the most transferable thing to come out of the build, and it has nothing to do with
        this product. The model that writes a fix is the wrong entity to judge it, and the cheapest
        correction available is another model whose job is to attack.
      </P>

      <H2 id="the-setting">The setting</H2>

      <P>
        In 2005 Alex Tew sold 1,000,000 pixels at a dollar each to pay for university. The Million
        Dollar Homepage made about $1,037,100 and is still online twenty-one years later. It is
        also largely a graveyard. A large share of the linked companies are gone, and the banners
        point at dead domains. Pixels sold to advertisers age like advertising.
      </P>

      <P>
        <A href="/">Word Monument</A> flips the variable. Sell to people instead of companies, and
        sell letters instead of pixels. Nobody is emotionally attached to a pixel. A letter is a
        name, a date, someone who died, a joke four people understand.
      </P>

      <Aside>
        The site is live and the backend is connected: Postgres holds all one million rows and
        Stripe is wired up in test mode, so the loop described below has been run end to end
        against the deployed site rather than a local copy. The key on the Worker is a{' '}
        <C>sk_test_</C> key, which means nothing that happens on it can be charged to anyone.
        Nothing here has been run against real money.
      </Aside>

      <Figure
        src="/img/notes/calculator.png"
        alt="The What would you say box with FOR NONNA typed into it, showing 8 letters, $8.00 total, and a Go place it button."
        caption="Eight letters, eight dollars, forever."
        width={2880}
        height={1800}
      />

      <P>
        One million cells, one character each, one dollar each. Each cell sells exactly once, ever.
        No accounts, no login, no feed, no algorithm. Maximum 300 cells per transaction, and a 35
        minute reservation hold. When the grid fills, it closes.
      </P>

      <Figure
        src="/img/notes/letters.png"
        alt="The grid zoomed in far enough to read individual letters, spelling THE INTERNET FORGETS, THIS DOES NOT, SAY IT WHERE IT STAYS."
        caption="The founding inscription, at glyph zoom."
        width={2880}
        height={1800}
      />

      <P>
        Permanence is a product promise that reduces, in the end, to one database guarantee.
      </P>

      <H2 id="the-one-unforgivable-bug">The one unforgivable bug</H2>

      <P>
        Sell the same cell twice and two people have each paid a dollar for the same letter. Only
        one can have it, in a product whose entire premise is that nothing changes. Refunding the
        loser does not repair that. It sells off the thing the product was.
      </P>

      <P>
        The naive shape is a check followed by a write. Select the requested cells, confirm they are
        available, then update them to reserved. Two requests can both pass the select before either
        performs the update. The window is small, and small windows are exactly what a launch spike
        fills.
      </P>

      <P>
        Pushing the guarantee down into a constraint does not finish the job either. Cells are rows
        that already exist with a status column, so there is no key to make unique, and even if
        there were, a violation aborts the whole transaction and tells the caller only that
        something collided. It does not say which of the 300 cells collided, and that list is what
        the buyer needs in order to move their letters. A constraint is a backstop against a bug. It
        is not a reservation protocol.
      </P>

      <P>
        What is there instead is one <C>SECURITY DEFINER</C> Postgres function that returns{' '}
        <C>TABLE (success boolean, unavailable_cell_ids integer[])</C>. Its middle, verbatim:
      </P>

      <Code label="supabase/migrations/0008_reserve_per_cell_colors.sql">{RESERVE_SQL}</Code>

      <P>
        Three things are doing the work. Locking in ascending id order means two overlapping requests
        that share cells always take their locks in the same sequence, so they cannot deadlock each
        other. The self-heal happens inside that lock, so a lapsed hold becomes available without a
        separate sweep and without a second read. And the result is all-or-nothing: every requested
        cell is reserved, or none are and the caller gets back the exact ids that lost the race. The
        reservation path never reads availability and then writes it as two statements.
      </P>

      <P>
        Full function:{' '}
        <A href={`${REPO}/blob/main/supabase/migrations/0008_reserve_per_cell_colors.sql`}>
          0008_reserve_per_cell_colors.sql
        </A>
        . One thing that file will show you, a few lines above the excerpt:{' '}
        <C>reserved_by_ip_hash</C> is also used to cap how many cells one hash may hold at once. Same
        shared-hash problem, different trade. A crowd behind one NAT hits the cap sooner, and the
        worst outcome there is a refusal rather than somebody else&rsquo;s letters vanishing
        mid-checkout.
      </P>

      <Figure
        src="/img/notes/placement.png"
        alt="The grid with FOR NONNA placed as selected cells, and a tray listing each cell, a recolour row, and a total of 8 cells for $8.00."
        caption="The purchase loop, in one frame."
        width={2880}
        height={1800}
      />

      <P>A few other decisions came out of the same posture:</P>

      <UL>
        <li>
          Row Level Security is deny-all on every base table. The cells are readable only through an
          explicit column-allowlist view, so a column added six months from now is invisible to
          anonymous readers until somebody lists it. Two aggregate tables holding nothing but counts
          are readable directly, because the grid needs them on first paint.
        </li>
        <li>
          The database hold outlives the payment page rather than matching it. The Checkout Session
          gets 35 minutes and the hold behind it is extended to 40. Align them exactly and a payment
          landing in the last second races the sweep releasing its cell at the same instant.
        </li>
        <li>
          Payment races are handled rather than ignored. If a payment lands after its reservation was
          swept and resold, the webhook refunds the exact shortfall automatically and writes a row to
          a <C>payment_anomalies</C> audit table. A partial fulfilment refunds the difference, not
          the whole charge.
        </li>
        <li>
          Grid reads go through one cached route, and the edge cache key is derived from the bounding
          box snapped to tile edges. Panning by one cell, or an attacker jittering coordinates,
          cannot mint new cache entries. Verified live: two different raw URLs that snap to the same
          tile share one cache entry.
        </li>
        <li>
          The renderer is Canvas 2D, not WebGL, on purpose. The per-frame draw count is small at
          every zoom level, so the real bottleneck is viewport-relative data fetching rather than
          draw-call throughput, and WebGL would have added shader and context-loss complexity for
          nothing. Four levels of detail are keyed to pixels per cell, and viewport state lives in a
          mutable ref drawn on <C>requestAnimationFrame</C>, so panning never triggers a React
          re-render.
        </li>
        <li>
          The official Stripe SDK hangs under workerd, so outbound calls go through a hand-rolled
          fetch client against the REST API. Webhook signatures are verified with{' '}
          <C>crypto.subtle</C>, raw body read before any parsing, timestamps older than five minutes
          rejected.
        </li>
      </UL>

      <H2 id="adversarial-verification">Adversarial verification, in enough detail to copy</H2>

      <P>
        The whole thing was written with Claude Code, using Claude Opus 5 and Claude Fable 5, run in
        a multi-agent mode where a workflow script fans work across many subagents in parallel and
        pipelines them through stages. Fanning work out is a throughput decision and nothing more.
        This is the loop that made the output trustworthy:
      </P>

      <OL>
        <li>
          A generation stage produces candidate findings. Bugs, vulnerabilities, proposed fixes,
          anything. Prompt it however you like. Volume is fine here.
        </li>
        <li>
          Every finding goes to one or more independent agents that never see the reasoning that
          produced it. They get the claim and the code.
        </li>
        <li>
          The instruction is not &ldquo;review this&rdquo;, it is &ldquo;refute this&rdquo;, with an
          explicit default: when uncertain, the answer is &ldquo;not a bug&rdquo;.
        </li>
        <li>
          A finding survives only if it can be independently reproduced. A failing assertion, a
          query, an actual run. An argument is not a reproduction.
        </li>
        <li>
          Fixes pass through the same gate as findings. A proposed fix is a claim about behaviour,
          and gets attacked identically.
        </li>
      </OL>

      <P>
        Step three carries most of the weight, and it is one line of prompt. A model asked to review
        will find something, because producing a list is what review looks like. Refutation produces
        a verdict instead of a list, and inverting the default from &ldquo;flag it&rdquo; to
        &ldquo;clear it&rdquo; strips out the confident, plausible, wrong material that unverified AI
        review generates in bulk.
      </P>

      <P>
        Step four is the expensive half and the one people skip. Verification here ran against a real
        PostgreSQL 17 instance, not mocks: 40 payment-logic assertions, all 13 migrations applied
        under Supabase-like bootstrap privileges, and webhook signature verification attacked with
        malformed and forged signatures, all rejected.
      </P>

      <P>
        <strong className="text-ink">What it costs.</strong> Token spend multiplies by roughly the
        number of refutation passes per finding, and the multiplier sits on verification rather than
        on writing code. Refutation is embarrassingly parallel, so in principle it costs tokens
        rather than hours. That was not instrumented here, so treat it as a structural expectation
        and not a measurement. The real cost is environment work. You cannot run this pattern
        without a place where claims can actually be executed.
      </P>

      <P>
        <strong className="text-ink">Where it fails.</strong> Three honest limits.
      </P>

      <P>
        It answers &ldquo;is this claim true&rdquo; and says nothing about &ldquo;is this the right
        thing to build&rdquo;. No quantity of refutation agents will tell you the grid should have
        been a thousand cells instead of a million.
      </P>

      <P>
        It converges on shared blind spots. Agents drawn from the same model family carry the same
        priors. If they all believe something false about how a platform behaves, they will agree
        with each other, confidently, and the consensus will feel like evidence. The IP hash catch
        worked because the claim was checkable against how NAT actually works. Correlated failure is
        why the real environment matters more than the agent count. Postgres does not share the
        model&rsquo;s priors.
      </P>

      <P>
        And it cannot find a category of bug nobody pointed it at. Silence from the loop is not
        evidence of absence.
      </P>

      <H2 id="the-second-catch">The second catch: a public key that could erase the grid</H2>

      <P>
        Supabase hands an anonymous key to the browser by design. It ships in the client bundle.
        Safety rests entirely on RLS policies and table grants, and the failure mode is silent,
        because a correctly working key and an over-privileged key look identical from outside.
      </P>

      <P>
        An audit claimed the anonymous role still had write reach to the cells through the public
        view, after Supabase&rsquo;s own project bootstrap had run. The claim was not accepted on the
        strength of the argument. It was reproduced: all 13 migrations applied to a local PostgreSQL
        17 instance under the same bootstrap privileges Supabase applies, then an <C>UPDATE</C>{' '}
        issued as the anonymous role, which reset a sold cell to available and blanked its character.
      </P>

      <P>
        It worked, and every link in the chain is a default. Supabase&rsquo;s bootstrap runs{' '}
        <C>ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated</C>,
        and that default covers views. <C>cells_public</C> is a single-table projection, which makes
        Postgres treat it as auto-updatable. It was created without <C>security_invoker</C>, so DML
        through it runs as the view owner and never meets the deny-all RLS on <C>cells</C>. PostgREST
        exposes PATCH and DELETE on auto-updatable views. That is grid erasure, using a key anyone
        can read out of the page source.
      </P>

      <P>The fix is two lines that have to be remembered every single time the view is created:</P>

      <Code label="supabase/migrations/0010_lock_public_read_surface.sql">{VIEW_SQL}</Code>

      <P>
        &ldquo;Every time&rdquo; is not rhetorical. A later migration adds a column to the view, and
        Postgres only lets <C>CREATE OR REPLACE VIEW</C> append columns at the end, so the column has
        to arrive via <C>DROP VIEW</C> and <C>CREATE VIEW</C>, and the recreate quietly re-applies the
        bootstrap&rsquo;s blanket grant. The revoke has to be repeated there too.{' '}
        <A href={`${REPO}/blob/main/supabase/migrations/0010_lock_public_read_surface.sql`}>
          See 0010
        </A>
        .
      </P>

      <P>
        The reason the public surface is a view at all, rather than a set of table policies, is
        entirely about the future. A column added to a table with a permissive policy is public the
        moment it exists. A column added behind an allowlist view stays invisible until someone lists
        it.
      </P>

      <H2 id="where-ai-was-bad">Where AI was genuinely bad at this</H2>

      <P>Three things, stated plainly.</P>

      <P>
        It is confidently wrong about platform behaviour at the edges. The Stripe SDK hanging under
        workerd was not deduced by anything. It was discovered by running it.
      </P>

      <P>
        It cannot see state that is not in the repository. Nothing in thirteen migration files
        records that a hosted platform had already granted the anonymous role everything, and reading
        the code proves nothing about the privileges the deployed database actually holds. The
        dangerous default lived outside the artifact under review, which is also true of the IP hash
        fix, and is the general shape of the mistakes worth worrying about.
      </P>

      <P>
        Volume impersonates progress, and this is the one that actually costs you. A single
        generation pass yields a long list that reads like thoroughness, and a large share of it
        evaporates under refutation. Without the gate you spend your time applying fixes to code that
        was never broken. Unverified AI review is worse than no review, because every unnecessary fix
        is a fresh chance to break something that worked.
      </P>

      <H2 id="six-days">Six days, and what they contained</H2>

      <P>Built 2026-07-26 to 2026-07-31.</P>

      <UL>
        <li>116 TypeScript and TSX files, about 12,000 lines in src</li>
        <li>13 SQL migrations, 1,765 lines, 11 Postgres functions, 11 tables</li>
        <li>11 API routes, 33 React components</li>
        <li>
          6 runtime dependencies: <C>next</C>, <C>react</C>, <C>react-dom</C>,{' '}
          <C>@supabase/supabase-js</C>, <C>@number-flow/react</C>, <C>bcryptjs</C>
        </li>
        <li>2.2 MB gzipped Worker bundle</li>
        <li>No state management library, no canvas library, no UI kit, no ORM at runtime</li>
      </UL>

      <P>
        Next.js 15.5 App Router on Cloudflare Workers via <C>@opennextjs/cloudflare</C>, Supabase
        Postgres, Stripe hosted Checkout, Tailwind v4 with no config file, R2 for the incremental
        cache, and three KV namespaces kept separate so an incident in one is not confused with the
        others in the logs.
      </P>

      <P>
        Six dependencies is a verification budget. Every one of them is something the adversarial
        pass has to audit or trust, and trust is the expensive option.
      </P>

      <P>
        The days themselves did not look like prompting and receiving a product. Most of the elapsed
        time went into making claims checkable: standing up real Postgres, applying migrations under
        realistic privileges, writing assertions a proposed fix could fail, forging webhook
        signatures so rejection could be observed instead of assumed. The agents were fast. Building
        the thing that could contradict them was the work.
      </P>

      <H2 id="the-honest-ending">The honest ending</H2>

      <P>
        No real money has moved. Stripe is connected with a test key, so the one purchase this
        system has ever completed cost nobody anything: two cells, two dollars that do not exist,
        paid with a card number Stripe publishes for the purpose. Zero cells have been sold to the
        public. The reservation function that absorbed more attention than anything else has still
        never faced two real buyers at once, and a test suite firing twelve processes at the same
        three rows is not the same thing as a launch.
      </P>

      <P>
        The same rule applies one level up. The method is a refusal to believe claims that have not
        been reproduced, and &ldquo;this works&rdquo; is a claim with no reproduction behind it yet.
      </P>

      <P>
        The grid may never fill. A million cells at a dollar each is a large number, and nothing in
        the code makes anyone want a letter. What is already true is smaller: the Million Dollar
        Homepage is still online after twenty-one years, still pointing at companies that no longer
        exist, which is what happens when you sell space to advertisers. Whether people will buy
        letters instead is not a question a Postgres function can answer. It is the only part of this
        that cannot be verified in advance.
      </P>

      <P>
        Repo: <A href={REPO}>github.com/Hiberius/word-monument</A>, public, deliberately anonymous.
        The code that this piece describes, including the two catches, is all in there.
      </P>
    </>
  )
}

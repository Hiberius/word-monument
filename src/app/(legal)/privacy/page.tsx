// INFORMATIONAL, NOT LEGAL ADVICE. This page describes how the service
// currently handles data in plain language for visitors. It is not a
// substitute for counsel and MUST be reviewed by a qualified privacy lawyer
// (GDPR/UK GDPR + CCPA/CPRA at minimum) before public launch, along with the
// named sub-processor list and international-transfer safeguards below.
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  SITE_NAME,
  SITE_URL,
  OPERATOR_NAME,
  CONTACT_EMAIL,
  SITE_OG_IMAGE,
} from '@/lib/site'

const LAST_UPDATED = '2026-07-12'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `What ${SITE_NAME} collects, why, and exactly which third parties process your data: no accounts, no ad tracking, pseudonymized abuse signals only.`,
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  openGraph: {
    type: 'article',
    title: `Privacy Policy: ${SITE_NAME}`,
    description: `What ${SITE_NAME} collects, why, and how it's handled, including every sub-processor that touches your data.`,
    url: `${SITE_URL}/privacy`,
    images: [SITE_OG_IMAGE],
  },
}

const SUBPROCESSORS = [
  {
    name: 'Stripe',
    role: 'Payment processing',
    body: 'When you buy a cell you are handed off to Stripe to enter and submit your card details. Those card numbers go directly to Stripe and never pass through, or get stored on, our servers. Stripe returns only a payment confirmation and a reference we use to fulfil the order. Stripe is an independent controller of the payment data it collects and handles it under its own privacy policy.',
  },
  {
    name: 'Supabase',
    role: 'Application database',
    body: 'Supabase hosts the database that holds the monument itself: the placed characters and their grid coordinates, order records, any checkout email you provide, and the pseudonymized IP hashes described below. It stores data on our behalf and processes it only to run the service.',
  },
  {
    name: 'Cloudflare',
    role: 'Hosting, CDN & bot protection (Turnstile)',
    body: 'Cloudflare serves the site from its global edge network and runs Turnstile, the challenge that verifies you are a person rather than an automated script before a purchase. As the network in front of the site, Cloudflare processes connection metadata (including your IP address in transit) to route requests and block attacks, and may keep short-lived operational logs for security. It also stores, in its KV storage, the address and join date of anyone on the launch notify list, as described above. It does not receive the contents of your payment.',
  },
  {
    name: 'OpenAI',
    role: 'Automated content moderation',
    body: 'To keep the grid free of hateful, abusive, or illegal content, the assembled text of placed characters is sent to OpenAI’s moderation endpoint for an automated classification. This is text you have chosen to publish on a public wall; it is submitted for the sole purpose of moderation and is not tied to your identity. OpenAI processes it under its API data-usage terms.',
  },
] as const

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Legal</p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">Privacy Policy</h1>
      <p className="mt-4 max-w-xl font-body text-ink-60">
        {SITE_NAME} is a public wall you pay a dollar to write on. There are no
        accounts and no logins, so there is very little about you for us to
        hold. And what little we do keep, we keep deliberately. This page
        says exactly what that is, who else touches it, and what you can ask us
        to do about it.
      </p>
      <p className="mt-4 font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-12 space-y-10 font-body leading-relaxed text-ink-60">
        <Section title="Who is responsible for your data">
          <p>
            The data controller for {SITE_NAME} is {OPERATOR_NAME}. If you have
            a question about this policy, want to exercise one of the rights
            described below, or think something here is wrong, you can reach us
            at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            . That inbox is the single channel for every privacy request on this
            site.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">The characters you place</strong> and
              their grid coordinates. This is the product itself. It is public
              and permanent by design (see below), and it is the one thing here
              we intend to keep forever.
            </li>
            <li>
              <strong className="text-ink">Payment details: handled by Stripe, not us.</strong>{' '}
              Your card number is entered on Stripe and never reaches our
              servers. We store only the fact that an order was paid and a
              Stripe reference for it.
            </li>
            <li>
              <strong className="text-ink">An email address, only if you give one at checkout.</strong>{' '}
              It is used to send your receipt and, if something goes wrong with
              your order, to reach you about it. It is optional and it is not
              used for marketing.
            </li>
            <li>
              <strong className="text-ink">A pseudonymized fingerprint of your IP address.</strong>{' '}
              We do not store your raw IP. We store a short, keyed hash of it,
              used purely to enforce per-visitor limits and stop abuse,
              detailed in its own section below.
            </li>
            <li>
              <strong className="text-ink">An email address, only if you join the launch notify list.</strong>{' '}
              While claiming is not yet open, the site offers a one-field form
              to be told when it is. If you use it we store exactly two things:
              the address you typed and the date you joined, in Cloudflare KV.
              No IP address, no hash, nothing else is stored with it. It is
              used for a launch announcement and nothing further, and you can
              have it removed at any time by writing to the contact address
              below.
            </li>
            <li>
              <strong className="text-ink">The text you place, sent for automated moderation.</strong>{' '}
              The assembled message is checked by an automated moderation
              service to catch content that breaks our{' '}
              <Link
                href="/content-policy"
                className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
              >
                Content Policy
              </Link>
              .
            </li>
          </ul>
        </Section>

        <Section title="What we deliberately do not collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>No accounts, usernames, or passwords. There is nothing to sign up for.</li>
            <li>No raw IP addresses stored or written to our own logs.</li>
            <li>No advertising or cross-site tracking cookies, pixels, or fingerprinting.</li>
            <li>No sale or rental of your data to anyone, for any purpose.</li>
            <li>
              No sensitive categories of data (health, biometrics, precise
              location, and the like). If you volunteer something sensitive
              inside the characters you place, remember that it becomes public.
            </li>
          </ul>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            Ordinary visitors and buyers get{' '}
            <strong className="text-ink">no tracking cookies at all</strong>. We
            do not set analytics or advertising cookies to browse the monument
            or to buy a cell.
          </p>
          <p>
            The only cookie <em>our application</em> sets is an{' '}
            <strong className="text-ink">httpOnly admin session cookie</strong>,
            issued exclusively to the operator when signing in to the
            password-protected moderation console. It never touches a normal
            visit. Separately, our security provider (Cloudflare) may set a
            short-lived, essential bot-protection cookie to tell real visitors
            from automated traffic; it carries no advertising or cross-site
            tracking.
          </p>
          <p>
            Two small pieces of state live in your browser&rsquo;s{' '}
            <code className="font-mono-grid text-sm text-ink">sessionStorage</code>:{' '}
            not cookies, never sent to a server, and wiped the moment you
            close the tab. One remembers which headline variant our homepage copy
            test showed you so it stays consistent while you read; the other
            holds the cells you are mid-way through selecting so a reload
            doesn&rsquo;t lose them. Both are purely functional. Neither tracks
            you across sites or persists after the tab is closed.
          </p>
        </Section>

        <Section title="Placed characters are public and permanent">
          <p>
            The whole point of the monument is that what you write stays up. The
            characters you place and their positions are visible to anyone who
            loads the grid, are included in share images derived from it, and are
            intended to remain indefinitely. Treat every character you place as a
            public, permanent statement, because that is what it is. Do not place
            anything you would not want the world to read, now or years from now.
          </p>
        </Section>

        <Section title="How we handle your IP address (pseudonymization)">
          <p>
            Rate-limiting and abuse prevention need some stable, per-visitor
            signal, but they do not need to know who you are. So instead of
            storing your IP address, we run it through a keyed one-way function
            (HMAC-SHA256 using a secret that lives only on the server)
            and keep just a truncated slice of the result. That value is
            recorded as{' '}
            <code className="font-mono-grid text-sm text-ink">reserved_by_ip_hash</code>{' '}
            when you reserve or buy cells and{' '}
            <code className="font-mono-grid text-sm text-ink">reporter_ip_hash</code>{' '}
            when you report a cell.
          </p>
          <p>
            Because the secret key is required to compute the hash, nobody with
            access to the database can reverse a stored value back into an IP
            address or brute-force the space of possible addresses. The raw IP is
            used transiently in memory to compute the hash and is then discarded.
            It is never written to our database or application logs. The
            hashes exist only to count how many cells come from one source and to
            catch abuse; they are not used to identify or profile you.
          </p>
        </Section>

        <Section title="Automated moderation and OpenAI">
          <p>
            After a purchase (and periodically thereafter as a safety sweep), the
            assembled text of the characters on the affected cells is sent to{' '}
            <strong className="text-ink">OpenAI&rsquo;s moderation endpoint</strong>,
            which returns an automated assessment of whether the content is
            likely to violate our Content Policy. Flagged content is queued for
            human review and may be removed.
          </p>
          <p>
            We disclose this plainly because it means user-submitted content
            leaves our infrastructure: OpenAI receives the text you placed on the
            public grid. It receives that text alone, for moderation only:
            not your email, not your payment, and not the IP hashes. A quicker,
            self-contained blocklist check also runs before payment; that one
            stays entirely on our own servers.
          </p>
        </Section>

        <Section title="Who else processes your data (sub-processors)">
          <p>
            We keep the list of third parties short and name every one of them.
            Each processes only what it needs to do its job, under its own terms:
          </p>
          <ul className="mt-4 space-y-5">
            {SUBPROCESSORS.map((sub) => (
              <li key={sub.name} className="border-t border-rule pt-4">
                <p className="font-headline text-lg text-ink">
                  {sub.name}
                  <span className="ml-2 font-mono-grid text-xs uppercase tracking-[0.15em] text-ink-60">
                    {sub.role}
                  </span>
                </p>
                <p className="mt-1 text-sm">{sub.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="International data transfers">
          <p>
            The providers above are based in, or process data in, the United
            States. If you use the site from the United Kingdom, the European
            Economic Area, or elsewhere, your data (principally the text
            you choose to publish, and, where applicable, your checkout email and
            the pseudonymized hashes) is transferred to and processed in
            the US. Where the law requires it, those transfers rely on the
            safeguards offered by each provider, such as Standard Contractual
            Clauses. You can ask us for details using the contact address above.
          </p>
        </Section>

        <Section title="Legal basis for processing (GDPR / UK GDPR)">
          <p>
            Where the UK GDPR or EU GDPR applies to you, we rely on the following
            legal bases:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">Performance of a contract.</strong>{' '}
              Taking your payment, placing your characters, sending your receipt,
              and delivering the cell you bought are all processing necessary to
              carry out the purchase you asked for.
            </li>
            <li>
              <strong className="text-ink">Legitimate interests.</strong>{' '}
              Preventing fraud and abuse, enforcing per-visitor limits, running
              content moderation, and keeping the service secure rest on our
              legitimate interest (and the public interest) in
              running a wall a million people can write on without it filling
              with abuse. We have designed these to be as data-minimizing as we
              can (pseudonymized hashes rather than stored IPs, no profiles).
            </li>
            <li>
              <strong className="text-ink">Legal obligation.</strong>{' '}
              We may retain certain transaction records where accounting or tax
              law requires it, and we act on lawful requests and mandatory
              reporting obligations (for example, content involving the
              exploitation of minors).
            </li>
          </ul>
        </Section>

        <Section title="Your rights and how to use them">
          <p>
            Depending on where you live, you may have the right to request access
            to the personal data we hold about you, to have it corrected, to have
            it deleted, to restrict or object to certain processing, and to data
            portability. To exercise any of these, email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            . We will respond within the timeframe the applicable law requires.
          </p>
          <p>
            One honest limit: a deletion request{' '}
            <strong className="text-ink">cannot remove characters you have already placed</strong>.
            They are public and permanent by design, and the monument would not
            work if any cell could be recalled. Deletion applies to other
            associated data we hold, such as a checkout email on file. If a
            specific cell needs to come down because it breaks the rules, that is
            a moderation matter: use the Report control on the grid or see our{' '}
            <Link
              href="/content-policy"
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              Content Policy
            </Link>
            . You also have the right to complain to your local data-protection
            authority.
          </p>
        </Section>

        <Section title="California privacy (CCPA / CPRA)">
          <p>
            <strong className="text-ink">We do not sell your personal information, and we do not share it for cross-context behavioural advertising.</strong>{' '}
            We never have. California residents have the right to know what
            personal information we collect and to request its deletion, subject
            to the same permanence limit above, and we will not discriminate
            against you for exercising those rights. Use the same contact address
            to make a request.
          </p>
        </Section>

        <Section title="Children">
          <p>
            {SITE_NAME} is not directed to children, and it is intended for
            people aged 18 or older. We do not knowingly collect personal
            information from anyone under 18. If you believe a minor has provided
            us information or placed content, contact us and we will address it,
            including removing associated data where we are able to.
          </p>
        </Section>

        <Section title="How long we keep things">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">Placed characters and their positions:</strong>{' '}
              indefinitely. Permanence is the product.
            </li>
            <li>
              <strong className="text-ink">Payment data:</strong> held and
              retained by Stripe under its own policy; on our side we keep only
              the minimal order record and reference for as long as accounting
              and legal obligations require.
            </li>
            <li>
              <strong className="text-ink">Pseudonymized IP hashes:</strong> kept
              only as long as they are useful for rate-limiting and abuse
              prevention.
            </li>
            <li>
              <strong className="text-ink">Checkout email, if provided:</strong>{' '}
              kept for order support and required record-keeping, then removed on
              request or when no longer needed.
            </li>
            <li>
              <strong className="text-ink">Launch notify list email:</strong>{' '}
              kept until the launch announcement has been sent, then deleted.
              Removed earlier at any time on request.
            </li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the service evolves or as the law
            requires. Material changes will be reflected by the &ldquo;Last
            updated&rdquo; date at the top of this page. Significant changes to
            how we handle data will be described plainly rather than buried.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For anything in this policy (a question, a correction, or a
            request about your data), email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            . You can also read the{' '}
            <Link
              href="/terms"
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              Terms of Service
            </Link>{' '}
            for how the money side works.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-8">
      <h2 className="font-headline text-2xl text-ink">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

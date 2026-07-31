// NOTE: This page is informational only. It is not legal advice and does not
// create a lawyer-client relationship. Several clauses below (governing law and
// jurisdiction, limitation of liability, and the operator's legal entity
// name) contain placeholders or business-specific claims
// that MUST be reviewed and finalized by a qualified lawyer before public launch.

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  SITE_NAME,
  SITE_URL,
  OPERATOR_NAME,
  CONTACT_EMAIL,
  SITE_OG_IMAGE,
} from '@/lib/site'
import { RESERVATION_TTL_SECONDS, CELL_PRICE_CENTS, MAX_CELLS_PER_TX } from '@/lib/config'
import { formatUSD } from '@/lib/format'

// Rendered verbatim so the revision date is stable in the HTML and never drifts
// with the build clock. Bump this by hand whenever the substance below changes.
const LAST_UPDATED = '2026-07-12'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms governing purchases and use of ${SITE_NAME}.`,
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  openGraph: {
    title: `Terms of Service · ${SITE_NAME}`,
    description: `The terms governing purchases and use of ${SITE_NAME}.`,
    url: `${SITE_URL}/terms`,
    siteName: SITE_NAME,
    type: 'article',
    images: [SITE_OG_IMAGE],
  },
}

const reservationMinutes = Math.round(RESERVATION_TTL_SECONDS / 60)

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Legal</p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">Terms of Service</h1>
      <p className="mt-4 font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Last updated {LAST_UPDATED}
      </p>
      <p className="mt-4 font-body text-sm text-ink-60">
        These Terms are a binding agreement. A plain-language summary follows
        most clauses to help you read them. Where the two differ, the clause
        itself is what governs.
      </p>

      <div className="mt-12 space-y-10 font-body leading-relaxed text-ink-60">
        <Section title="1. Who these Terms are with">
          <p>
            {SITE_NAME} (&ldquo;the service,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by{' '}
            <span className="text-ink">{OPERATOR_NAME}</span>. By accessing the
            site, reserving a cell, or completing a purchase, you (&ldquo;you&rdquo;
            or &ldquo;the buyer&rdquo;) agree to these Terms of Service and to our{' '}
            <Link href="/content-policy" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              Content Policy
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              Privacy Policy
            </Link>
            , which are incorporated here by reference. If you do not agree, do
            not use the service.
          </p>
          <Plain>{OPERATOR_NAME} runs this site. Using it means you accept these rules, plus the Content and Privacy policies.</Plain>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 18 years old and legally able to form a binding
            contract to use the service or make a purchase. If you are using the
            service on behalf of an organization, you represent that you have the
            authority to bind that organization to these Terms. We do not
            knowingly accept purchases from anyone under 18, and we may cancel a
            transaction and remove content if we learn the buyer did not meet
            this requirement.
          </p>
          <Plain>You have to be 18 or older and legally able to agree to a contract.</Plain>
        </Section>

        <Section title="3. What you're buying">
          <p>
            Each cell on the monument grid represents one character position.
            Purchasing a cell costs {formatUSD(CELL_PRICE_CENTS, { decimals: false })}{' '}
            and grants you the right to have your chosen character permanently
            displayed at that position, subject to these Terms and our{' '}
            <Link href="/content-policy" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              Content Policy
            </Link>
            . You are not purchasing ownership of the underlying webpage,
            software, domain, or any intellectual property beyond the display of
            your own submitted character. The right you acquire is a limited,
            revocable license to display content in that cell, not real
            property, a security, a token, or an equity interest of any kind.
          </p>
          <Plain>You&rsquo;re paying to place a letter, not to own the site. It&rsquo;s not an investment.</Plain>
        </Section>

        <Section title="4. Reservations expire">
          <p>
            Selecting cells creates a temporary reservation that holds those
            cells for approximately {reservationMinutes} minutes to let you
            complete checkout. If payment is not completed within that window,
            the reservation lapses and the cells become available to others
            again. You may reserve at most {MAX_CELLS_PER_TX} cells in a single
            transaction. A reservation is not a purchase and confers no rights
            until payment has been successfully captured.
          </p>
          <Plain>If you don&rsquo;t pay in time, someone else can grab the cells.</Plain>
        </Section>

        <Section title="5. All sales are final">
          <p>
            Because placement is immediate and permanent upon successful
            payment, purchases are non-refundable except where a refund is
            required by applicable law. In particular, we do not refund a
            purchase when we remove content for violating our Content Policy, and
            we do not refund a purchase because you changed your mind about the
            character you placed. Where we choose to reverse a charge for fraud,
            duplicate billing, or a technical error on our side, we do so at our
            discretion and it does not create an ongoing right to a refund.
          </p>
          <Plain>No refunds, including if we take your content down for breaking the rules, or if you regret what you wrote.</Plain>
        </Section>

        <Section title="6. No resale or transfer">
          <p>
            The display right attached to a cell is personal to the buyer and is
            not transferable. You may not sell, resell, sublicense, auction,
            rent, lease, or otherwise transfer a cell, its position, or its
            display right to any third party, and any purported transfer is void.
            We do not operate, recognize, or facilitate any secondary market for
            cells, and we are not responsible for arrangements you attempt to
            make outside the service.
          </p>
          <Plain>You can&rsquo;t resell or hand off your cell to someone else. There&rsquo;s no reseller market.</Plain>
        </Section>

        <Section title="7. Permanence, as far as we can promise it">
          <p>
            We intend for placed content to remain displayed indefinitely. We
            cannot guarantee perpetual uptime of any website, and we are not
            liable for content loss due to events outside our reasonable
            control, including but not limited to infrastructure failure, force
            majeure, or the discontinuation of this service. We will make
            reasonable efforts to preserve and, where feasible, migrate data if{' '}
            {SITE_NAME} is ever discontinued.
          </p>
          <Plain>We&rsquo;ll do everything reasonable to keep it up forever, but no website can promise the literal universe.</Plain>
        </Section>

        <Section title="8. Your content, your responsibility">
          <p>
            You represent that you have the right to submit the content you
            place, that it does not infringe anyone&rsquo;s rights, and that it
            complies with our Content Policy. You are solely responsible for what
            you submit. You grant us a worldwide, non-exclusive, royalty-free,
            perpetual license to store, display, reproduce, and distribute your
            submitted characters as part of the monument and any promotional
            material derived from it (such as share images and social cards).
            This license survives the end of these Terms to the extent needed to
            keep the monument intact.
          </p>
          <Plain>You own what you write; you let us show it, including in share cards, for as long as the monument exists.</Plain>
        </Section>

        <Section title="9. Displayed content is user-submitted and unverified">
          <p>
            Every character on the monument is submitted by a member of the
            public. Displayed content does not represent the views of{' '}
            {OPERATOR_NAME} or {SITE_NAME}, and its appearance on the grid is not
            an endorsement, verification, or factual claim by us. We do not
            pre-approve submissions for accuracy, and we make no representation
            that any placed content is true, lawful in every jurisdiction, or
            attributable to the person it appears to reference. Viewers and
            third parties should treat displayed characters accordingly. If you
            believe specific content violates our rules or your rights, please
            report it through the process described in our{' '}
            <Link href="/content-policy" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              Content Policy
            </Link>
            .
          </p>
          <Plain>Anything on the grid was typed by a stranger. Not checked, verified, or endorsed by us.</Plain>
        </Section>

        <Section title="10. Moderation and removal">
          <p>
            We may remove or obscure any content that violates our Content
            Policy, at our discretion, without prior notice and without refund.
            Cells vacated this way may be re-listed for purchase. We may also
            suspend or restrict access to the service for anyone who abuses it,
            attempts to circumvent our limits, or uses it unlawfully.
          </p>
          <Plain>Break the rules, lose the cell, no money back.</Plain>
        </Section>

        <Section title="11. What you are buying">
          <p>
            A purchase buys exactly one thing: the permanent display of your
            chosen characters in the cells you selected on the {SITE_NAME} grid,
            subject to these Terms and the Content Policy. It is a novelty
            digital good. It is <span className="text-ink">not an investment</span>,
            not a currency, not a transferable or resalable asset, and not a
            claim on {SITE_NAME}&rsquo;s revenue, brand, or property. No market
            value, appreciation, or future utility of any kind is promised or
            implied. All revenue from purchases belongs to {SITE_NAME} and funds
            the operation and long-term preservation of the service.
          </p>
          <Plain>You&rsquo;re buying a permanent spot for your words. It&rsquo;s not an investment and there&rsquo;s nothing to resell.</Plain>
        </Section>

        <Section title="12. No warranty">
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, express or implied,
            to the maximum extent permitted by law. Without limiting the
            foregoing, we disclaim all implied warranties of merchantability,
            fitness for a particular purpose, title, and non-infringement, and we
            do not warrant that the service will be uninterrupted, error-free,
            secure, or that any placed content will remain continuously
            accessible.
          </p>
        </Section>

        <Section title="13. Limitation of liability">
          <p>
            To the maximum extent permitted by applicable law, in no event will{' '}
            {OPERATOR_NAME}, {SITE_NAME}, or their respective operators,
            contractors, and service providers be liable for any indirect,
            incidental, special, consequential, exemplary, or punitive damages,
            or for any loss of profits, revenue, data, goodwill, or the loss of
            or inability to display placed content, arising out of or relating to
            your use of the service, whether based on warranty, contract, tort
            (including negligence), or any other legal theory, and whether or not
            we have been advised of the possibility of such damages.
          </p>
          <p>
            To the maximum extent permitted by applicable law, our total
            aggregate liability to you for all claims relating to the service
            will not exceed the total amount you actually paid to us for the cell
            or cells giving rise to the claim in the twelve (12) months preceding
            the event. Some jurisdictions do not allow the exclusion or
            limitation of certain damages, so parts of this section may not apply
            to you; in that case, our liability is limited to the smallest amount
            permitted by law.
          </p>
          <Plain>If something goes wrong, we&rsquo;re not on the hook for knock-on losses, and any claim is capped at what you actually paid us.</Plain>
        </Section>

        <Section title="14. Governing law and jurisdiction">
          {/* PLACEHOLDER: replace [JURISDICTION TO BE CONFIRMED] with the operator's
              real governing-law jurisdiction and the corresponding courts before
              launch. Do not guess; this must be set by the operator with a lawyer. */}
          <p>
            These Terms are governed by and construed in accordance with the laws
            of{' '}
            <span className="text-ink">[JURISDICTION TO BE CONFIRMED]</span>,
            without regard to its conflict-of-laws rules. You and we agree to
            submit to the exclusive jurisdiction of the courts located in{' '}
            <span className="text-ink">[JURISDICTION TO BE CONFIRMED]</span> for
            the resolution of any dispute arising out of or relating to these
            Terms or the service, except where applicable consumer-protection law
            grants you the right to bring proceedings in your place of residence.
          </p>
          <Plain>Disputes are handled under the law of the operator&rsquo;s home jurisdiction (to be finalized before launch), unless local consumer law says otherwise.</Plain>
        </Section>

        <Section title="15. Severability">
          <p>
            If any provision of these Terms is held to be invalid, unlawful, or
            unenforceable by a court of competent jurisdiction, that provision
            will be modified to the minimum extent necessary to make it
            enforceable, or if it cannot be so modified, it will be severed, and
            the remaining provisions will continue in full force and effect. Our
            failure to enforce any right or provision is not a waiver of that
            right or provision.
          </p>
          <Plain>If one clause fails in court, the rest still stands.</Plain>
        </Section>

        <Section title="16. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Material changes will be
            reflected by an updated revision date at the top of this page.
            Continued use of the service after changes take effect constitutes
            acceptance of the revised Terms. If you do not agree to a change, your
            remedy is to stop using the service. Changes do not entitle you to a
            refund of prior purchases.
          </p>
        </Section>

        <Section title="17. Contact">
          <p>
            Questions about these Terms can be sent to{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            , or through the contact details listed on our{' '}
            <Link href="/about" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              About page
            </Link>
            .
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

function Plain({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-rule pl-4 font-mono-grid text-sm text-ink-60">{children}</p>
  )
}

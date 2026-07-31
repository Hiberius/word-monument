// Content Policy: informational only. This copy explains how moderation,
// takedowns, and appeals work in plain language; it is NOT legal advice and is
// not a substitute for one. Have a lawyer review it before public launch,
// especially the intellectual-property notice-and-takedown wording, which
// should be reconciled with the DMCA (and equivalents in other jurisdictions)
// for the operating entity.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME, SITE_URL, CONTACT_EMAIL, SITE_OG_IMAGE } from '@/lib/site'

const LAST_UPDATED = '2026-07-12'

export const metadata: Metadata = {
  title: 'Content Policy',
  description: `What is and isn't allowed on ${SITE_NAME}, how removal works, and how to report content or a copyright infringement.`,
  alternates: {
    canonical: `${SITE_URL}/content-policy`,
  },
  openGraph: {
    type: 'article',
    title: `Content Policy · ${SITE_NAME}`,
    description: `What is and isn't allowed on ${SITE_NAME}, how removal works, and how to report content or a copyright infringement.`,
    url: `${SITE_URL}/content-policy`,
    images: [SITE_OG_IMAGE],
  },
}

const PROHIBITED = [
  {
    title: 'Hate speech',
    body: 'Content that attacks, demeans, or incites hatred against people based on race, ethnicity, national origin, religion, disability, gender, gender identity, sexual orientation, or similar protected characteristics.',
  },
  {
    title: 'Harassment and threats',
    body: 'Content directed at a specific individual or group that intimidates, threatens harm, or is intended to bully or degrade.',
  },
  {
    title: 'Doxxing',
    body: 'Publishing or threatening to publish another person’s private information (home address, phone number, financial details, private identifying documents) without their consent.',
  },
  {
    title: 'Sexual content involving minors',
    body: 'Any content that sexualizes or exploits minors, in any form, is never permitted under any circumstance and will be reported to the relevant authorities in addition to being removed.',
  },
  {
    title: 'Spam and scam links',
    body: 'Cell text used to advertise unrelated products or services, drive traffic through misleading claims, or reference URLs, handles, or contact details used for phishing or fraud.',
  },
  {
    title: 'Other illegal content',
    body: 'Anything that violates applicable law in the jurisdictions we operate in, including incitement to violence, content facilitating illegal transactions, and content that infringes intellectual property rights you don’t hold.',
  },
] as const

// The elements a copyright notice needs before we can act on it. Kept as data
// so the list stays consistent and easy to amend after legal review.
const TAKEDOWN_ELEMENTS = [
  {
    title: 'The work being infringed',
    body: 'Identify the copyrighted work (or trademark, or other protected material) you say is being infringed. If several works are involved, a representative list is fine.',
  },
  {
    title: 'Where it appears on the monument',
    body: 'Identify the specific cell or cells, with enough detail for us to find them: the placed character(s) and their location or coordinates on the grid, or a direct link to the affected area.',
  },
  {
    title: 'Your contact information',
    body: 'A name, an email address we can reply to, and, where you can provide them, a mailing address and phone number.',
  },
  {
    title: 'A good-faith statement',
    body: 'A statement that you have a good-faith belief the disputed use is not authorized by the rights holder, its agent, or the law.',
  },
  {
    title: 'A statement under penalty of perjury',
    body: 'A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the rights holder or are authorized to act on the rights holder’s behalf, together with your physical or electronic signature.',
  },
] as const

export default function ContentPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Legal</p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">Content Policy</h1>
      <p className="mt-4 max-w-xl font-body text-lg text-ink-60">
        Permanent doesn&rsquo;t mean unmoderated. This is the real, binding
        policy for what can and cannot be placed on the monument.
      </p>
      <p className="mt-4 font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-10 border-2 border-stamp-red bg-parchment-card p-6">
        <p className="font-headline text-xl text-ink">
          Violating content will be removed. There is no refund for removed content.
        </p>
        <p className="mt-2 font-body text-sm text-ink-60">
          This is a serious policy, not a formality. We enforce it, and payment
          for a cell does not purchase immunity from it. See{' '}
          <Link href="/terms" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
            Section 6 of our Terms
          </Link>{' '}
          for the contractual basis.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="font-headline text-2xl text-ink">Prohibited content</h2>
        <p className="mt-3 font-body text-ink-60">
          The following categories are never permitted, anywhere on the grid,
          in any language:
        </p>

        <ul className="mt-6 space-y-6">
          {PROHIBITED.map((item) => (
            <li key={item.title} className="border-t border-rule pt-5">
              <h3 className="font-headline text-lg text-ink">{item.title}</h3>
              <p className="mt-1 font-body text-sm leading-relaxed text-ink-60">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-headline text-2xl text-ink">How removal works</h2>
        <div className="mt-3 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            We review reported content and remove anything that violates this
            policy. Depending on severity, we may remove content proactively
            using automated and manual review, without waiting for a report.
          </p>
          <p>
            When content is removed, the affected cells return to an available
            state and may be purchased again by someone else. The original
            purchase is not refunded, per our{' '}
            <Link href="/terms" className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-headline text-2xl text-ink">Reporting content</h2>
        <div className="mt-3 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            You can report any cell you believe violates this policy. Reports
            are collected and surface the content to our moderation queue for
            human review. The more a cell is reported, the faster it
            rises for attention. When we become aware of content involving the
            exploitation of minors, we remove it and report it to the relevant
            authorities. You do not need to buy a cell, create an account, or
            explain yourself at length. Tell us where the content is and
            why it&rsquo;s a problem, and we&rsquo;ll take it from there.
          </p>
          <p>
            If a report isn&rsquo;t tied to one specific cell (a coordinated
            pattern across many cells, a safety concern, or anything you&rsquo;d
            rather send privately), email us at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-headline text-2xl text-ink">
          Copyright and intellectual property
        </h2>
        <div className="mt-3 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            If you own a copyright, trademark, or other intellectual-property
            right and you believe content on the monument infringes it, you can
            ask us to take it down. Send a written notice to{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            that includes the following:
          </p>
        </div>

        <ol className="mt-6 space-y-5">
          {TAKEDOWN_ELEMENTS.map((element, index) => (
            <li key={element.title} className="flex gap-4 border-t border-rule pt-5">
              <span
                aria-hidden="true"
                className="font-mono-grid text-sm text-ink-60"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-headline text-lg text-ink">{element.title}</h3>
                <p className="mt-1 font-body text-sm leading-relaxed text-ink-60">
                  {element.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            Once we receive a complete notice, we treat the affected cells like
            any other removal: the character comes down, the cells return to
            available, and the original purchase is not refunded. Sending a
            notice you know to be false (misrepresenting that content is
            infringing) can carry legal consequences for you, so only file one
            for rights you actually hold.
          </p>
          <p>
            <span className="font-headline text-ink">Counter-notice.</span> If
            your content was taken down over an intellectual-property claim and
            you believe that was a mistake (for example, the material is yours,
            is licensed to you, or is a fair use), you can send a counter-notice
            to the same address. Include the cell location that was removed, your
            contact information, and a statement, under penalty of perjury, that
            you have a good-faith belief the content was removed by mistake or
            misidentification. Because cells are permanent, restoring removed
            content isn&rsquo;t always possible, but a valid counter-notice will
            be reviewed by a person and factored into how we handle any future
            claim from the same party.
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-headline text-2xl text-ink">Appealing a removal</h2>
        <div className="mt-3 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            Removal is permanent and non-refundable, so we take getting it right
            seriously. If you bought a cell that was removed and you believe the
            decision was wrong, you can contest it. Email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            with the location of the removed cell (or your order details) and a
            short explanation of why you think it didn&rsquo;t violate this
            policy.
          </p>
          <p>
            A person (not an automated filter) will re-review the removal
            against the policy above. If we agree we got it wrong, we&rsquo;ll
            tell you and make it right as best the permanent grid allows. If the
            removal is upheld, that decision is final, the content stays down,
            and the purchase remains unrefunded. We aim to respond to appeals
            within a reasonable time and will keep you informed if a review takes
            longer.
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-headline text-2xl text-ink">Questions</h2>
        <div className="mt-3 space-y-3 font-body leading-relaxed text-ink-60">
          <p>
            For questions about this policy, how a specific decision was made, or
            anything that doesn&rsquo;t fit the paths above, write to{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            . We&rsquo;d rather answer a question before you buy than remove a
            cell after.
          </p>
        </div>
      </section>
    </div>
  )
}

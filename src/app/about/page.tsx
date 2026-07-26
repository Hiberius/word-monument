// This page is informational, not legal advice. It states the permanence
// promise plainly. Have a lawyer review this copy before public launch.
import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

const description = 'Why Word Monument exists: one million cells, one dollar a letter, and words that never come down.'

export const metadata: Metadata = {
  title: 'About',
  description,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    url: `${SITE_URL}/about`,
    title: 'About Word Monument',
    description,
  },
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Why this exists</p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        The internet forgets everything. This is a place your words stay.
      </h1>

      <div className="mt-10 space-y-6 font-body text-lg leading-relaxed text-ink-60">
        <p>
          Almost nothing you write online is built to last. Posts scroll away in
          an afternoon. Accounts get deleted, platforms shut down, links rot, and
          the message you sent someone the day everything changed is buried under
          ten thousand newer ones you&rsquo;ll never read again. The web feels
          permanent while you&rsquo;re looking at it and turns out to be written
          in sand.
        </p>
        <p>
          Word Monument is the opposite of that. It is one enormous grid, a
          million cells, and every cell holds a single character that someone
          chose to put there on purpose. Once it&rsquo;s placed, it stays. Not
          for a news cycle, not until the next redesign. It stays. Say the
          thing that actually matters. A name. A promise. A date. The one line
          that got you through something. Put it somewhere it won&rsquo;t
          disappear, and let it outlast the feed.
        </p>
        <p>
          People use it for the things they don&rsquo;t want to lose: an initial
          next to an initial, a child&rsquo;s birth year, a word in a language a
          grandparent spoke, a private joke that only two people will ever
          decode, a small tribute to someone who is gone. None of it is loud.
          Most of it would mean nothing to a stranger. That&rsquo;s the point.
          It&rsquo;s yours, and it&rsquo;s permanent, and both of those things
          are rare.
        </p>
      </div>

      <div className="mt-14 border-t border-rule pt-10">
        <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
          How it works
        </p>
        <h2 className="mt-3 font-headline text-3xl text-ink">
          A dollar a letter, placed the moment you pay.
        </h2>
        <div className="mt-6 space-y-6 font-body text-lg leading-relaxed text-ink-60">
          <p>
            Open the{' '}
            <Link
              href="/monument"
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              monument
            </Link>{' '}
            and you&rsquo;re looking at the whole grid. Zoom in, move around, and
            find open cells. The empty ones are yours to claim. Pick the
            cells you want and type your word into them, letter by letter, one
            character per cell. Each letter costs one dollar. A three-letter name
            is three dollars; a short sentence is however many characters it
            takes to say it.
          </p>
          <p>
            When you&rsquo;re happy with it, you check out and pay. The instant
            that payment clears, your characters are written into the monument in
            their exact positions, for everyone, permanently. There&rsquo;s no
            approval queue and no waiting. Placement is immediate. What you
            typed is now simply part of the wall.
          </p>
        </div>
      </div>

      <div className="mt-14 border-t border-rule pt-10">
        <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
          The permanence promise
        </p>
        <h2 className="mt-3 font-headline text-3xl text-ink">Once it&rsquo;s paid, it stays.</h2>
        <div className="mt-6 space-y-6 font-body text-lg leading-relaxed text-ink-60">
          <p>
            This is the whole promise, said plainly: a cell you&rsquo;ve paid for
            is yours and it does not come down. We don&rsquo;t take it back to
            resell at a higher price, we don&rsquo;t quietly recycle it, and it
            doesn&rsquo;t expire. You also can&rsquo;t edit it after the fact.
            Permanence cuts both ways, so choose your characters
            deliberately, because the version you pay for is the version that
            lasts.
          </p>
          <p>
            There is one limit worth being honest about: permanent doesn&rsquo;t
            mean unmoderated. A wall a million people can write on needs rules
            about what belongs there, and content that breaks them can be
            removed. Everything else, the sentimental, the strange, the
            funny, the deeply personal, stays exactly where you put it.
            The full commitment, including the boundaries around it, is written
            into our{' '}
            <Link
              href="/terms"
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>


      <div className="mt-14 border-t border-rule pt-10">
        <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
          Contact
        </p>
        <h2 className="mt-3 font-headline text-3xl text-ink">Who&rsquo;s behind this.</h2>
        <div className="mt-6 space-y-6 font-body text-lg leading-relaxed text-ink-60">
          <p>
            Word Monument is run by a small, independent team that chooses to
            stay anonymous. The work is meant to speak louder than the people
            behind it. If you have a question about a purchase, need something
            on the monument looked at, or want to reach a human about anything
            on this site, email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {CONTACT_EMAIL}
            </a>
            . Real messages get a real reply.
          </p>
        </div>
      </div>
    </div>
  )
}

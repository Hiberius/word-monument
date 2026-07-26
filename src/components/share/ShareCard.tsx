'use client'

import { useState } from 'react'
import { SHARE_LINE, SITE_URL } from '@/lib/site'

interface ShareCardProps {
  reservationId: string
}

export default function ShareCard({ reservationId }: ShareCardProps) {
  const [shared, setShared] = useState<'idle' | 'shared' | 'copied'>('idle')

  const imageUrl = `/api/share-image/${reservationId}`
  const shareUrl = `${SITE_URL}/monument`
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_LINE)}&url=${encodeURIComponent(shareUrl)}`

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Word Monument', text: SHARE_LINE, url: shareUrl })
        setShared('shared')
      } catch {
        // user cancelled, no error state needed
      }
      return
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl)
      setShared('copied')
      setTimeout(() => setShared('idle'), 2500)
    }
  }

  return (
    <div className="border border-ink bg-parchment">
      <div className="border-b border-ink px-6 py-3">
        <p className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
          Share it
        </p>
      </div>

      <div className="p-6">
        <div className="overflow-hidden border border-rule">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated OG image, not an optimizable static asset */}
          <img
            src={imageUrl}
            alt="A shareable card of your words on the monument"
            width={1200}
            height={630}
            loading="lazy"
            className="h-auto w-full"
          />
        </div>

        <p className="mt-4 font-body text-sm text-ink-60">{SHARE_LINE}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleShare}
            className="border-2 border-ink bg-ink px-5 py-2.5 font-body text-sm font-medium text-parchment transition-colors hover:border-stamp-red hover:bg-stamp-red focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
          >
            {shared === 'shared' ? 'Shared' : shared === 'copied' ? 'Link copied' : 'Share'}
          </button>

          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-ink px-5 py-2.5 font-body text-sm font-medium text-ink transition-colors hover:border-stamp-red hover:text-stamp-red focus-visible:border-stamp-red focus-visible:text-stamp-red focus-visible:outline-none"
          >
            Post on X
          </a>

          <a
            href={imageUrl}
            download="word-monument.png"
            className="border-2 border-rule px-5 py-2.5 font-body text-sm text-ink-60 transition-colors hover:border-ink hover:text-ink focus-visible:border-ink focus-visible:text-ink focus-visible:outline-none"
          >
            Download image
          </a>
        </div>
      </div>
    </div>
  )
}

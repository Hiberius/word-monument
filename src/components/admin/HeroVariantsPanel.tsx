'use client'

import { useEffect, useState } from 'react'

interface VariantRow {
  id: string
  headline: string
  weight: number
  impressions: number
  conversions: number
  cellsSold: number
  conversionRate: number
}

// Utilitarian admin table (matches the other /admin panels). Shows which
// homepage headline converts to purchases, sorted best-first. Promote a
// winner by bumping its `weight` in src/lib/hero/variants.ts.
export default function HeroVariantsPanel() {
  const [variants, setVariants] = useState<VariantRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/admin/api/hero-stats')
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        return (await res.json()) as { variants: VariantRow[] }
      })
      .then((data) => {
        if (!cancelled) setVariants(data.variants)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load hero A/B stats.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
        Homepage copy A/B test
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Purchase-attributed performance per headline. Bump a variant&rsquo;s weight in
        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">src/lib/hero/variants.ts</code>
        to serve the winner more often; set weight 0 to retire one.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !variants ? (
        <p className="mt-4 text-sm text-gray-400">Loading&hellip;</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">Headline</th>
                <th className="py-2 pr-4 text-right">Impr.</th>
                <th className="py-2 pr-4 text-right">Buys</th>
                <th className="py-2 pr-4 text-right">Conv. rate</th>
                <th className="py-2 pr-4 text-right">Cells</th>
                <th className="py-2 text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-2 pr-4 text-gray-900">
                    {i === 0 && v.conversions > 0 && (
                      <span className="mr-2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] uppercase text-white">
                        Leading
                      </span>
                    )}
                    {v.headline}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{v.impressions.toLocaleString('en-US')}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{v.conversions.toLocaleString('en-US')}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{(v.conversionRate * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{v.cellsSold.toLocaleString('en-US')}</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{v.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

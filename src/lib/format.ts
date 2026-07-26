// Small formatting helpers shared by receipts and counters.

export function formatUSD(cents: number, opts: { decimals?: boolean } = {}): string {
  const dollars = cents / 100
  const decimals = opts.decimals ?? dollars % 1 !== 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(dollars)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))
}

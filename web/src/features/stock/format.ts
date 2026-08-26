import type { StockEvent } from '../../lib/household'

/**
 * 42 → "42 g", 12.5 → "12.5 g", 12.0 → "12 g".
 *
 * The trailing zero matters more than it looks: a shelf of tins reading "100.0 g",
 * "42.0 g", "8.0 g" is noisier to scan than one reading "100 g", "42 g", "8 g", and the
 * decimal only earns its place when there is something after it.
 */
export function formatGrams(grams: number): string {
  const rounded = Math.round(grams * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} g`
}

/** A signed delta, for the event log: "−5 g", "+50 g". A real minus sign rather than a
 *  hyphen, because these sit in a column and the hyphen is too small to read as a sign. */
export function formatDelta(grams: number): string {
  if (grams === 0) return '±0 g'
  return grams > 0 ? `+${formatGrams(grams)}` : `−${formatGrams(Math.abs(grams))}`
}

/** An ISO timestamp or date as something readable, and the raw string back if it is not
 *  parseable — a broken date should not take the page down with it. */
export function formatDay(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `price_paid_minor` is minor units — 1250 with currency GBP is £12.50. Rendered with
 *  `Intl` when the currency code is one it recognises, and as plain digits when it is
 *  not, rather than throwing on a typo somebody stored last year. */
export function formatPrice(minor: number | null, currency: string | null): string | null {
  if (minor === null) return null
  const major = minor / 100
  if (!currency) return major.toFixed(2)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major)
  } catch {
    return `${major.toFixed(2)} ${currency}`
  }
}

/** One line of history: who did what, and how much it moved. */
export function describeActor(event: StockEvent): string {
  return event.actor ? event.actor.display_name : 'Somebody'
}

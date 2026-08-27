/**
 * Dates, grams and money, shared.
 *
 * The two date functions grew inside `features/stock/format.ts` in M3, when the shelf was
 * the only screen with a date on it. M4 puts a "brewed on" date and a "written on" date
 * on every review, so the implementation moved here and `stock/format.ts` re-exports it —
 * one pair of functions rather than two copies that drift apart on the day somebody
 * decides the month should be spelled out.
 *
 * `formatGrams` and `formatPrice` made the same move in M6, for the same reason: a shop
 * listing has a pack size and a price, and those are the shelf's two formats exactly. A
 * second copy in the shop feature would be the version that forgets the trailing-zero
 * rule the first time somebody touches it.
 */

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

/**
 * Minor units to something a person reads: 1250 with GBP is £12.50, 450 with PLN is
 * 4,50 zł. Null in, null out — "no price recorded" is the caller's sentence to write,
 * and it is emphatically not "0.00".
 *
 * Rendered with `Intl` when the currency code is one it recognises, and as plain digits
 * beside the code when it is not, rather than throwing on a typo somebody stored last
 * year and taking a whole listing page down with it.
 */
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

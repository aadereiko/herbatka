/**
 * Date formatting, shared.
 *
 * These two grew inside `features/stock/format.ts` in M3, when the shelf was the only
 * screen with a date on it. M4 puts a "brewed on" date and a "written on" date on every
 * review, so the implementation moved here and `stock/format.ts` re-exports it — one
 * pair of functions rather than two copies that drift apart on the day somebody decides
 * the month should be spelled out.
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

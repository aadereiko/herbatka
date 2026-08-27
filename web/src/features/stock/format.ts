import type { StockEvent } from '../../lib/household'
import { formatGrams } from '../../lib/format'

/**
 * Four of these are not stock concerns any more, so they live in `lib/format.ts` and are
 * re-exported here, unchanged, for the shelf's callers.
 *
 * The dates moved in M4, when every review grew a "brewed on" and a "written on".
 * `formatGrams` and `formatPrice` moved in M6, when a shop listing turned out to have a
 * pack size and a price formatted exactly the way a tin's are. Re-exporting rather than
 * rewriting the twenty-odd call sites keeps that a one-file change.
 */
export { formatDay, formatGrams, formatMoment, formatPrice } from '../../lib/format'

/** A signed delta, for the event log: "−5 g", "+50 g". A real minus sign rather than a
 *  hyphen, because these sit in a column and the hyphen is too small to read as a sign. */
export function formatDelta(grams: number): string {
  if (grams === 0) return '±0 g'
  return grams > 0 ? `+${formatGrams(grams)}` : `−${formatGrams(Math.abs(grams))}`
}

/** One line of history: who did what, and how much it moved. */
export function describeActor(event: StockEvent): string {
  return event.actor ? event.actor.display_name : 'Somebody'
}

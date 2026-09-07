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

/**
 * "about 3 weeks left", "about 5 days left", "runs out today".
 *
 * Weeks past a fortnight, days below it. Nobody plans tea in "about 43 days", and nobody
 * orders more on "about 2 weeks" when they have four days — so the unit switches at the
 * point where the reader's next action changes from *note it* to *do something*.
 *
 * Deliberately vague wording throughout. The underlying number is a projection from a
 * handful of events, and "3 weeks left" invites a precision it does not have; "about"
 * is the honest word and it costs six characters.
 */
export function formatTimeLeft(days: number): string {
  if (days <= 0) return 'runs out today'
  if (days === 1) return 'about a day left'
  if (days < 14) return `about ${days} days left`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `about ${weeks} weeks left`
  const months = Math.round(days / 30)
  return months < 2 ? 'over a month left' : `about ${months} months left`
}

/** "12 g a week". The rate on its own, for where the sentence supplies the rest. */
export function formatRate(gramsPerWeek: number): string {
  return `${formatGrams(gramsPerWeek)} a week`
}

/**
 * How much to trust the number, in words.
 *
 * A pace measured over nine days and one measured over ninety are the same shape of
 * fact and very different qualities of evidence, and the server sends `days_observed`
 * precisely so the client can say which it is holding. Showing "about 3 weeks left"
 * with no hint of that invites a reader to plan around a projection built from a
 * fortnight of a new habit.
 */
export function describeConfidence(daysObserved: number, events: number): string {
  return `from ${events} ${events === 1 ? 'entry' : 'entries'} over ${
    daysObserved < 14 ? `${daysObserved} days` : `${Math.round(daysObserved / 7)} weeks`
  }`
}

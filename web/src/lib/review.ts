/**
 * The M4 ratings-and-reviews contract.
 *
 * Everywhere else in `lib/` the data shapes are aliases of the API's own OpenAPI schemas
 * (`npm run types` regenerates `lib/generated/api.ts`). These are hand-written, and only
 * because the endpoints are being built in parallel with this screen: the generated file
 * does not carry the review schemas yet. They are spelled to match the agreed contract
 * exactly, so the swap is a one-line change per type and nothing else moves.
 *
 * | Hand-written here    | Becomes, once `npm run types` sees the M4 API              |
 * | -------------------- | --------------------------------------------------------- |
 * | `ReviewAuthor`       | `components['schemas']['ReviewAuthor']`                    |
 * | `Review`             | `components['schemas']['Review']`                          |
 * | `MyReview`           | `components['schemas']['MyReview']`                        |
 * | `ReviewInput`        | `components['schemas']['ReviewInput']`                     |
 *
 * The last two rows of that table — `TeaRatingSummary` and `TeaRatingDetail` — have since
 * been done and are gone: their fields are on the generated `TeaSummary` and `TeaDetail`,
 * and `RatingRollup` below is what remains, kept because M8 gives shops the same three
 * numbers and one shared shape is better than two that agree by coincidence.
 *
 * As in `catalog.ts` and `household.ts`, the label/const objects below stay hand-written
 * whatever the generator says: OpenAPI gives the type of a field, not an ordered
 * human-readable list to render.
 */

/** Who wrote a review, as much of them as a public page is allowed to show. No email —
 *  this endpoint is readable by anyone, signed in or not. */
import type { components } from './generated/api'

export type ReviewAuthor = components['schemas']['ReviewAuthor']

export type Review = components['schemas']['Review']

/** A review as it appears on your own list, where the tea is the thing you have
 *  forgotten and the review is the thing you wrote. */
export type MyReview = components['schemas']['MyReview']

/**
 * The body of `PUT /catalog/teas/{slug}/review`, which both creates and edits — there is
 * one review per person per tea, so there is nothing to distinguish.
 *
 * The subscores and the notes are optional *and* nullable, and the difference matters at
 * exactly one moment: editing a review to remove a subscore you had given. Omitting the
 * key asks the server to decide; sending `null` says "no aroma score", which is the only
 * way to express a clear. The form always sends all six keys for that reason.
 */
export type ReviewInput = components['schemas']['ReviewInput']

/**
 * The part of a review that `ReviewDetails` actually reads: the three optional aspects
 * and the notes.
 *
 * Spelled as a structural subset rather than as `Review`, because three different shapes
 * now want the same two paragraphs rendered the same way — `Review` on a tea page,
 * `MyReview` on your own list, and `ProfileReview` on somebody's profile. The subscores
 * are optional *keys* here, not merely nullable values: a `ProfileReview` does not carry
 * them at all, and widening the component was a better answer than either a fourth copy
 * of the markup or a fake `aroma: null` invented at the call site.
 */
export type ReviewNotes = {
  id: string
  aroma?: number | null
  flavour?: number | null
  aftertaste?: number | null
  body: string | null
}

/**
 * A review as the *list* renders one, whatever it is a review of.
 *
 * M8 gives shops the same ratings teas have, and a `ShopReview` is a `Review` with the
 * tea-specific half removed — no aroma, no brew date, because neither means anything
 * about a room. Rather than a second `ShopReviewList` that would have to be kept looking
 * identical to this one, `ReviewRow` and `ReviewList` are widened to this shape: the four
 * tea-only fields are optional *keys*, exactly as on `ReviewNotes` and for the same
 * reason. A `Review` and a `ShopReview` are both assignable to it, and the row renders
 * whichever parts it was handed.
 */
export type AnyReview = ReviewNotes & {
  author: ReviewAuthor
  score: number
  brewed_at?: string | null
  created_at: string
  updated_at: string
}

/* ------------------------------------------------- what a rateable thing gains */

/**
 * The three numbers a rating summary prints, whatever it is a summary of.
 *
 * M4's `TeaRatingSummary` and `TeaRatingDetail` are gone from here: the fields they
 * described are on the generated `TeaSummary` and `TeaDetail` now, exactly as the note at
 * the top of this file said they would be, and leaving the duplicates in place would have
 * let them drift. What survives is this — the shape `RatingSummary` reads, shared because
 * M8 gives shops the same rollup and a second identical triple would be the same mistake
 * one milestone later.
 *
 * `average_score` is null rather than 0 when nobody has rated it: an unrated thing is not
 * a thing that scored zero, and rendering it as one is the single most misleading thing
 * these screens could do. `my_score` is null when you are signed out as well as when you
 * simply have not rated it — the two look the same from here, which is why the page asks
 * the session and not this field when it decides whether to show a form.
 */
export type RatingRollup = {
  average_score: number | null
  review_count: number
  my_score: number | null
}

/* ------------------------------------------------------------------------ scoring */

export const SCORE_MIN = 1

export const SCORE_MAX = 10

/** 1…10, as an array, because a select needs to iterate it and `Array.from` at four call
 *  sites is four chances to get the off-by-one wrong. */
export const SCORES = Array.from(
  { length: SCORE_MAX - SCORE_MIN + 1 },
  (_, index) => SCORE_MIN + index,
)

/** The three optional aspects, in the order a cup is actually experienced. Derived as a
 *  union from the object rather than an enum: `erasableSyntaxOnly` bans any TypeScript
 *  that emits runtime code. */
export const SUBSCORE_LABELS = {
  aroma: 'Aroma',
  flavour: 'Flavour',
  aftertaste: 'Aftertaste',
} as const

export type Subscore = keyof typeof SUBSCORE_LABELS

export const SUBSCORES = Object.keys(SUBSCORE_LABELS) as Subscore[]

/* ------------------------------------------------------------------- query strings */

export type ReviewListParams = {
  page?: number
  size?: number
}

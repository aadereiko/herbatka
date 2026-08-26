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
 * | `TeaRatingSummary`   | folded into `TeaSummary` / `TeaDetail`; delete it          |
 * | `TeaRatingDetail`    | folded into `TeaDetail`; delete it                         |
 *
 * The last two rows are the ones to do something about rather than merely rename: they
 * exist because `TeaSummary` and `TeaDetail` *gain* these fields server-side, so
 * `lib/catalog.ts` intersects the generated schema with them for now. When the
 * regenerated schemas carry the fields, drop the intersections there and these two types
 * with them — leaving them in place would be harmless but would quietly stop the
 * generated file from being the single source of truth.
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

/* --------------------------------------------------- what a tea gains from ratings */

/** The rollup both `TeaSummary` and `TeaDetail` carry. `average_score` is null rather
 *  than 0 when nobody has rated it: an unrated tea is not a tea that scored zero, and
 *  rendering it as one is the single most misleading thing this screen could do. */
export type TeaRatingSummary = {
  average_score: number | null
  review_count: number
  /** Your own score, and null when you are signed out as well as when you have not rated
   *  it — the two look the same from here, which is why the page asks `user` and not
   *  this field when it decides whether to show a form. */
  my_score: number | null
}

/** What only the detail endpoint carries: your review in full, so the form can be
 *  pre-filled without a second request, and the per-aspect averages. */
export type TeaRatingDetail = {
  my_review: Review | null
  average_aroma: number | null
  average_flavour: number | null
  average_aftertaste: number | null
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

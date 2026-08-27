/**
 * The M8 favourites contract.
 *
 * A star, not a rating. The two are deliberately unrelated: you can star a tea you have
 * never scored, and unstarring one leaves your review exactly where it was. Anything that
 * tried to derive one from the other would be wrong for the commonest case — the shop you
 * always go to and have never got round to rating.
 *
 * Hand-written rather than aliased from `lib/generated/api.ts`, and only because the
 * endpoints are being built in parallel with these screens: the generated file does not
 * carry the M8 fields yet, and `npm run types` against today's server would quietly
 * delete them again. Spelled to match the agreed contract exactly, so the swap is a
 * one-line change per type and nothing else moves.
 *
 * | Hand-written here | Becomes, once `npm run types` sees the M8 API                    |
 * | ----------------- | --------------------------------------------------------------- |
 * | `Favouritable`    | folded into TeaSummary/TeaDetail/ShopSummary/ShopDetail; delete |
 * | `FavouriteKind`   | stays — it is ours, not the server's                            |
 */

/**
 * The one field the star reads, on all four schemas that grow it.
 *
 * Always `false` when signed out rather than absent or null, which is what lets the
 * rendering code treat it as a plain boolean — the decision about whether a star appears
 * at all is made from the session, not from this.
 */
export type Favouritable = { is_favourite: boolean }

/**
 * Which of the two things is being starred.
 *
 * A union of two string literals rather than an enum: `erasableSyntaxOnly` bans any
 * TypeScript that emits runtime code. It is also the segment that picks the endpoint and
 * the caches to update, so it travels with every call rather than being inferred.
 */
export type FavouriteKind = 'tea' | 'shop'

export type FavouriteListParams = {
  page?: number
  size?: number
}

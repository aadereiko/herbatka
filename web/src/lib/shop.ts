/**
 * The M6 shops + buying contract.
 *
 * Data shapes are aliases of the API's own OpenAPI schemas, so a renamed Pydantic field
 * breaks this build rather than a component at runtime.
 *
 * Two create bodies stay hand-written. `ListingInput.is_available` and the optional
 * fields on `ShopInput` are generated as required or as `T | null`, because
 * openapi-typescript renders a field carrying a `default` as non-optional — right for a
 * response, wrong for a request body, where the default exists so the client may omit
 * the field. `undefined` is also what `JSON.stringify` drops, which `null` is not.
 *
 * Prices are integer minor units plus a currency (3400 + "PLN" = 34.00 zł). Never render
 * `price_minor` directly; `formatPrice` exists for that.
 */
import type { components } from './generated/api'

/* --------------------------------------------------------------------------- shops */

/** The slice of a shop that hangs off something else — a tin, a listing's parent. Not
 *  `ShopSummary`: a tin does not need the shop's listing count, and embedding one would
 *  make every shelf response pay for a count nobody reads there. */
export type ShopRef = components['schemas']['ShopRef']

export type ShopSummary = components['schemas']['ShopSummary']

export type ShopDetail = components['schemas']['ShopDetail']

/* ------------------------------------------------------------------------ listings */

/**
 * One tea, in one shop, at one pack size.
 *
 * `price_minor` is an integer in the currency's minor units — 450 with `currency: 'PLN'`
 * is 4.50 zł. It is never rendered raw; `formatListingPrice` is the only thing that
 * should touch it.
 */
export type Listing = components['schemas']['Listing']

/** The same listing, seen from the tea rather than from the shop — which is why the shop
 *  travels with it. `GET /catalog/teas/{slug}/shops` is the "where to buy this" call. */
export type ListingWithShop = components['schemas']['ListingWithShop']

/* ------------------------------------------------------------------ write payloads */

/**
 * Body of both `POST /shops` (a suggestion, comes back unapproved) and
 * `POST /admin/shops` (comes back approved). Same shape, as with teas.
 *
 * The server takes `image_url` on either, but only the admin form offers a way to set
 * one — see `toShopInput`'s `withImage`. That is a product decision, not a contract
 * limit: a suggestion is six fields typed in a hurry by somebody who has not been vetted,
 * and handing every signed-in visitor a file endpoint to store bytes through is a
 * separate decision from letting them nominate a shop. The admin adds the photo when
 * they approve it.
 */
export type ShopInput = {
  name: string
  website?: string
  address?: string
  city?: string
  country?: string
  description?: string
  image_url?: string
}

/**
 * `PATCH /admin/shops/{id}`. Nullable rather than optional-only on every field that can
 * be empty, because clearing a shop's website has to be expressible as something other
 * than "leave it alone" — the same reason the generated tea and stock patches are
 * `T | null`.
 */
export type ShopPatch = components['schemas']['ShopUpdate']

export type ListingInput = {
  tea_id: string
  pack_grams?: number
  price_minor?: number
  currency?: string
  product_url?: string
  is_available?: boolean
}

export type ListingPatch = components['schemas']['ListingUpdate']

/**
 * `POST /shops/{slug}/listings/{listing_id}/buy`.
 *
 * `household_id` is on the body rather than the path because the shop, not the
 * household, is what you are standing in front of when you press the button. The server
 * answers 403 if you are not a member of it.
 *
 * `price_paid_minor` is minor units like the listing's own price: the form asks for
 * "4.50" and multiplies, because nobody types 450 for four zloty fifty.
 */
export type BuyInput = components['schemas']['BuyRequest']

/** `POST /uploads/image`, multipart, field name `file`. */
export type UploadedImage = components['schemas']['UploadedImage']

/* ------------------------------------------------------------------- query strings */

export type ShopListParams = {
  q?: string
  city?: string
  country?: string
  page?: number
  size?: number
}

export type AdminShopListParams = {
  /** A real `false` for the queue, not an omitted parameter — see the note in `toQuery`
   *  about why empty values are dropped but `false` survives. */
  approved?: boolean
  page?: number
  size?: number
}

export type ListingListParams = {
  page?: number
  size?: number
}

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

/**
 * Both of these now carry the shop's place on the earth straight from the generated
 * schema: `latitude`, `longitude` and `distance_km`.
 *
 * They were hand-written intersections while M7's API was being built alongside the
 * screens, because `npm run types` against a server that did not serve the fields yet
 * would have silently deleted them again. The generated file has caught up, so the
 * duplicates are gone — a field written in two places is a field that will disagree
 * with itself.
 *
 * `latitude`/`longitude` are null for a shop nobody has pinned: an online-only shop has
 * no point on a map, and a bricks-and-mortar one may simply not have been placed yet.
 * Both are null or both are set; half a pin is not a place.
 *
 * `distance_km` is the server's answer, not ours, and it is null unless the request
 * carried `near_lat` *and* `near_lng`. Computing it in the browser instead would mean
 * disagreeing with the ordering the server sorted by — it is the same number that
 * decided which shop came first, so it has to come from the same place.
 */
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
  /** `number` rather than the generated `number | null`, for the same reason as every
   *  other field on this body: omitted is how a create says "nothing to say", and
   *  `JSON.stringify` drops `undefined` where it would send an explicit `null`.
   *
   *  Only ever sent by the admin form: `POST /shops` — the public suggestion — does not
   *  take a pin. That is a contract limit rather than the product decision `image_url`
   *  is subject to, but both land on `toShopInput`'s one `asAdmin` flag because both
   *  call sites agree. */
  latitude?: number
  longitude?: number
}

/**
 * `PATCH /admin/shops/{id}`. Nullable rather than optional-only on every field that can
 * be empty, because clearing a shop's website has to be expressible as something other
 * than "leave it alone" — the same reason the generated tea and stock patches are
 * `T | null`. The pin follows that rule too: `null` is how an admin takes a wrong one
 * off the map.
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
  /**
   * Where the person browsing is standing. Both or neither — one alone is not a
   * position, and the server ignores a lone half.
   *
   * With them, the page comes back nearest-first with `distance_km` filled in, and shops
   * that have no pin are dropped from the ordering entirely. That exclusion is the whole
   * reason `/shops` says so out loud when a position is active: "nearest first" quietly
   * hiding half the list is a worse answer than no answer.
   */
  near_lat?: number
  near_lng?: number
  /** Only meaningful alongside a position. No control sets it yet — "within 5 km" is a
   *  filter nobody has asked for, and a radius that silently empties the list is a
   *  dead end. It stays on the type because it is part of the contract. */
  radius_km?: number
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

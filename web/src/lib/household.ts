/**
 * The M3 households + tea-stock contract.
 *
 * Data shapes are aliases of the API's own OpenAPI schemas (`npm run types`), so a
 * renamed Pydantic field breaks this build rather than a component at runtime.
 *
 * Two request payloads reopen a single field each — `InviteInput.expires_in_days` and
 * `StockItemInput.low_stock_grams`. openapi-typescript's `--default-non-nullable` (on by
 * default) renders any field carrying a `default` as non-optional. That is right for a
 * response, where the value always comes back, and wrong for a request body: the
 * server's default exists precisely so the client may omit the field. The OpenAPI
 * document itself lists neither as required; only the generator disagrees.
 *
 * The label objects below stay hand-written, as in `catalog.ts`: OpenAPI gives the
 * *type* of an enum-ish field but not an ordered, human-readable list to render.
 */
import type { components } from './generated/api'

/* ------------------------------------------------------------------- households */

/** Who a member is, as much of it as another member is allowed to see. */
export type UserRef = components['schemas']['UserRef']

export const MEMBER_ROLE_LABELS = {
  owner: 'Owner',
  member: 'Member',
} as const

// A union derived from the object rather than an enum: `erasableSyntaxOnly` bans any
// TypeScript that emits runtime code.
export type MemberRole = keyof typeof MEMBER_ROLE_LABELS

export type Member = components['schemas']['Member']

/** M6 gave a household a picture, for the same reason a tea has one: a wall of
 *  identically-shaped cards reading "Home", "Flat 3", "The Office" is a wall you read
 *  rather than recognise. `image_url` is null on most of them, which is not an error. */
export type HouseholdSummary = components['schemas']['HouseholdSummary']

export type HouseholdDetail = components['schemas']['HouseholdDetail']

export type Invite = components['schemas']['Invite']

/* ------------------------------------------------------------------------ stock */

/** The slice of a catalog tea a tin carries. Not `TeaSummary`: a tin does not need the
 *  ingredient list, and embedding one would make every stock page pay for it. */
export type TeaRef = components['schemas']['TeaRef']

export const STOCK_EVENT_LABELS = {
  purchase: 'Bought',
  brew: 'Brewed',
  adjust: 'Recounted',
  discard: 'Thrown out',
} as const

export type StockEventKind = keyof typeof STOCK_EVENT_LABELS

/** The three kinds a client may post to `/events`. `adjust` is missing deliberately: it
 *  has its own endpoint because it sets an absolute total rather than a delta, and the
 *  server is the one that works out the difference to record. */
export const STOCK_EVENT_INPUT_KINDS = ['brew', 'purchase', 'discard'] as const

export type StockEventInputKind = (typeof STOCK_EVENT_INPUT_KINDS)[number]

export type StockEvent = components['schemas']['StockEvent']

/**
 * M6 added `shop`: where the tin came from, when it came from a shop the catalog knows.
 * A tin bought through `POST …/listings/{id}/buy` carries one; one typed in by hand
 * carries null. That null is permanent rather than a migration artefact — most tins will
 * always have been added by hand — so every render of it has to be guarded.
 */
export type StockItem = components['schemas']['StockItem']

export type StockItemDetail = components['schemas']['StockItemDetail']

/* ------------------------------------------------------------------ write payloads */

export type HouseholdInput = components['schemas']['HouseholdCreate']

/**
 * M6 reopened `name` as optional and added `image_url`.
 *
 * `name` was required while renaming was the only thing this endpoint did. Setting a
 * picture and leaving the name alone has to be expressible now, and re-sending the
 * current name to do it is the round trip that races two owners editing at once.
 * `image_url` is `T | null` rather than optional-only for the usual reason — removing
 * the picture is not the same request as not mentioning it.
 */
export type HouseholdPatch = components['schemas']['HouseholdUpdate']

export type JoinInput = components['schemas']['JoinRequest']

export type InviteInput = Omit<components['schemas']['InviteCreate'], 'expires_in_days'> & {
  expires_in_days?: number
}

/**
 * M8 adds `shop_id`: where the tin came from, for a tin typed in by hand rather than
 * bought through a listing.
 *
 * Hand-written like the rest of M8 — the generated `StockItemCreate` has not seen it yet.
 * Optional *and* nullable: omitted is how a create says "I did not say", which is what
 * `JSON.stringify` does with `undefined` and does not do with `null`; explicit null is
 * what the PATCH needs to take a wrong shop back off a tin.
 */
export type StockItemInput = Omit<components['schemas']['StockItemCreate'], 'low_stock_grams'> & {
  low_stock_grams?: number
  shop_id?: string | null
}

/**
 * Metadata only. `quantity_grams` is absent from this type on purpose — the whole point
 * of the event log is that a tin's contents only ever move through an event, so a PATCH
 * that could silently set the number would make the history a lie.
 *
 * The nullable fields are `T | null` rather than optional-only, because clearing a
 * best-before date has to be expressible as something other than "leave it alone".
 */
export type StockItemPatch = components['schemas']['StockItemUpdate'] & {
  /** M8, hand-written until the generated schema catches up. Nullable for the reason
   *  every other field on this body is: "the shop was wrong, forget it" and "I am not
   *  editing the shop" have to be two different requests. */
  shop_id?: string | null
}

export type StockEventInput = components['schemas']['StockEventCreate']

export type StockAdjustInput = components['schemas']['StockAdjust']

/* ------------------------------------------------------------------- query strings */

export type StockListParams = {
  q?: string
  /** Sent only when on. `low_only=false` and no parameter mean the same thing to the
   *  server, and the shorter URL is the one worth sharing. */
  low_only?: true
  page?: number
  size?: number
}

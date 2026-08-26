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

export type StockItem = components['schemas']['StockItem']

export type StockItemDetail = components['schemas']['StockItemDetail']

/* ------------------------------------------------------------------ write payloads */

export type HouseholdInput = components['schemas']['HouseholdCreate']
export type HouseholdPatch = components['schemas']['HouseholdUpdate']
export type JoinInput = components['schemas']['JoinRequest']

export type InviteInput = Omit<components['schemas']['InviteCreate'], 'expires_in_days'> & {
  expires_in_days?: number
}

export type StockItemInput = Omit<components['schemas']['StockItemCreate'], 'low_stock_grams'> & {
  low_stock_grams?: number
}

/**
 * Metadata only. `quantity_grams` is absent from this type on purpose — the whole point
 * of the event log is that a tin's contents only ever move through an event, so a PATCH
 * that could silently set the number would make the history a lie.
 *
 * The nullable fields are `T | null` rather than optional-only, because clearing a
 * best-before date has to be expressible as something other than "leave it alone".
 */
export type StockItemPatch = components['schemas']['StockItemUpdate']

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

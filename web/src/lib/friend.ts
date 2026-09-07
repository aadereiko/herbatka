/**
 * The M5 friends + activity-feed contract.
 *
 * Data shapes are aliases of the API's own OpenAPI schemas, so a renamed Pydantic field
 * breaks this build rather than a component at runtime.
 *
 * Note `FeedStockedItem.actor` is nullable. `stock_item.added_by_id` is
 * ON DELETE SET NULL, so a tin outlives the account of whoever bought it — and every
 * tin predating that column had to be backfilled from the ledger. Rendering it
 * unguarded is a TypeError that takes the whole feed down.
 *
 * The label objects and `FeedItem` stay hand-written: OpenAPI gives the *type* of an
 * enum-ish field but not an ordered, human-readable list to render, and the generated
 * page envelope for the feed has an unusable machine-made name.
 */
import type { components } from './generated/api'

export const FRIEND_STATE_LABELS = {
  none: 'Not connected',
  incoming: 'Wants to be friends',
  outgoing: 'Request sent',
  friends: 'Friends',
  blocked: 'Blocked',
} as const

// A union derived from the object rather than an enum: `erasableSyntaxOnly` bans any
// TypeScript that emits runtime code.
export type FriendState = keyof typeof FRIEND_STATE_LABELS

export type Friend = components['schemas']['Friend']

export const REQUEST_DIRECTIONS = ['incoming', 'outgoing'] as const

export type RequestDirection = (typeof REQUEST_DIRECTIONS)[number]

/**
 * One open request, from either end. `GET /friends/requests` returns both directions in
 * one list and `direction` is what tells them apart — which is why the screen splits the
 * list itself rather than making two calls.
 *
 * `id` is the request's own id, not the other person's. Both accept and decline/cancel
 * address the request by it, so a row that has only a `UserRef` cannot act.
 */
export type FriendRequest = components['schemas']['FriendRequest']

export type SearchResult = components['schemas']['SearchResult']

/* --------------------------------------------------------------------------- feed */

/** Who did the thing. Not `UserRef`: the feed carries no email, because "Ada added a
 *  tin" is not a reason to hand out her address to everybody in the household. */
export type FeedActor = components['schemas']['FeedActor']

export type FeedReviewItem = components['schemas']['ReviewFeedItem']

/**
 * `actor` is nullable here and not on a review, and that asymmetry is the API's, not a
 * slip: a review cannot exist without its author, but a tin can outlive whoever put it
 * on the shelf — and every tin that predates the `added_by` column has no answer at all.
 * The brief's contract spelled this field as non-null; the shipped schema says
 * `FeedActor | null`, and the schema is the one that will be handing out the JSON.
 *
 * Rendering `item.actor.display_name` unguarded is therefore a crash waiting for the
 * first pre-migration tin, which is why the type keeps the null rather than asserting it
 * away.
 */
export type FeedStockedItem = components['schemas']['StockedFeedItem']

/** Somebody on a shelf you share made a cup. Visible on household terms, not friend
 *  terms — see the server's `services/feed._sources`: a brew says what is on a
 *  household's shelf and who was in the house, so a friend outside it sees nothing. */
export type FeedBrewedItem = components['schemas']['BrewedFeedItem']

/** Two sources, one stream: your friends' reviews, and tins added to households you are
 *  in. `kind` is the discriminator, and the only honest way to render the two — they
 *  link to different places and mean different things. */
export type FeedItem = FeedReviewItem | FeedStockedItem | FeedBrewedItem

/* ------------------------------------------------------------------- query strings */

/**
 * The server answers `[]` below this, so the client does not ask. Saving the round trip
 * is the small half; the large half is that a one-letter search across every account is
 * the query you would least like to run on a growing table.
 */
export const USER_SEARCH_MIN_LENGTH = 2

export type FeedParams = {
  page?: number
  size?: number
}

/* ------------------------------------------------------------------------- wording */

/**
 * The single sentence every failed `POST /friends/requests` shows, whatever the status.
 *
 * A 404 from that endpoint means the other person has blocked you. Saying so — or even
 * wording it differently from the other failures — hands back exactly the fact the block
 * exists to withhold: block somebody, and they learn it by watching which error they
 * get. So 400, 404, 409 and a dead network all read the same here, and the server's own
 * `detail` is deliberately dropped on the floor rather than passed to `describeApiError`.
 *
 * This is the one place in the app that throws away the server's sentence on purpose. It
 * costs a little diagnosability on the two failures that are harmless (yourself, already
 * open) to buy silence on the one that is not.
 */
export const SEND_REQUEST_FAILED = 'Could not send that request. Please try again.'

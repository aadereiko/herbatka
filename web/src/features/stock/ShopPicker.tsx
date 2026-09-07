import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { NewShopInput } from '../../lib/catalog'
import { useDebouncedValue } from '../../lib/debounce'
import type { ListingWithShop, ShopRef, ShopSummary } from '../../lib/shop'
import { describePlace, formatListingPrice, formatPack } from '../shop/format'
import { useShopList, useTeaShops } from '../shop/queries'

const RESULT_LIMIT = 8

/** Enough to cover "the usual place" without turning the top of a tin form into a price
 *  comparison table. Anybody whose shop is not in the six can type its name instead —
 *  that is what the search box under it is for. */
const SHORTLIST_LIMIT = 6

/** The browse summary carries far more than a tin needs; this is the narrowing, and it
 *  matches the `shop` a tin comes back wearing. */
function toShopRef(shop: ShopSummary): ShopRef {
  return { id: shop.id, slug: shop.slug, name: shop.name }
}

/** "50 g · 4,50 zł", or one of the two, or nothing at all. A shop is allowed to publish
 *  neither, and a " · " with nothing on either side of it is worse than a bare name. */
function describeListing(listing: ListingWithShop): string {
  return [formatPack(listing.pack_grams), formatListingPrice(listing)].filter(Boolean).join(' · ')
}

/**
 * Where a tin came from, when you are typing it in by hand.
 *
 * Two ways in, in the order they are worth trying.
 *
 * The first is the catalog answering the question for you. Once a tea is picked we
 * already know which shops sell it — it is the same `GET /catalog/teas/{slug}/shops` that
 * fills the "Where to buy" panel on the tea's own page — so those go up as a one-tap
 * shortlist, and the listing that gets tapped carries the pack size and the price along
 * with the shop. That is the practical half of "in a household, a tea comes from the
 * shop": naming the shop is worth something, and naming the shop *and* getting 50 g and
 * 4,50 zł filled in for free is worth reaching for.
 *
 * The second is the search box, which is always there, underneath. Our catalog knowing
 * which shops sell a tea is not the same as it knowing every shop that sells it, and the
 * tin in somebody's hand came from wherever it actually came from — a corner shop that
 * has never been listed, a market stall, a friend's cupboard. A `<select>` is the wrong
 * control for that for the same reason it is wrong in `TeaPicker`: the shop list is
 * unbounded, so it would grow until it either stopped fitting on a phone or stopped
 * loading. A debounced `/shops?q=` asks for eight rows at a time and never more.
 *
 * The shortlist is **absent** rather than empty whenever there is nothing to put in it —
 * no tea picked yet, no shop in the catalog carries it, the request is still in flight,
 * the request failed. An empty box headed "Sold at" asserts something ("nobody sells
 * this") that a pending or broken request has not established, and it asserts it directly
 * above the search box that is the real answer anyway.
 *
 * Optional, unlike the tea, so there is a way to say "actually, never mind" once
 * something is picked. The only thing that can be *wrong* here is a half-written new
 * shop, which is why `draftError` is the one error slot: leaving this blank is the
 * ordinary case rather than an unfinished field.
 *
 * A third way in arrived with `draft`. "No shop matches that" was a softer dead end than
 * the tea's but a dead end all the same, and the catalog already knew how to take a shop
 * nobody has listed — `NewShopIn`, which the Teas page has been sending for a while. The
 * fields are written here and posted as the tin's `new_shop`; the server creates the shop,
 * a listing for this tin's tea, and the tin, in one transaction.
 */
export function ShopPicker({
  idPrefix,
  selected,
  draft,
  onSelect,
  onDraft,
  draftError,
  teaSlug = null,
}: {
  idPrefix: string
  selected: ShopRef | null
  /** A shop being written on the way past, with no id to point at yet. Mutually exclusive
   *  with `selected`. */
  draft: NewShopInput | null
  /** The listing rides along when the pick came from the shortlist, because it knows the
   *  pack size and the price and the caller can do something useful with both. Absent for
   *  a search result, which knows neither, and absent for the clear. */
  onSelect: (shop: ShopRef | null, listing?: ListingWithShop) => void
  /** Every keystroke in the three draft fields, and `null` to abandon the draft. The state
   *  is lifted because the tin form is what submits it and what validates it — a copy kept
   *  in here as well is two answers to "what shop did you say". */
  onDraft: (draft: NewShopInput | null) => void
  /** A shop with neither a city nor a website cannot be found by anybody; the tin form
   *  mirrors the server's rule and puts the answer here. */
  draftError?: string
  /** Which tea this tin holds, once that has been decided; `null` until then. It is what
   *  turns the shortlist on — without it this is the plain search box it has always
   *  been, which is exactly right for a caller that has no tea to ask about. */
  teaSlug?: string | null
}) {
  const [query, setQuery] = useState('')
  const settled = useDebouncedValue(query)
  const results = useShopList({ q: settled || undefined, size: RESULT_LIMIT })
  // `''` is how `useTeaShops` is told not to run at all — see its `enabled`. Calling it
  // unconditionally and disabling it there is the only shape the rules of hooks allow.
  const sellers = useTeaShops(teaSlug ?? '', { size: SHORTLIST_LIMIT })

  if (draft) {
    return (
      <fieldset className="space-y-3" data-testid="shop-drafted">
        <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          A shop the catalog does not have
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id={`${idPrefix}-new-shop-name`}
            label="Shop name"
            value={draft.name}
            onChange={(name) => onDraft({ ...draft, name })}
            error={draftError}
          />
          <TextField
            id={`${idPrefix}-new-shop-city`}
            label="City"
            value={draft.city ?? ''}
            onChange={(city) => onDraft({ ...draft, city })}
            placeholder="Gdańsk"
          />
          <TextField
            id={`${idPrefix}-new-shop-website`}
            label="Website"
            value={draft.website ?? ''}
            onChange={(website) => onDraft({ ...draft, website })}
            placeholder="https://…"
          />
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          One of the last two, so somebody else can find it. It is added with this tin, for
          an admin to check.
        </p>
        <Button variant="ghost" size="sm" testId="shop-draft-clear" onClick={() => onDraft(null)}>
          Never mind the shop
        </Button>
      </fieldset>
    )
  }

  if (selected) {
    // Deliberately not a `Field`: there is no control left to label once the choice is
    // made, and a <label for> pointing at nothing is worse for a screen reader than a
    // plain heading.
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Where did it come from?
        </p>
        <div
          data-testid="shop-picked"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <span className="font-medium text-brand-900 dark:text-brand-100">{selected.name}</span>
          <span className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              testId="shop-picker-clear"
              onClick={() => onSelect(null)}
            >
              Change
            </Button>
          </span>
        </div>
      </div>
    )
  }

  const items = results.data?.items ?? []

  /**
   * `keepPreviousData` is right for the tea page `useTeaShops` was written for and wrong
   * here. Changing the tea would leave the *previous* tea's shops sitting on screen under
   * a heading that now lies, one tap away from being recorded against the new tea — and
   * clearing the tea entirely would leave them there too, because a disabled query still
   * renders its placeholder. `isPlaceholderData` is react-query saying "this is the answer
   * to a different question", and the honest thing to do with that is show nothing.
   */
  const sold = teaSlug && !sellers.isPlaceholderData ? (sellers.data?.items ?? []) : []

  return (
    <div className="space-y-2">
      {/* The question comes before either answer to it.
          With a shortlist on screen the field's own label cannot be the question — the
          shortlist would sit above it, announcing "Sold at" before anything had asked
          where the tin came from — so the question is promoted to a heading over both,
          and the box below it becomes the narrower "any other shop". With no shortlist
          there is nothing to head, and the question goes back to being the field's label,
          where a `<label for>` ties it to the input properly. */}
      {sold.length > 0 && (
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Where did it come from?
        </p>
      )}

      {sold.length > 0 && (
        <div data-testid="shop-picker-sold-at" className="space-y-1">
          <p
            id={`${idPrefix}-sold-at`}
            className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Sold at
          </p>
          <ul
            aria-labelledby={`${idPrefix}-sold-at`}
            data-testid="shop-picker-listings"
            className="divide-y divide-brand-100 rounded-lg border border-brand-200 dark:divide-neutral-800 dark:border-neutral-700"
          >
            {sold.map((listing) => {
              const detail = describeListing(listing)
              return (
                <li key={listing.id}>
                  <button
                    type="button"
                    data-testid={`shop-listing-${listing.id}`}
                    onClick={() => onSelect(toShopRef(listing.shop), listing)}
                    // Hover recedes to the ground colour rather than lifting to
                    // `neutral-800` — see the note on the identical row in TeaPicker.
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-950"
                  >
                    <span className="font-medium text-brand-900 dark:text-brand-100">
                      {listing.shop.name}
                    </span>
                    {detail && (
                      <span className="ml-auto text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {detail}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <TextField
        id={`${idPrefix}-shop-search`}
        label={sold.length > 0 ? 'Somewhere else' : 'Where did it come from?'}
        type="search"
        value={query}
        onChange={setQuery}
        placeholder="kruka, camellia, postal…"
        hint="The shop you bought it from. Leave it blank for a gift, or for a shop we do not know."
      />

      {results.isError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {describeApiError(results.error)}
        </p>
      )}

      {results.isPending && (
        <div role="status" aria-live="polite" data-testid="shop-picker-loading" className="space-y-1">
          <span className="sr-only">Searching the shops…</span>
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {!results.isPending && items.length === 0 && (
        <div
          data-testid="shop-picker-empty"
          className="space-y-2 text-xs text-neutral-500 dark:text-neutral-400"
        >
          {settled ? (
            <>
              <p>No shop matches that.</p>
              <Button
                testId="shop-picker-compose"
                onClick={() => onDraft({ name: settled.trim() })}
              >
                Add “{settled}” as a new shop
              </Button>
            </>
          ) : (
            <p>No shops in the catalog yet.</p>
          )}
          <p>Or leave it blank — a gift came from nowhere the catalog can name.</p>
        </div>
      )}

      {items.length > 0 && (
        <ul
          data-testid="shop-picker-results"
          className="divide-y divide-brand-100 rounded-lg border border-brand-200 dark:divide-neutral-800 dark:border-neutral-700"
        >
          {items.map((shop) => (
            <li key={shop.id}>
              <button
                type="button"
                data-testid={`shop-result-${shop.id}`}
                onClick={() => onSelect(toShopRef(shop))}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-950"
              >
                <span className="font-medium text-brand-900 dark:text-brand-100">{shop.name}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {describePlace(shop) ?? 'Online only'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

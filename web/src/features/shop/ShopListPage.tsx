import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormNote, TextField } from '../../components/ui/form'
import {
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useDebouncedParam } from '../../lib/debounce'
import { useAuth } from '../auth/auth-context'
import { pluralise } from '../catalog/format'
import { toShopInput } from './draft'
import type { ShopFilters, ShopView } from './filters'
import {
  hasShopFilters,
  NO_SHOP_FILTERS,
  readShopFilters,
  shopQueryParams,
  writeShopFilters,
} from './filters'
import type { NearPosition } from './nearby'
import {
  describePositionError,
  forgetStoredPosition,
  isPinned,
  readStoredPosition,
  requestPosition,
  storePosition,
} from './nearby'
import { useShopList, useSuggestShop } from './queries'
import { ShopCard } from './ShopCard'
import { ShopForm } from './ShopForm'
import { ShopMap } from './ShopMap'

/**
 * Browsing shops, the exact shape of browsing teas: filters in the URL, a debounced
 * search box, and a suggestion form for anybody signed in.
 *
 * City and country are text boxes rather than selects. A `<select>` would need the set
 * of every city any shop is in, which is an unbounded list and a request this page does
 * not otherwise have to make — and typing "Kra" is faster than finding Kraków in a list
 * of two hundred anyway.
 *
 * M7 adds two things that are *also* in the URL and for the same reason: which way the
 * page is drawn (`?view=map`) and where the reader is (`?near=lat,lng`). Neither is a
 * mode hidden in component state — a map of the shops near you is exactly the thing
 * somebody sends to a friend, and it has to survive a reload and answer the back button
 * like every other view of this list does.
 */
export function ShopListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readShopFilters(searchParams)
  const { user } = useAuth()
  const [suggesting, setSuggesting] = useState(false)
  // Bumped after a successful submit: remounting the form is the cheapest correct reset.
  const [formKey, setFormKey] = useState(0)
  const suggest = useSuggestShop()
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  /** `prev` rather than the `filters` in scope: two changes in the same tick — the
   *  debounced search landing while a city is being typed — would otherwise both be
   *  computed from one stale snapshot and the second would drop the first. Everything
   *  except paging resets to page 1. */
  function commit(patch: Partial<ShopFilters>, replace = false) {
    setSearchParams((prev) => writeShopFilters({ ...readShopFilters(prev), page: 1, ...patch }), {
      replace,
    })
  }

  // All three boxes debounce and replace rather than push: forty history entries for one
  // search is not a back button anybody wants.
  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))
  const [draftCity, setDraftCity] = useDebouncedParam(filters.city, (city) =>
    commit({ city }, true),
  )
  const [draftCountry, setDraftCountry] = useDebouncedParam(filters.country, (country) =>
    commit({ country }, true),
  )

  /** The view and the position are not "filters" and do not reset the page the way one
   *  does — flipping to the map should show the same shops you were looking at. */
  function setView(view: ShopView) {
    setSearchParams((prev) => writeShopFilters({ ...readShopFilters(prev), view }))
  }

  /** Page 1, because the ordering changes completely: "page 3 of the shops sorted by
   *  name" and "page 3 of the shops sorted by distance" have nothing in common. */
  function setNear(near: NearPosition | null) {
    setSearchParams((prev) => writeShopFilters({ ...readShopFilters(prev), near, page: 1 }))
  }

  /**
   * The permission prompt, and every way it can end.
   *
   * A refusal is not an error state for the page: the message says what happened and the
   * ordinary list is still underneath it, unchanged and working. Nothing here can leave
   * somebody looking at a screen whose only content is an apology.
   */
  function locate() {
    setLocationError(null)
    setLocating(true)
    void requestPosition().then(
      (position) => {
        setLocating(false)
        // Storage first, so the address bar and the remembered value can never disagree
        // about what happened — and the URL is what the query reads either way.
        storePosition(position)
        setNear(position)
      },
      (error: unknown) => {
        setLocating(false)
        setLocationError(describePositionError(error))
      },
    )
  }

  /** Both, always. A "Show all shops" that leaves the position in storage puts it
   *  straight back on the next visit, which reads as a setting that will not turn off. */
  function clearNearby() {
    forgetStoredPosition()
    setLocationError(null)
    setNear(null)
  }

  /**
   * A remembered position, adopted once on arrival.
   *
   * Mount-only, guarded by a ref rather than by the dependency list, and that is the
   * whole subtlety. If this ran whenever `near` went missing it would fight the back
   * button: stepping back out of a nearby view would immediately put it back, and the
   * button would look broken. Once per mount means a fresh `/shops` opens on your area
   * and every navigation after that is yours.
   *
   * The URL is rewritten with `replace`, so arriving at /shops does not leave a history
   * entry you have to press back through twice.
   */
  const adoptedStored = useRef(false)
  useEffect(() => {
    if (adoptedStored.current) return
    adoptedStored.current = true
    if (filters.near) return
    const stored = readStoredPosition()
    if (!stored) return
    setSearchParams((prev) => writeShopFilters({ ...readShopFilters(prev), near: stored }), {
      replace: true,
    })
    // Mount only — see above. `filters.near` is read for what it was on arrival, and
    // adding it to the list is precisely the bug this ref exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shops = useShopList(shopQueryParams(filters))
  const filtered = hasShopFilters(filters)
  const items = shops.data?.items ?? []
  const settled = !shops.isPending && !shops.isError

  // A shop nobody has pinned cannot be drawn, so it is counted and named rather than
  // quietly dropped — "12 shops" over a map with 9 pins on it is a bug report waiting to
  // happen. With a position active the server has already excluded them, so this is 0.
  const pinned = items.filter(isPinned)
  const unpinned = items.length - pinned.length

  function clearFilters() {
    setDraftQuery('')
    setDraftCity('')
    setDraftCountry('')
    // The view and the position survive: neither is something "Clear filters" was
    // pressed to undo, and dropping the position here would leave it in storage anyway.
    setSearchParams((prev) => {
      const { view, near } = readShopFilters(prev)
      return writeShopFilters({ ...NO_SHOP_FILTERS, view, near })
    })
  }

  return (
    <PageShell>
      <PageHeading
        title="Shops"
        subtitle="Where the tea comes from — the bricks-and-mortar ones and the ones that post."
        actions={
          user && (
            <Button
              variant={suggesting ? 'ghost' : 'primary'}
              testId="toggle-suggest-shop"
              onClick={() => setSuggesting((open) => !open)}
            >
              {suggesting ? 'Cancel' : 'Suggest a shop'}
            </Button>
          )
        }
      />

      {user && suggesting && (
        <Panel className="mb-6" ariaLabel="Suggest a shop">
          <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Suggest a shop
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            It joins the list once an admin has looked it over.
          </p>
          {suggest.isSuccess && (
            <div className="mb-4">
              <FormNote testId="suggest-shop-success">
                Thanks — “{suggest.data.name}” is queued for review.
              </FormNote>
            </div>
          )}
          <ShopForm
            key={formKey}
            idPrefix="suggest-shop"
            submitLabel="Send for review"
            pendingLabel="Sending…"
            pending={suggest.isPending}
            error={suggest.isError ? describeApiError(suggest.error) : null}
            // `POST /shops` has no picture in its body, so the form does not offer one.
            // An admin adds it when the shop is approved.
            onSubmit={(draft) =>
              suggest.mutate(toShopInput(draft, false), {
                onSuccess: () => setFormKey((key) => key + 1),
              })
            }
          />
        </Panel>
      )}

      <Panel className="mb-6" ariaLabel="Filters">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="shop-search"
            label="Search shops"
            type="search"
            value={draftQuery}
            onChange={setDraftQuery}
            placeholder="kruka, camellia, postal…"
          />
          <TextField
            id="shop-city"
            label="City"
            type="search"
            value={draftCity}
            onChange={setDraftCity}
            placeholder="Kraków"
          />
          <TextField
            id="shop-country"
            label="Country"
            type="search"
            value={draftCountry}
            onChange={setDraftCountry}
            placeholder="Poland"
          />
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* One control that reports its state, rather than a button whose label flips
            between "Map" and "List" and leaves a screen reader to work out which of the
            two it is currently looking at. */}
        <div className="flex gap-1" role="group" aria-label="How to show the shops">
          <Button
            variant={filters.view === 'list' ? 'primary' : 'secondary'}
            ariaPressed={filters.view === 'list'}
            testId="shop-view-list"
            onClick={() => setView('list')}
          >
            List
          </Button>
          <Button
            variant={filters.view === 'map' ? 'primary' : 'secondary'}
            ariaPressed={filters.view === 'map'}
            testId="shop-view-map"
            onClick={() => setView('map')}
          >
            Map
          </Button>
        </div>

        <Button testId="locate-me" disabled={locating} onClick={locate}>
          {locating ? 'Finding you…' : 'Shops near me'}
        </Button>
      </div>

      {/* Not an ErrorNote: nothing has failed. Somebody answered a permission prompt, or
          a device does not know where it is, and the list below is unaffected. */}
      {locationError && (
        <p
          role="status"
          aria-live="polite"
          data-testid="locate-me-error"
          className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {locationError}
        </p>
      )}

      {filters.near && (
        <div
          data-testid="nearby-banner"
          className="note-info mb-4 flex flex-wrap items-center justify-between gap-2"
        >
          {/* The second sentence is the honest half. Sorting by distance drops every
              shop nobody has pinned, and a list quietly missing a third of itself is
              worse than a list that says so. */}
          <p>
            Closest to you first. Shops nobody has pinned on a map are not in this list.
          </p>
          <Button variant="ghost" testId="clear-nearby" onClick={clearNearby}>
            Show all shops
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          aria-live="polite"
          data-testid="shop-count"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {shops.isPending ? 'Searching…' : pluralise(shops.data?.total ?? 0, 'shop')}
        </p>
        {filtered && (
          <Button variant="ghost" testId="clear-shop-filters" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {shops.isError && (
        <ErrorNote testId="shop-list-error">{describeApiError(shops.error)}</ErrorNote>
      )}

      {shops.isPending &&
        (filters.view === 'map' ? (
          <div role="status" aria-live="polite" data-testid="shop-map-loading">
            <span className="sr-only">Loading the map…</span>
            <Skeleton className="h-[26rem] w-full rounded-2xl" />
          </div>
        ) : (
          <LoadingGrid label="Loading shops…" testId="shop-list-loading" />
        ))}

      {!shops.isPending && !shops.isError && items.length === 0 && (
        // Two different situations, two different sentences. "No results" on a list that
        // has never had a shop in it sends the reader hunting for a typo.
        filtered ? (
          <EmptyState title="No shops match those filters" testId="shop-list-no-results">
            <p>Try a broader search, or drop the city.</p>
            <Button onClick={clearFilters}>Clear filters</Button>
          </EmptyState>
        ) : (
          <EmptyState title="No shops yet" testId="shop-list-empty">
            <p>Nobody has added one.</p>
            {user ? (
              <p>Be the first — use “Suggest a shop” above.</p>
            ) : (
              <p>Sign in to suggest the first one.</p>
            )}
          </EmptyState>
        )
      )}

      {/* `items.length > 0` matters: without it a filter that matches nothing renders the
          "no shops match" message *and* an empty map underneath it, which reads as a
          broken map rather than an empty result. */}
      {settled && filters.view === 'map' && items.length > 0 && (
        <div className={shops.isPlaceholderData ? 'opacity-60' : ''}>
          <ShopMap shops={pinned} you={filters.near} />
          {unpinned > 0 && (
            <p
              data-testid="shop-map-hidden"
              className="mt-2 text-sm text-neutral-600 dark:text-neutral-400"
            >
              {pluralise(unpinned, 'shop')} on this page {unpinned === 1 ? 'has' : 'have'} no pin
              yet, so {unpinned === 1 ? 'it is' : 'they are'} not on the map.{' '}
              <button
                type="button"
                data-testid="shop-map-hidden-to-list"
                onClick={() => setView('list')}
                className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
              >
                See the list instead
              </button>
              .
            </p>
          )}
        </div>
      )}

      {filters.view === 'list' && items.length > 0 && (
        <ul
          data-testid="shop-list"
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
            shops.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {items.map((shop) => (
            <ShopCard key={shop.id} shop={shop} />
          ))}
        </ul>
      )}

      <Pagination
        page={shops.data?.page ?? 1}
        pages={shops.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </PageShell>
  )
}

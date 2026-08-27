import { useState } from 'react'
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
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useDebouncedParam } from '../../lib/debounce'
import { useAuth } from '../auth/auth-context'
import { pluralise } from '../catalog/format'
import { toShopInput } from './draft'
import type { ShopFilters } from './filters'
import { hasShopFilters, readShopFilters, shopQueryParams, writeShopFilters } from './filters'
import { useShopList, useSuggestShop } from './queries'
import { ShopCard } from './ShopCard'
import { ShopForm } from './ShopForm'

/**
 * Browsing shops, the exact shape of browsing teas: filters in the URL, a debounced
 * search box, and a suggestion form for anybody signed in.
 *
 * City and country are text boxes rather than selects. A `<select>` would need the set
 * of every city any shop is in, which is an unbounded list and a request this page does
 * not otherwise have to make — and typing "Kra" is faster than finding Kraków in a list
 * of two hundred anyway.
 */
export function ShopListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readShopFilters(searchParams)
  const { user } = useAuth()
  const [suggesting, setSuggesting] = useState(false)
  // Bumped after a successful submit: remounting the form is the cheapest correct reset.
  const [formKey, setFormKey] = useState(0)
  const suggest = useSuggestShop()

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

  const shops = useShopList(shopQueryParams(filters))
  const filtered = hasShopFilters(filters)
  const items = shops.data?.items ?? []

  function clearFilters() {
    setDraftQuery('')
    setDraftCity('')
    setDraftCountry('')
    setSearchParams(new URLSearchParams())
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

      {shops.isPending && <LoadingGrid label="Loading shops…" testId="shop-list-loading" />}

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

      {items.length > 0 && (
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

import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useDebouncedValue } from '../../lib/debounce'
import type { ShopRef, ShopSummary } from '../../lib/shop'
import { describePlace } from '../shop/format'
import { useShopList } from '../shop/queries'

const RESULT_LIMIT = 8

/** The browse summary carries far more than a tin needs; this is the narrowing, and it
 *  matches the `shop` a tin comes back wearing. */
function toShopRef(shop: ShopSummary): ShopRef {
  return { id: shop.id, slug: shop.slug, name: shop.name }
}

/**
 * Where a tin came from, when you are typing it in by hand.
 *
 * The same control as `TeaPicker`, and a `<select>` is the wrong answer here for the same
 * reason it is there: the shop list is unbounded, so that control would grow until it
 * either stopped fitting on a phone or stopped loading. A debounced search against
 * `/shops?q=` asks for eight rows at a time and never more.
 *
 * Optional, unlike the tea, so there is a way to say "actually, never mind" once
 * something is picked — and no error slot, because leaving this blank is the ordinary
 * case rather than an unfinished field.
 */
export function ShopPicker({
  idPrefix,
  selected,
  onSelect,
}: {
  idPrefix: string
  selected: ShopRef | null
  onSelect: (shop: ShopRef | null) => void
}) {
  const [query, setQuery] = useState('')
  const settled = useDebouncedValue(query)
  const results = useShopList({ q: settled || undefined, size: RESULT_LIMIT })

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
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
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

  return (
    <div className="space-y-2">
      <TextField
        id={`${idPrefix}-shop-search`}
        label="Where did it come from?"
        type="search"
        value={query}
        onChange={setQuery}
        placeholder="kruka, camellia, postal…"
        hint="Optional. Search the shops and pick one."
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
        <p data-testid="shop-picker-empty" className="text-xs text-neutral-500 dark:text-neutral-400">
          No shop matches that. Leave it blank if it did not come from one we know.
        </p>
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
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-800"
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

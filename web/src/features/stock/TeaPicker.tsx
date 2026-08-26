import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Badge, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { TeaSummary } from '../../lib/catalog'
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import type { TeaRef } from '../../lib/household'
import { useDebouncedValue } from '../../lib/debounce'
import { useTeaList } from '../catalog/queries'

const RESULT_LIMIT = 8

/** The catalog's summary carries more than a tin needs; this is the narrowing. */
function toTeaRef(tea: TeaSummary): TeaRef {
  return {
    id: tea.id,
    slug: tea.slug,
    name: tea.name,
    tea_type: tea.tea_type,
    image_url: tea.image_url,
  }
}

/**
 * Picking which tea a new tin holds.
 *
 * A `<select>` is the obvious thing and the wrong one: the catalog is unbounded, so that
 * control would grow until it either stopped fitting on a phone or stopped loading. A
 * debounced search against `/catalog/teas?q=` asks for eight rows at a time and never
 * more, however large the catalog gets.
 *
 * Once something is picked the search collapses to the choice plus a way out of it,
 * because a list of nine alternatives under a decision already made is just clutter.
 */
export function TeaPicker({
  idPrefix,
  selected,
  onSelect,
  error,
}: {
  idPrefix: string
  selected: TeaRef | null
  onSelect: (tea: TeaRef | null) => void
  error?: string
}) {
  const [query, setQuery] = useState('')
  const settled = useDebouncedValue(query)
  const results = useTeaList({ q: settled || undefined, size: RESULT_LIMIT })

  if (selected) {
    // Deliberately not a `Field`: there is no control left to label once the choice is
    // made, and a <label for> pointing at nothing is worse for a screen reader than a
    // plain heading.
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tea</p>
        <div
          data-testid="tea-picked"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <span className="font-medium text-brand-900 dark:text-brand-100">{selected.name}</span>
          <Badge tone="brand">{TEA_TYPE_LABELS[selected.tea_type]}</Badge>
          <span className="ml-auto">
            <Button variant="ghost" size="sm" testId="tea-picker-clear" onClick={() => onSelect(null)}>
              Change
            </Button>
          </span>
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    )
  }

  const items = results.data?.items ?? []

  return (
    <div className="space-y-2">
      <TextField
        id={`${idPrefix}-tea-search`}
        label="Which tea?"
        type="search"
        value={query}
        onChange={setQuery}
        placeholder="sencha, breakfast, rooibos…"
        hint="Search the catalog and pick one."
        error={error}
      />

      {results.isError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {describeApiError(results.error)}
        </p>
      )}

      {results.isPending && (
        <div role="status" aria-live="polite" data-testid="tea-picker-loading" className="space-y-1">
          <span className="sr-only">Searching the catalog…</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {!results.isPending && items.length === 0 && (
        <p data-testid="tea-picker-empty" className="text-xs text-neutral-500 dark:text-neutral-400">
          Nothing in the catalog matches that. Add it under Teas first.
        </p>
      )}

      {items.length > 0 && (
        <ul data-testid="tea-picker-results" className="divide-y divide-brand-100 rounded-lg border border-brand-200 dark:divide-neutral-800 dark:border-neutral-700">
          {items.map((tea) => (
            <li key={tea.id}>
              <button
                type="button"
                data-testid={`tea-result-${tea.id}`}
                onClick={() => onSelect(toTeaRef(tea))}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-800"
              >
                <span className="font-medium text-brand-900 dark:text-brand-100">{tea.name}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {TEA_TYPE_LABELS[tea.tea_type]}
                  {tea.brand ? ` · ${tea.brand.name}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

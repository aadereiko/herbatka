import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Badge, PendingBadge, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { TeaInput, TeaSummary } from '../../lib/catalog'
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
 *
 * A search that finds nothing used to end the conversation — "add it under Teas first",
 * which meant abandoning a half-filled form, going somewhere else, creating the tea and
 * starting again. It now offers to write the tea here instead. The tea is not posted at
 * that point: `AddTinForm` carries it as `new_tea` on the tin, so one request creates
 * both and a failure creates neither. That is why the draft is shown *as* a draft, with
 * the same "Awaiting review" badge an unapproved ingredient wears in `TeaForm` — nothing
 * has been saved yet, and a chip that looked like a catalog pick would say otherwise.
 */
export function TeaPicker({
  idPrefix,
  selected,
  draft = null,
  onSelect,
  onCompose,
  error,
}: {
  idPrefix: string
  selected: TeaRef | null
  /** A tea being written on the way past, not yet in the catalog and with no id to point
   *  at. Mutually exclusive with `selected` — one tin holds one tea. */
  draft?: TeaInput | null
  onSelect: (tea: TeaRef | null) => void
  /** "Nothing matched; write it." Carries whatever was typed, so the name arrives filled
   *  in. `null` clears a draft, the same way `onSelect(null)` clears a pick.
   *
   *  Optional, and its absence is what `AdminListingsPanel` relies on: a listing points
   *  at a tea, and inventing one from a shop's admin panel is a different act from
   *  shelving a tin of it. Without this the empty state is the sentence it always was. */
  onCompose?: (name: string | null) => void
  error?: string
}) {
  const [query, setQuery] = useState('')
  const settled = useDebouncedValue(query)
  const results = useTeaList({ q: settled || undefined, size: RESULT_LIMIT })

  if (draft) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tea</p>
        <div
          data-testid="tea-drafted"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <span className="font-medium text-brand-900 dark:text-brand-100">{draft.name}</span>
          <Badge tone="brand">{TEA_TYPE_LABELS[draft.tea_type]}</Badge>
          <PendingBadge />
          <span className="ml-auto">
            {/* Optional call, not a guard around the chip: only a caller that passes
                `onCompose` can have produced a draft in the first place. */}
            <Button
              variant="ghost"
              size="sm"
              testId="tea-draft-clear"
              onClick={() => onCompose?.(null)}
            >
              Change
            </Button>
          </span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          It goes into the catalog with this tin, for an admin to check.
        </p>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (selected) {
    // Deliberately not a `Field`: there is no control left to label once the choice is
    // made, and a <label for> pointing at nothing is worse for a screen reader than a
    // plain heading.
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tea</p>
        <div
          data-testid="tea-picked"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
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
        <div
          data-testid="tea-picker-empty"
          className="space-y-2 text-xs text-neutral-500 dark:text-neutral-400"
        >
          {!settled ? (
            <p>No teas in the catalog yet.</p>
          ) : onCompose ? (
            <>
              <p>Nothing in the catalog matches that.</p>
              {/* The sentence that used to send people away, turned into the thing it was
                  telling them to go and do. Same move as the unknown-ingredient button in
                  `TeaForm`, one level up. */}
              <Button testId="tea-picker-compose" onClick={() => onCompose(settled.trim())}>
                Add “{settled}” as a new tea
              </Button>
            </>
          ) : (
            <p>Nothing in the catalog matches that. Add it under Teas first.</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul data-testid="tea-picker-results" className="divide-y divide-brand-100 rounded-lg border border-brand-200 dark:divide-neutral-800 dark:border-neutral-700">
          {items.map((tea) => (
            <li key={tea.id}>
              <button
                type="button"
                data-testid={`tea-result-${tea.id}`}
                onClick={() => onSelect(toTeaRef(tea))}
                // The hover fill recedes to the ground colour rather than lifting to
                // `neutral-800`. `neutral-800` doubles as the rule colour and so has to
                // stay bright, and this row carries `text-neutral-400` secondary copy,
                // which measures 3.8:1 on it — a hover state is not allowed to be the
                // moment the text stops clearing AA.
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-950"
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

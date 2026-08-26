import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormNote, SelectField, TextField } from '../../components/ui/form'
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
import { TEA_TYPES, TEA_TYPE_LABELS } from '../../lib/catalog'
import { useDebouncedParam } from '../../lib/debounce'
import { useAuth } from '../auth/auth-context'
import type { TeaFilters } from './filters'
import { hasTeaFilters, readTeaFilters, teaQueryParams, writeTeaFilters } from './filters'
import { pluralise } from './format'
import { useBrandList, useIngredientList, useSuggestTea, useTeaList } from './queries'
import { TeaCard } from './TeaCard'
import { TeaForm } from './TeaForm'

/** Adds the current value as its own option when it is not in the fetched page, so a
 *  shared link filtered by an ingredient outside the first hundred still shows what it
 *  is filtered by instead of silently reading "Any". */
function withCurrent(
  options: { value: string; label: string }[],
  current: string,
): { value: string; label: string }[] {
  if (!current || options.some((option) => option.value === current)) return options
  return [...options, { value: current, label: current }]
}

export function TeaListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readTeaFilters(searchParams)
  const { user } = useAuth()
  const [suggesting, setSuggesting] = useState(false)
  // Bumped after a successful submit: remounting the form is the cheapest correct reset.
  const [formKey, setFormKey] = useState(0)
  const suggest = useSuggestTea()

  /**
   * Every filter change goes through here, and the URL is the only place the result is
   * written — no local mirror to fall out of sync. Any change except paging resets to
   * page 1, because "page 7 of the unfiltered list" is meaningless once you have typed a
   * search; the paging call passes `page` explicitly and so overrides that.
   *
   * `prev` rather than the `filters` in scope: two changes in the same tick (the
   * debounced search landing while a chip click is in flight) would otherwise both be
   * computed from the same stale snapshot and the second would drop the first.
   */
  function commit(patch: Partial<TeaFilters>, replace = false) {
    setSearchParams((prev) => writeTeaFilters({ ...readTeaFilters(prev), page: 1, ...patch }), {
      replace,
    })
  }

  // Typing replaces rather than pushes: forty history entries for one search is not a
  // back button anybody wants.
  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))

  const teas = useTeaList(teaQueryParams(filters))
  const ingredients = useIngredientList({ size: 100 })
  const brands = useBrandList({ size: 100 })

  const ingredientOptions = withCurrent(
    [
      { value: '', label: 'Any ingredient' },
      ...(ingredients.data?.items ?? []).map((item) => ({ value: item.slug, label: item.name })),
    ],
    filters.ingredient,
  )

  const brandOptions = withCurrent(
    [
      { value: '', label: 'Any brand' },
      ...(brands.data?.items ?? []).map((brand) => ({ value: brand.slug, label: brand.name })),
    ],
    filters.brand,
  )

  const filtered = hasTeaFilters(filters)
  const items = teas.data?.items ?? []

  function clearFilters() {
    setDraftQuery('')
    setSearchParams(new URLSearchParams())
  }

  return (
    <PageShell>
      <PageHeading
        title="Teas"
        subtitle="Everything the catalog knows about, from single-estate greens to the herbal blends."
        actions={
          user && (
            <Button
              variant={suggesting ? 'ghost' : 'primary'}
              testId="toggle-suggest"
              onClick={() => setSuggesting((open) => !open)}
            >
              {suggesting ? 'Cancel' : 'Suggest a tea'}
            </Button>
          )
        }
      />

      {user && suggesting && (
        <Panel className="mb-6" ariaLabel="Suggest a tea">
          <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Suggest a tea
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            It joins the catalog once an admin has looked it over.
          </p>
          {suggest.isSuccess && (
            <div className="mb-4">
              <FormNote testId="suggest-success">
                Thanks — “{suggest.data.name}” is queued for review.
              </FormNote>
            </div>
          )}
          <TeaForm
            key={formKey}
            idPrefix="suggest-tea"
            submitLabel="Send for review"
            pendingLabel="Sending…"
            pending={suggest.isPending}
            error={suggest.isError ? describeApiError(suggest.error) : null}
            onSubmit={(input) =>
              suggest.mutate(input, { onSuccess: () => setFormKey((key) => key + 1) })
            }
          />
        </Panel>
      )}

      <Panel className="mb-6" ariaLabel="Filters">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="tea-search"
            label="Search teas"
            type="search"
            value={draftQuery}
            onChange={setDraftQuery}
            placeholder="jasmine, breakfast, sencha…"
          />
          <SelectField
            id="tea-ingredient"
            label="Ingredient"
            value={filters.ingredient}
            onChange={(ingredient) => commit({ ingredient })}
            options={ingredientOptions}
          />
          <SelectField
            id="tea-brand"
            label="Brand"
            value={filters.brand}
            onChange={(brand) => commit({ brand })}
            options={brandOptions}
          />
        </div>

        <div
          role="group"
          aria-label="Tea type"
          className="mt-4 flex flex-wrap gap-2"
          data-testid="tea-type-chips"
        >
          <TypeChip
            active={filters.teaType === null}
            label="All types"
            onClick={() => commit({ teaType: null })}
          />
          {TEA_TYPES.map((type) => (
            <TypeChip
              key={type}
              active={filters.teaType === type}
              label={TEA_TYPE_LABELS[type]}
              // Clicking the active chip clears it — the alternative is a filter you can
              // set from the keyboard but only unset by finding "All types".
              onClick={() => commit({ teaType: filters.teaType === type ? null : type })}
            />
          ))}
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          aria-live="polite"
          data-testid="tea-count"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {teas.isPending ? 'Searching…' : pluralise(teas.data?.total ?? 0, 'tea')}
        </p>
        {filtered && (
          <Button variant="ghost" testId="clear-filters" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {teas.isError && <ErrorNote testId="tea-list-error">{describeApiError(teas.error)}</ErrorNote>}

      {teas.isPending && <LoadingGrid label="Loading teas…" testId="tea-list-loading" />}

      {!teas.isPending && !teas.isError && items.length === 0 && (
        // Two different situations, two different sentences. "No results" on a catalog
        // that has never had a tea in it sends the reader hunting for a typo.
        filtered ? (
          <EmptyState title="No teas match those filters" testId="tea-list-no-results">
            <p>Try a broader search, or drop one of the filters.</p>
            <Button onClick={clearFilters}>Clear filters</Button>
          </EmptyState>
        ) : (
          <EmptyState title="The catalog is empty" testId="tea-list-empty">
            <p>No teas have been added yet.</p>
            {user ? (
              <p>Be the first — use “Suggest a tea” above.</p>
            ) : (
              <p>Sign in to suggest the first one.</p>
            )}
          </EmptyState>
        )
      )}

      {items.length > 0 && (
        <ul
          data-testid="tea-list"
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
            teas.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {items.map((tea) => (
            <TeaCard key={tea.id} tea={tea} />
          ))}
        </ul>
      )}

      <Pagination
        page={teas.data?.page ?? 1}
        pages={teas.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </PageShell>
  )
}

function TypeChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-brand-600 px-3 py-1 text-sm font-medium text-white'
          : 'rounded-full border border-brand-200 px-3 py-1 text-sm font-medium text-brand-800 hover:bg-brand-50 dark:border-neutral-700 dark:text-brand-200 dark:hover:bg-neutral-800'
      }
    >
      {label}
    </button>
  )
}

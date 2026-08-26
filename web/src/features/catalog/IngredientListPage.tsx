import { useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import { SelectField, TextField } from '../../components/ui/form'
import {
  Badge,
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { IngredientCategory } from '../../lib/catalog'
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS } from '../../lib/catalog'
import { useDebouncedParam } from '../../lib/debounce'
import type { IngredientFilters } from './filters'
import {
  hasIngredientFilters,
  ingredientQueryParams,
  readIngredientFilters,
  writeIngredientFilters,
} from './filters'
import { pluralise } from './format'
import { useIngredientList } from './queries'

const categoryOptions = [
  { value: '', label: 'Every category' },
  ...INGREDIENT_CATEGORIES.map((value) => ({
    value,
    label: INGREDIENT_CATEGORY_LABELS[value],
  })),
]

/** The public vocabulary list. Same URL-is-the-state approach as /teas — see
 *  `filters.ts` — just with one filter instead of four. */
export function IngredientListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readIngredientFilters(searchParams)

  function commit(patch: Partial<IngredientFilters>, replace = false) {
    setSearchParams(
      (prev) => writeIngredientFilters({ ...readIngredientFilters(prev), page: 1, ...patch }),
      { replace },
    )
  }

  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))
  const ingredients = useIngredientList(ingredientQueryParams(filters))

  const items = ingredients.data?.items ?? []
  const filtered = hasIngredientFilters(filters)

  function clearFilters() {
    setDraftQuery('')
    setSearchParams(new URLSearchParams())
  }

  return (
    <PageShell>
      <PageHeading
        title="Ingredients"
        subtitle="The shared vocabulary every tea is described with. Admins keep it tidy."
      />

      <Panel className="mb-6" ariaLabel="Filters">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="ingredient-search"
            label="Search ingredients"
            type="search"
            value={draftQuery}
            onChange={setDraftQuery}
            placeholder="mint, bergamot, cardamom…"
          />
          <SelectField
            id="ingredient-category"
            label="Category"
            value={filters.category ?? ''}
            onChange={(value) => commit({ category: (value || null) as IngredientCategory | null })}
            options={categoryOptions}
          />
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          aria-live="polite"
          data-testid="ingredient-count"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {ingredients.isPending
            ? 'Searching…'
            : pluralise(ingredients.data?.total ?? 0, 'ingredient')}
        </p>
        {filtered && (
          <Button variant="ghost" testId="clear-ingredient-filters" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {ingredients.isError && (
        <ErrorNote testId="ingredient-list-error">{describeApiError(ingredients.error)}</ErrorNote>
      )}

      {ingredients.isPending && (
        <LoadingGrid label="Loading ingredients…" testId="ingredient-list-loading" count={6} />
      )}

      {!ingredients.isPending && !ingredients.isError && items.length === 0 && (
        filtered ? (
          <EmptyState title="No ingredients match that" testId="ingredient-list-no-results">
            <p>Try a shorter search, or a different category.</p>
            <Button onClick={clearFilters}>Clear filters</Button>
          </EmptyState>
        ) : (
          <EmptyState title="No ingredients yet" testId="ingredient-list-empty">
            <p>An admin has not added any ingredients to the vocabulary yet.</p>
          </EmptyState>
        )
      )}

      {items.length > 0 && (
        <ul
          data-testid="ingredient-list"
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
            ingredients.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {items.map((ingredient) => (
            <Panel as="li" key={ingredient.id} className="list-none">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-base font-semibold text-brand-900 dark:text-brand-100">
                  {ingredient.name}
                </h2>
                <Badge tone="neutral">
                  {INGREDIENT_CATEGORY_LABELS[ingredient.category]}
                </Badge>
                {ingredient.is_caffeinated && <Badge tone="amber">Caffeinated</Badge>}
              </div>
              {ingredient.description && (
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {ingredient.description}
                </p>
              )}
            </Panel>
          ))}
        </ul>
      )}

      <Pagination
        page={ingredients.data?.page ?? 1}
        pages={ingredients.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </PageShell>
  )
}

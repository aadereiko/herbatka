import { useState } from 'react'
import type { ReactNode } from 'react'
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

      {/* The index down one side and the shelf on the other.
          
          The filters were a full-width panel above the grid, which works but reads as a
          form. As a column they read as the printed index in the front of a tea
          merchant's catalogue — which is what the brief asks for, and which also puts the
          controls beside the results they change instead of scrolling away from them.

          `lg` rather than `sm`, because the sidebar is only an improvement once there is
          room for two or three cards *next* to it. Below that the same markup stacks: the
          index becomes a panel above the grid and the type list unwraps into a row of
          chips, which is the shape that fits a phone. */}
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside>
          {/* Sticky under the bar on a tall screen, so the index stays put while the
              shelf scrolls.
              
              `top-24` is 96px, measured rather than guessed: the header is two sticky rows
              totalling 90px (29 + 61), and this has to clear both plus a little air. It
              was `top-32` while a third row existed. If a row is added or removed, this
              number moves with it — the two are coupled and nothing in CSS enforces it,
              which is why the arithmetic is written down here. */}
          <div className="lg:sticky lg:top-24">
            <FilterIndex>
              <TextField
                id="tea-search"
                label="Search teas"
                type="search"
                value={draftQuery}
                onChange={setDraftQuery}
                placeholder="jasmine, breakfast, sencha…"
              />

              <p
                id="tea-type-heading"
                className="mb-2 mt-6 border-t border-brand-100 pt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
              >
                Tea type
              </p>
              {/* The rule down the index lives on the *group*, not on the entries.
                  
                  It arrived by accident first: the entries carried `lg:border-transparent`
                  to hide their chip border, and `dark:border-neutral-700` outranked it,
                  because `dark:` is a plain always-on variant here (see index.css §1) and
                  Tailwind sorts variant utilities after the media-query ones. The result
                  was a continuous line that looked deliberate and was not.
                  
                  It looked deliberate because a rule down the margin is exactly what a
                  printed index has, so it stays — but owned by the container, where no
                  cascade race can decide whether it exists. The entries now zero their
                  border width at `lg` (`border-0` sets a *width*, so it cannot lose to a
                  border-*colour* utility whatever the sort order), and the current entry
                  marks itself with an inset shadow, which is a third property again. */}
              <div
                role="group"
                aria-labelledby="tea-type-heading"
                className="flex flex-wrap gap-1 lg:flex-col lg:gap-0 lg:border-l-2 lg:border-brand-200 lg:dark:border-neutral-800"
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
                    // Clicking the active entry clears it — the alternative is a filter
                    // you can set from the keyboard but only unset by finding "All types".
                    onClick={() => commit({ teaType: filters.teaType === type ? null : type })}
                  />
                ))}
              </div>

              <div className="mt-6 space-y-4 border-t border-brand-100 pt-5 dark:border-neutral-800">
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

              {filtered && (
                <div className="mt-5 border-t border-brand-100 pt-4 dark:border-neutral-800">
                  <Button variant="ghost" testId="clear-filters" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </div>
              )}
            </FilterIndex>
          </div>
        </aside>

        <div>
          <p
            role="status"
            aria-live="polite"
            data-testid="tea-count"
            className="mb-4 text-sm text-neutral-600 dark:text-neutral-400"
          >
            {teas.isPending ? 'Searching…' : pluralise(teas.data?.total ?? 0, 'tea')}
          </p>

          {teas.isError && (
            <ErrorNote testId="tea-list-error">{describeApiError(teas.error)}</ErrorNote>
          )}

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
              // One column narrower than before at every step, because the grid now shares
              // the row with the index.
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${
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
        </div>
      </div>
    </PageShell>
  )
}

/**
 * The index column: no box, just hairlines.
 *
 * It was a `Panel` — a bordered, filled card — and the reference does the opposite: the
 * filters are set directly on the page ground with a rule between each group, so the
 * grid beside them is the only thing on the screen that reads as a surface. Losing the
 * border is what makes the whole page feel wider without anything actually moving.
 */
function FilterIndex({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Filters" className="pb-2">
      {children}
    </section>
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
      // Two shapes from one element, because this control lives in two layouts.
      //
      // Below `lg` it is a chip in a wrapping row: a small bordered rectangle, filled with
      // wood when it is on. From `lg` it is a *line in an index*: full width, borderless,
      // with the current entry marked by a leaf-green tab against the group's margin rule
      // — the same green `btn-current` puts under the nav's current entry. One mark for
      // "you are here", used everywhere it is needed.
      //
      // The green tab is an inset `box-shadow` rather than a border colour, and the entry
      // zeroes its border *width* rather than setting it transparent. Both avoid the same
      // trap: `dark:` is an always-on variant in this codebase and sorts after the
      // media-query variants, so any `lg:border-<colour>` here silently loses to the
      // `dark:border-*` beside it. Width and box-shadow are different properties and
      // cannot lose that race.
      //
      // The border is present in both states below `lg`. Without it the pressed chip is
      // 2px smaller than its neighbours and the whole row shuffles when you click.
      //
      // `aria-pressed` carries the state regardless, so none of this is colour-only.
      className={
        active
          ? 'rounded-full border border-brand-600 bg-brand-600 px-3.5 py-1 text-sm font-medium text-white lg:rounded-none lg:w-full lg:border-0 lg:bg-neutral-800 lg:py-1.5 lg:pl-3 lg:text-left lg:font-semibold lg:text-brand-100 lg:shadow-[inset_3px_0_0_0_var(--color-leaf-600)]'
          : 'rounded-full border border-brand-200 px-3.5 py-1 text-sm font-medium text-brand-800 hover:bg-brand-50 dark:border-neutral-700 dark:text-brand-200 dark:hover:bg-neutral-800 lg:rounded-none lg:w-full lg:border-0 lg:bg-transparent lg:py-1.5 lg:pl-3 lg:text-left lg:dark:hover:bg-neutral-800 lg:dark:hover:text-brand-100'
      }
    >
      {label}
    </button>
  )
}

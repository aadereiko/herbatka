import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormNote, TextField } from '../../components/ui/form'
import {
  EmptyState,
  ErrorNote,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { StockItemInput } from '../../lib/household'
import { useDebouncedParam } from '../../lib/debounce'
import { pluralise } from '../catalog/format'
import { AddTinForm } from './AddTinForm'
import type { StockFilters } from './filters'
import { hasStockFilters, readStockFilters, stockQueryParams, writeStockFilters } from './filters'
import { useAddStockItem, useStockEvent, useStockList } from './queries'
import { StockTinCard } from './StockTinCard'

/**
 * The shelf: the screen this whole feature exists for.
 *
 * It is a single column at every width. The temptation is a grid on a desktop, but the
 * device this is read on is a phone held in one hand next to a kettle, and a layout that
 * is second-best on a laptop and first-best on a phone is the right trade here.
 *
 * The filters live in the query string — `?q=`, `?low=1` — so "here's what we're out of"
 * is a link you can send to whoever does the shopping.
 */
export function StockList({ householdId }: { householdId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readStockFilters(searchParams)

  const [adding, setAdding] = useState(false)
  // Bumped after a successful add: remounting the form is the cheapest correct reset.
  const [formKey, setFormKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  /** Which tin a refused brew belongs to. One at a time is deliberate — the message is
   *  about the tap you just made, and a column of stale refusals is noise. */
  const [tinError, setTinError] = useState<{ id: string; message: string } | null>(null)

  const stock = useStockList(householdId, stockQueryParams(filters))
  const brew = useStockEvent(householdId)
  const add = useAddStockItem(householdId)

  /** `prev` rather than the `filters` in scope: the debounced search landing in the same
   *  tick as a toggle click would otherwise compute both from one stale snapshot and drop
   *  the first. Everything except paging resets to page 1. */
  function commit(patch: Partial<StockFilters>, replace = false) {
    setSearchParams((prev) => writeStockFilters({ ...readStockFilters(prev), page: 1, ...patch }), {
      replace,
    })
  }

  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))

  function handleBrew(itemId: string, grams: number) {
    setNotice(null)
    brew.mutate(
      { itemId, input: { kind: 'brew', grams } },
      {
        // The 409 case. `useStockEvent` has already rolled the number back by the time
        // this runs; all that is left is to say why, in the server's own words, because
        // "only 3 g left" is the only useful thing anybody could print here.
        onError: (error) => setTinError({ id: itemId, message: describeApiError(error) }),
        onSuccess: () => setTinError((current) => (current?.id === itemId ? null : current)),
      },
    )
  }

  function handleAdd(input: StockItemInput) {
    setNotice(null)
    add.mutate(input, {
      onSuccess: (item) => {
        setAdding(false)
        setFormKey((key) => key + 1)
        // The second sentence is owed to anybody who typed the tea in themselves: it is
        // in the catalog now, marked, and an admin will look at it. Read off what was
        // *sent* rather than off the response, because `TeaRef` carries no approval flag
        // and widening it for one sentence would touch every screen that renders a tin.
        setNotice(
          input.new_tea
            ? `Added “${item.tea.name}” to the shelf, and to the catalog for an admin to check.`
            : `Added “${item.tea.name}” to the shelf.`,
        )
      },
    })
  }

  const items = stock.data?.items ?? []
  const filtered = hasStockFilters(filters)

  return (
    <section aria-label="Tea stock" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-brand-100">On the shelf</h2>
        <Button
          variant={adding ? 'ghost' : 'primary'}
          testId="toggle-add-tin"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Cancel' : 'Add a tin'}
        </Button>
      </div>

      {adding && (
        <Panel ariaLabel="Add a tin">
          <AddTinForm
            key={formKey}
            pending={add.isPending}
            error={add.isError ? describeApiError(add.error) : null}
            onSubmit={handleAdd}
          />
        </Panel>
      )}

      {notice && <FormNote testId="stock-notice">{notice}</FormNote>}

      <Panel ariaLabel="Filter the shelf">
        <TextField
          id="stock-search"
          label="Search the shelf"
          type="search"
          value={draftQuery}
          onChange={setDraftQuery}
          placeholder="sencha, the green one…"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant={filters.lowOnly ? 'primary' : 'secondary'}
            size="lg"
            testId="low-filter"
            ariaPressed={filters.lowOnly}
            onClick={() => commit({ lowOnly: !filters.lowOnly })}
          >
            {/* aria-pressed rather than two labels: the control does not change name when
                it is on, only state, and a screen reader should hear that. */}
            <span aria-hidden="true">{filters.lowOnly ? '✓ ' : ''}</span>
            Running low only
          </Button>
          <p
            role="status"
            aria-live="polite"
            data-testid="stock-count"
            className="text-sm text-neutral-600 dark:text-neutral-400"
          >
            {stock.isPending ? 'Counting…' : pluralise(stock.data?.total ?? 0, 'tin')}
          </p>
        </div>
      </Panel>

      {stock.isError && <ErrorNote testId="stock-error">{describeApiError(stock.error)}</ErrorNote>}

      {stock.isPending && (
        <div role="status" aria-live="polite" data-testid="stock-loading" className="space-y-3">
          <span className="sr-only">Loading the shelf…</span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {!stock.isPending &&
        !stock.isError &&
        items.length === 0 &&
        (filtered ? (
          <EmptyState title="Nothing matches that" testId="stock-no-results">
            <p>
              {filters.lowOnly
                ? 'Nothing is running low — which is the answer you wanted.'
                : 'No tin on the shelf has that name.'}
            </p>
            <Button testId="clear-stock-filters" onClick={() => setSearchParams(new URLSearchParams())}>
              Show everything
            </Button>
          </EmptyState>
        ) : (
          <EmptyState title="The shelf is empty" testId="stock-empty">
            <p>Add the first tin and everyone in the household will see what is left of it.</p>
          </EmptyState>
        ))}

      {items.length > 0 && (
        <ul
          data-testid="stock-list"
          className={`space-y-3 ${stock.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {items.map((item) => (
            <StockTinCard
              key={item.id}
              householdId={householdId}
              item={item}
              error={tinError?.id === item.id ? tinError.message : undefined}
              onBrew={(grams) => handleBrew(item.id, grams)}
              onDismissError={() => setTinError(null)}
            />
          ))}
        </ul>
      )}

      <Pagination
        page={stock.data?.page ?? 1}
        pages={stock.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </section>
  )
}

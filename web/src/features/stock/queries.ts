import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type {
  HouseholdConsumption,
  HouseholdEvent,
  StockAdjustInput,
  StockEventInput,
  StockItem,
  StockItemDetail,
  StockItemInput,
  StockItemPatch,
  StockListParams,
} from '../../lib/household'
import { toQuery } from '../../lib/query-string'
import { householdKeys } from '../household/queries'

/**
 * Every key is scoped by household id before anything else, which is what makes the
 * invalidations in this file cheap and precise:
 *
 *   ['stock', id]                    everything about one household's shelf
 *   ['stock', id, 'list']            every search/filter/page combination of its list
 *   ['stock', id, 'list', params]    one of them
 *   ['stock', id, 'item', itemId]    one tin
 *
 * The point of the `'list'` segment sitting *above* the params is that one
 * `invalidateQueries({ queryKey: stockKeys.lists(id) })` covers all of them — a brew from
 * the unfiltered list also refreshes the "running low" view somebody else has open.
 */
export const stockKeys = {
  all: ['stock'] as const,
  household: (householdId: string) => ['stock', householdId] as const,
  lists: (householdId: string) => ['stock', householdId, 'list'] as const,
  list: (householdId: string, params: StockListParams) =>
    ['stock', householdId, 'list', params] as const,
  items: (householdId: string) => ['stock', householdId, 'item'] as const,
  item: (householdId: string, itemId: string) =>
    ['stock', householdId, 'item', itemId] as const,
  //   ['stock', id, 'consumption']    what the shelf gets through
  //
  // Under the same household prefix as everything else, which is what makes it fall out
  // of the existing invalidations for free: recording a brew already invalidates
  // `stockKeys.household(id)`, and the summary is downstream of exactly the events that
  // call does.
  consumption: (householdId: string) => ['stock', householdId, 'consumption'] as const,
  activity: (householdId: string) => ['stock', householdId, 'activity'] as const,
}

const stockPath = (householdId: string, suffix = '') =>
  `/households/${encodeURIComponent(householdId)}/stock${suffix}`

export const fetchStock = (householdId: string, params: StockListParams) =>
  api<Page<StockItem>>(stockPath(householdId) + toQuery({ ...params }))

export const fetchStockItem = (householdId: string, itemId: string) =>
  api<StockItemDetail>(stockPath(householdId, `/${encodeURIComponent(itemId)}`))

export function useStockList(householdId: string, params: StockListParams) {
  return useQuery({
    queryKey: stockKeys.list(householdId, params),
    queryFn: () => fetchStock(householdId, params),
    enabled: householdId !== '',
    // The shelf stays on screen, dimmed, while a search or a page change lands. Tins
    // vanishing into skeletons on every keystroke is the thing this avoids.
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export const fetchConsumption = (householdId: string) =>
  api<HouseholdConsumption>(
    `/households/${encodeURIComponent(householdId)}/consumption`,
  )

/** What the shelf gets through, who drinks it, and what runs out next. A separate
 *  request from the stock list because it is a different question about the same rows —
 *  and because the list is paginated while this is an aggregate over all of them. */
export function useConsumption(householdId: string) {
  return useQuery({
    queryKey: stockKeys.consumption(householdId),
    queryFn: () => fetchConsumption(householdId),
    enabled: householdId !== '',
    retry: false,
  })
}

export const fetchActivity = (householdId: string, params: { page: number; size: number }) =>
  api<Page<HouseholdEvent>>(
    `/households/${encodeURIComponent(householdId)}/stock/activity` + toQuery({ ...params }),
  )

/** The shelf's own timeline. Under the same household key prefix as the rest, so
 *  recording a brew — which already invalidates `stockKeys.household(id)` — refreshes it
 *  without this file knowing anything about the mutation. */
export function useHouseholdActivity(
  householdId: string,
  params: { page: number; size: number },
) {
  return useQuery({
    queryKey: [...stockKeys.activity(householdId), params],
    queryFn: () => fetchActivity(householdId, params),
    enabled: householdId !== '',
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useStockItem(householdId: string, itemId: string) {
  return useQuery({
    queryKey: stockKeys.item(householdId, itemId),
    queryFn: () => fetchStockItem(householdId, itemId),
    enabled: householdId !== '' && itemId !== '',
    retry: false,
  })
}

/* ------------------------------------------------------------- cache bookkeeping */

/** The summary fields, lifted off a detail response. Cheaper and more honest than
 *  writing a whole `StockItemDetail` into a list cache that is typed for summaries. */
function toSummary(detail: StockItemDetail): StockItem {
  return {
    id: detail.id,
    tea: detail.tea,
    quantity_grams: detail.quantity_grams,
    low_stock_grams: detail.low_stock_grams,
    is_low: detail.is_low,
    location: detail.location,
    opened_at: detail.opened_at,
    best_before: detail.best_before,
    updated_at: detail.updated_at,
    // M6. Easy to forget, and forgetting it means a tin bought at a shop loses its shop
    // the moment a PATCH writes the detail response back into the list cache — until the
    // next refetch puts it back, which looks exactly like a flicker nobody can reproduce.
    shop: detail.shop,
  }
}

/**
 * A guess at `is_low`, and only ever a guess — the server owns that flag and its answer
 * overwrites this one the moment it arrives. `<=` is the reading that makes "low at 10 g"
 * true when there are exactly 10 g left, which is what somebody setting the threshold
 * means. If the API turns out to use `<`, this is the one line to change.
 */
function withQuantity<T extends StockItem>(item: T, quantity: number): T {
  // Rounded because 12.3 - 2 in binary floating point is not 10.3, and a tin reading
  // "10.299999999999999 g" for 200 ms is a bug people report.
  const grams = Math.max(0, Math.round(quantity * 10) / 10)
  return { ...item, quantity_grams: grams, is_low: grams <= item.low_stock_grams }
}

/** Walks every cached list for this household plus the tin's own detail, so an
 *  optimistic change lands wherever the tin is currently on screen. */
function shiftCachedQuantity(
  client: QueryClient,
  householdId: string,
  itemId: string,
  next: (grams: number) => number,
) {
  client.setQueriesData<Page<StockItem>>({ queryKey: stockKeys.lists(householdId) }, (page) => {
    if (!page || !page.items.some((item) => item.id === itemId)) return page
    return {
      ...page,
      items: page.items.map((item) =>
        item.id === itemId ? withQuantity(item, next(item.quantity_grams)) : item,
      ),
    }
  })
  client.setQueryData<StockItemDetail>(stockKeys.item(householdId, itemId), (item) =>
    item ? withQuantity(item, next(item.quantity_grams)) : item,
  )
}

/** The authoritative version of the same walk, run on a successful response. */
function syncCachedItem(client: QueryClient, householdId: string, detail: StockItemDetail) {
  const summary = toSummary(detail)
  client.setQueriesData<Page<StockItem>>({ queryKey: stockKeys.lists(householdId) }, (page) => {
    if (!page || !page.items.some((item) => item.id === detail.id)) return page
    return { ...page, items: page.items.map((item) => (item.id === detail.id ? summary : item)) }
  })
  client.setQueryData(stockKeys.item(householdId, detail.id), detail)
}

/**
 * A tin's contents moving changes two things a screen away from each other: the shelf,
 * and the household's own `low_stock_count` on the /households cards. Invalidating only
 * the first is how "3 running low" sits there stale after you have restocked all three.
 */
function useInvalidateStock(householdId: string) {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: stockKeys.household(householdId) })
    void client.invalidateQueries({ queryKey: householdKeys.detail(householdId) })
    void client.invalidateQueries({ queryKey: householdKeys.list })
  }
}

/* ------------------------------------------------------------------- mutations */

export function useAddStockItem(householdId: string) {
  const invalidate = useInvalidateStock(householdId)
  return useMutation({
    mutationFn: (input: StockItemInput) =>
      api<StockItemDetail>(stockPath(householdId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export function useUpdateStockItem(householdId: string, itemId: string) {
  const invalidate = useInvalidateStock(householdId)
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: StockItemPatch) =>
      api<StockItemDetail>(stockPath(householdId, `/${encodeURIComponent(itemId)}`), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (detail) => {
      syncCachedItem(client, householdId, detail)
      invalidate()
    },
  })
}

export function useDeleteStockItem(householdId: string) {
  const invalidate = useInvalidateStock(householdId)
  const client = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) =>
      api<void>(stockPath(householdId, `/${encodeURIComponent(itemId)}`), { method: 'DELETE' }),
    onSuccess: (_result, itemId) => {
      client.removeQueries({ queryKey: stockKeys.item(householdId, itemId) })
      invalidate()
    },
  })
}

export type StockEventVars = { itemId: string; input: StockEventInput }

type Snapshot = { snapshot: [QueryKey, unknown][] }

/**
 * The daily flow: one tap on "5 g" and the tin reads 5 g lighter before the request has
 * left the building. That immediacy is the whole feature, so the update is optimistic
 * and the rollback has to be exact.
 *
 * The snapshot is every cached query under this household rather than one key, because a
 * brew tapped from a filtered list also has to be undone in the unfiltered one, and in
 * the tin's own detail page if it happens to be cached.
 *
 * The failure this exists for is real and routine: brewing 8 g out of a tin with 3 g in
 * it. The server answers 409 with a sentence naming what is actually left, the caller
 * shows it against that tin, and the number goes back to where it was.
 */
export function useStockEvent(householdId: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateStock(householdId)

  return useMutation<StockItemDetail, Error, StockEventVars, Snapshot>({
    mutationFn: ({ itemId, input }) =>
      api<StockItemDetail>(stockPath(householdId, `/${encodeURIComponent(itemId)}/events`), {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onMutate: async ({ itemId, input }) => {
      // An in-flight refetch that resolves after the optimistic write would clobber it
      // with the pre-brew number, which looks exactly like the tap not registering.
      await client.cancelQueries({ queryKey: stockKeys.household(householdId) })
      const snapshot = client.getQueriesData({ queryKey: stockKeys.household(householdId) })
      // `grams` is a magnitude on the wire; the sign is the kind's business. Mirroring
      // the server's rule here is what keeps the optimistic number honest.
      const delta = input.kind === 'purchase' ? input.grams : -input.grams
      shiftCachedQuantity(client, householdId, itemId, (grams) => grams + delta)
      return { snapshot }
    },

    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data)
    },

    onSuccess: (detail) => syncCachedItem(client, householdId, detail),

    // Both paths: after a rollback the cache is a guess about what the server thinks, and
    // after a success the household's low-stock count has moved.
    onSettled: invalidate,
  })
}

/** "I actually have 42 g." Absolute rather than a delta, and not optimistic — a recount
 *  is a considered action typed into a form, not a tap, so waiting for the answer costs
 *  nothing and guessing at the resulting `adjust` event would gain nothing. */
export function useStockAdjust(householdId: string, itemId: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateStock(householdId)
  return useMutation({
    mutationFn: (input: StockAdjustInput) =>
      api<StockItemDetail>(stockPath(householdId, `/${encodeURIComponent(itemId)}/adjust`), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (detail) => {
      syncCachedItem(client, householdId, detail)
      invalidate()
    },
  })
}

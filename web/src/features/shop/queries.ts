import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { StockItemDetail } from '../../lib/household'
import { toQuery } from '../../lib/query-string'
import type {
  AdminShopListParams,
  BuyInput,
  Listing,
  ListingInput,
  ListingListParams,
  ListingPatch,
  ListingWithShop,
  ShopDetail,
  ShopInput,
  ShopListParams,
  ShopPatch,
  ShopSummary,
} from '../../lib/shop'
import { useViewer } from '../auth/viewer'
import { householdKeys } from '../household/queries'
import { stockKeys } from '../stock/queries'

/**
 * Query keys as data rather than string literals in components, the same discipline as
 * `catalog/queries.ts` — and here it earns more, because a purchase reaches across three
 * features' caches at once.
 *
 *   ['shops']                             everything
 *   ['shops', 'list']                     every filter and page of the public browse
 *   ['shops', 'list', params]             one of them
 *   ['shops', 'detail', slug]             one shop
 *   ['shops', 'listings', slug]           every page of one shop's listings
 *   ['shops', 'listings', slug, params]   one of them
 *   ['shops', 'tea', slug]                every page of "where to buy this tea"
 *   ['shops', 'admin']                    the approval queue, all pages
 *
 * The plural prefixes sit *above* the parameters so a single invalidation covers every
 * filter combination at once. Approving a shop cannot know which searches somebody has
 * cached, and should not have to.
 */
export const shopKeys = {
  all: ['shops'] as const,
  lists: ['shops', 'list'] as const,
  list: (params: ShopListParams) => ['shops', 'list', params] as const,
  details: ['shops', 'detail'] as const,
  detail: (slug: string) => ['shops', 'detail', slug] as const,
  listings: (slug: string) => ['shops', 'listings', slug] as const,
  listingPage: (slug: string, params: ListingListParams) =>
    ['shops', 'listings', slug, params] as const,
  /** Keyed by the *tea's* slug, not the shop's: this is the panel on a tea page. */
  teaShops: (teaSlug: string) => ['shops', 'tea', teaSlug] as const,
  teaShopPage: (teaSlug: string, params: ListingListParams) =>
    ['shops', 'tea', teaSlug, params] as const,
  adminLists: ['shops', 'admin'] as const,
  adminList: (params: AdminShopListParams) => ['shops', 'admin', params] as const,
}

const shopPath = (slug: string, suffix = '') => `/shops/${encodeURIComponent(slug)}${suffix}`

/* --------------------------------------------------------------------- fetchers */

export const fetchShops = (params: ShopListParams) =>
  api<Page<ShopSummary>>(`/shops${toQuery(params)}`)

export const fetchShop = (slug: string) => api<ShopDetail>(shopPath(slug))

export const fetchShopListings = (slug: string, params: ListingListParams) =>
  api<Page<Listing>>(shopPath(slug, '/listings') + toQuery({ ...params }))

export const fetchTeaShops = (teaSlug: string, params: ListingListParams) =>
  api<Page<ListingWithShop>>(
    `/catalog/teas/${encodeURIComponent(teaSlug)}/shops${toQuery({ ...params })}`,
  )

export const fetchAdminShops = (params: AdminShopListParams) =>
  api<Page<ShopSummary>>(`/admin/shops${toQuery(params)}`)

/* --------------------------------------------------------------- public reading */

/**
 * Browsing shops is public, exactly as browsing teas is — and that is precisely why both
 * halves of `useViewer` are here.
 *
 * These pages render and fetch on a cold load *before* AuthProvider's silent refresh has
 * answered, so `authReady` gates the request and the viewer segment scopes the cache.
 * Skipping either caches the anonymous answer under a key a signed-in visitor then reads.
 * The response varies by viewer today only in what the page does with it, and will vary
 * in the body the moment a shop grows a "you bought here" marker — a cache keyed to
 * survive that is one less thing to remember later. See `auth/viewer.ts`.
 */
export function useShopList(params: ShopListParams) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...shopKeys.list(params), viewer],
    queryFn: () => fetchShops(params),
    // The grid stays on screen, dimmed, through a keystroke or a page change rather than
    // collapsing into skeletons each time.
    placeholderData: keepPreviousData,
    enabled: authReady,
  })
}

export function useShopDetail(slug: string) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...shopKeys.detail(slug), viewer],
    queryFn: () => fetchShop(slug),
    enabled: slug !== '' && authReady,
  })
}

export function useShopListings(slug: string, params: ListingListParams) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...shopKeys.listingPage(slug, params), viewer],
    queryFn: () => fetchShopListings(slug, params),
    placeholderData: keepPreviousData,
    enabled: slug !== '' && authReady,
  })
}

/** "Where to buy this tea", for the panel on the tea detail page. */
export function useTeaShops(teaSlug: string, params: ListingListParams) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...shopKeys.teaShopPage(teaSlug, params), viewer],
    queryFn: () => fetchTeaShops(teaSlug, params),
    placeholderData: keepPreviousData,
    enabled: teaSlug !== '' && authReady,
  })
}

/* -------------------------------------------------------------------- suggesting */

/**
 * A signed-in visitor suggesting a shop. It comes back `is_approved: false`, so nothing
 * this person can currently see changes — no invalidation. The queue it lands in belongs
 * to the admin screens, whose queries they are not allowed to run anyway.
 */
export function useSuggestShop() {
  return useMutation({
    mutationFn: (input: ShopInput) =>
      api<ShopDetail>('/shops', { method: 'POST', body: JSON.stringify(input) }),
  })
}

/* -------------------------------------------------------------------- buying */

/**
 * The centre of M6: a tin lands on a shelf, tagged with where it came from.
 *
 * The server either creates a tin or tops up the household's existing tin of that tea,
 * and only it knows which — so nothing here is optimistic. The response is the tin
 * either way, and writing it straight into its own cache entry means the "view the tin"
 * link in the confirmation lands on a page that is already populated.
 *
 * Three caches move, and missing any one of them is a visible staleness:
 *
 *  - the household's **stock**, because there is a new tin on it (or an old one heavier);
 *  - the household's **summary**, because `stock_item_count` and `low_stock_count` are
 *    printed on the /households cards and in the detail header, one screen away;
 *  - the **tin** itself, seeded above and then invalidated so the server's own
 *    `recent_events` — which now include this purchase — replace what we wrote.
 *
 * `stockKeys.household(id)` covers every cached list *and* every cached tin under that
 * household in one call, which is why the shelf's own filters do not have to be
 * enumerated here.
 */
export function useBuyListing() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      shopSlug,
      listingId,
      input,
    }: {
      shopSlug: string
      listingId: string
      input: BuyInput
    }) =>
      api<StockItemDetail>(
        shopPath(shopSlug, `/listings/${encodeURIComponent(listingId)}/buy`),
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: (tin, { input }) => {
      client.setQueryData(stockKeys.item(input.household_id, tin.id), tin)
      void client.invalidateQueries({ queryKey: stockKeys.household(input.household_id) })
      void client.invalidateQueries({ queryKey: householdKeys.detail(input.household_id) })
      void client.invalidateQueries({ queryKey: householdKeys.list })
    },
  })
}

/* ---------------------------------------------------------------------- admin */

export function useAdminShopList(params: AdminShopListParams) {
  return useQuery({
    queryKey: shopKeys.adminList(params),
    queryFn: () => fetchAdminShops(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * Anything that changes a shop can change four things at once: the queue it came from,
 * the public browse it may now appear in, any detail page cached for it, and every
 * "where to buy" row on a tea page — a shop's name and city are printed on those, so
 * renaming one leaves them lying until they are refetched.
 *
 * `shopKeys.all` is the single prefix that spans all four, and because the parameters
 * and the viewer segment both sit *below* it, one call covers every cached filter
 * combination for every visitor. The listing mutations share it rather than defining a
 * narrower one of their own: adding a listing changes what a shop carries *and* what a
 * tea can be bought from, which is the same four things again.
 */
function useInvalidateShops() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: shopKeys.all })
  }
}

export function useCreateShop() {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (input: ShopInput) =>
      api<ShopDetail>('/admin/shops', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateShop() {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ShopPatch }) =>
      api<ShopDetail>(`/admin/shops/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  })
}

/**
 * "Find from address" — the server looks the shop's address up and stores the pin.
 *
 * It takes no body, which is the important thing about it: it geocodes the address the
 * shop *has*, not the one currently in the admin's unsaved form. The button says so.
 *
 * The response is the whole updated shop, so the caller moves its own pin from it rather
 * than waiting for a refetch. The invalidation is still needed for everything else that
 * prints this shop — the browse map most of all, where a shop that had no pin a moment
 * ago now has one.
 */
export function useGeocodeShop() {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (shopId: string) =>
      api<ShopDetail>(`/admin/shops/${encodeURIComponent(shopId)}/geocode`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useApproveShop() {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (id: string) =>
      api<ShopDetail>(`/admin/shops/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useDeleteShop() {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/shops/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useCreateListing(shopId: string) {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (input: ListingInput) =>
      api<Listing>(`/admin/shops/${encodeURIComponent(shopId)}/listings`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export function useUpdateListing(shopId: string) {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: ({ listingId, patch }: { listingId: string; patch: ListingPatch }) =>
      api<Listing>(
        `/admin/shops/${encodeURIComponent(shopId)}/listings/${encodeURIComponent(listingId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteListing(shopId: string) {
  const invalidate = useInvalidateShops()
  return useMutation({
    mutationFn: (listingId: string) =>
      api<void>(
        `/admin/shops/${encodeURIComponent(shopId)}/listings/${encodeURIComponent(listingId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  })
}

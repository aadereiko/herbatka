import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Page, TeaSummary } from '../../lib/catalog'
import type { FavouriteKind, FavouriteListParams } from '../../lib/favourite'
import type { ShopSummary } from '../../lib/shop'
import { toQuery } from '../../lib/query-string'
import { useViewer } from '../auth/viewer'
import { catalogKeys } from '../catalog/queries'
import { shopKeys } from '../shop/queries'

/**
 * Query keys as data, the same discipline as everywhere else:
 *
 *   ['favourites']                          everything
 *   ['favourites', 'teas']                  every page of your starred teas
 *   ['favourites', 'teas', params, viewer]  one of them
 *   ['favourites', 'shops']                 every page of your starred shops
 *
 * The viewer segment goes last, below the prefixes, so one invalidation still covers
 * every page — and so signing out and back in as somebody else cannot read the previous
 * person's list out of the cache.
 */
export const favouriteKeys = {
  all: ['favourites'] as const,
  teaLists: ['favourites', 'teas'] as const,
  teaList: (params: FavouriteListParams) => ['favourites', 'teas', params] as const,
  shopLists: ['favourites', 'shops'] as const,
  shopList: (params: FavouriteListParams) => ['favourites', 'shops', params] as const,
}

const favouritePath = (kind: FavouriteKind, slug: string) =>
  kind === 'tea'
    ? `/catalog/teas/${encodeURIComponent(slug)}/favourite`
    : `/shops/${encodeURIComponent(slug)}/favourite`

export const fetchFavouriteTeas = (params: FavouriteListParams) =>
  api<Page<TeaSummary>>(`/favourites/teas${toQuery(params)}`)

export const fetchFavouriteShops = (params: FavouriteListParams) =>
  api<Page<ShopSummary>>(`/favourites/shops${toQuery(params)}`)

/**
 * Both lists sit behind `RequireAuth`, so there is no `authReady` on either: that guard
 * renders nothing at all while the silent refresh is in flight, so by the time these
 * hooks exist the refresh has already answered. The viewer segment still earns its place
 * in the key — see `auth/viewer.ts`.
 */
export function useFavouriteTeas(params: FavouriteListParams) {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...favouriteKeys.teaList(params), viewer],
    queryFn: () => fetchFavouriteTeas(params),
    placeholderData: keepPreviousData,
  })
}

export function useFavouriteShops(params: FavouriteListParams) {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...favouriteKeys.shopList(params), viewer],
    queryFn: () => fetchFavouriteShops(params),
    placeholderData: keepPreviousData,
  })
}

/* ----------------------------------------------------------- the optimistic toggle */

/** The shape every starrable thing shares, from this file's point of view. */
type Starred = { slug: string; is_favourite: boolean }

/** A cache entry holding one thing: a tea's detail, a shop's detail. */
function patchEntity<T extends Starred>(
  client: QueryClient,
  key: QueryKey,
  slug: string,
  next: boolean,
) {
  client.setQueriesData<T>({ queryKey: key }, (entity) =>
    entity && entity.slug === slug ? { ...entity, is_favourite: next } : entity,
  )
}

/** A cache entry holding a page of them. Untouched — same object, no re-render — when
 *  this page does not contain the thing that was starred. */
function patchPage<T extends Starred>(
  client: QueryClient,
  key: QueryKey,
  slug: string,
  next: boolean,
) {
  client.setQueriesData<Page<T>>({ queryKey: key }, (page) => {
    if (!page || !page.items.some((item) => item.slug === slug)) return page
    return {
      ...page,
      items: page.items.map((item) => (item.slug === slug ? { ...item, is_favourite: next } : item)),
    }
  })
}

/**
 * Every cache the flag is printed from, for one kind.
 *
 * The prefixes matter more than the list does: `['catalog', 'tea']` and
 * `['catalog', 'teas']` are different keys, not one nested under the other, so a detail
 * page and a browse grid have to be named separately — and both sit *above* their params
 * and their viewer segment, so one entry here covers every filter, page and reader that
 * happens to be cached.
 */
function scopesFor(kind: FavouriteKind): QueryKey[] {
  return kind === 'tea'
    ? [catalogKeys.teaDetails, catalogKeys.teaLists, favouriteKeys.teaLists]
    : [shopKeys.details, shopKeys.lists, favouriteKeys.shopLists]
}

function writeFavourite(
  client: QueryClient,
  kind: FavouriteKind,
  slug: string,
  next: boolean,
) {
  if (kind === 'tea') {
    patchEntity<TeaSummary>(client, catalogKeys.teaDetails, slug, next)
    patchPage<TeaSummary>(client, catalogKeys.teaLists, slug, next)
    patchPage<TeaSummary>(client, favouriteKeys.teaLists, slug, next)
    return
  }
  patchEntity<ShopSummary>(client, shopKeys.details, slug, next)
  patchPage<ShopSummary>(client, shopKeys.lists, slug, next)
  patchPage<ShopSummary>(client, favouriteKeys.shopLists, slug, next)
}

export type ToggleFavouriteVars = { slug: string; next: boolean }

type Snapshot = { snapshot: [QueryKey, unknown][] }

/**
 * Starring something, and unstarring it: one mutation, because the only difference on the
 * wire is PUT versus DELETE and the only difference on screen is which way the star was
 * pointing when you pressed it.
 *
 * Optimistic, unlike the review upsert, and for the opposite reason to it. A rating is
 * typed into a form and submitted once; a star is a single tap in the middle of a grid,
 * and a star that waits 200 ms before filling in reads as a tap that missed. There is
 * also nothing to guess at here — no average to recompute, just a boolean the caller
 * already knows the new value of.
 *
 * **The rollback is the load-bearing half, and it is why nothing is invalidated on the
 * error path.** After a failed toggle the snapshot *is* the truth: the server rejected
 * the change, so what was on screen before the tap is still what it thinks. Refetching
 * there would ask the same question that has just failed to answer, and — worse — would
 * mask a missing rollback behind a request that happens to return the right value
 * anyway. Success invalidates the two favourites lists instead, because their
 * *membership* has genuinely changed, which no amount of patching a boolean can express.
 */
export function useToggleFavourite(kind: FavouriteKind) {
  const client = useQueryClient()

  return useMutation<void, Error, ToggleFavouriteVars, Snapshot>({
    mutationFn: ({ slug, next }) =>
      api<void>(favouritePath(kind, slug), { method: next ? 'PUT' : 'DELETE' }),

    onMutate: async ({ slug, next }) => {
      const scopes = scopesFor(kind)
      // An in-flight refetch that lands after the optimistic write would clobber it with
      // the pre-tap value, which looks exactly like the star not registering.
      await Promise.all(scopes.map((queryKey) => client.cancelQueries({ queryKey })))
      const snapshot = scopes.flatMap((queryKey) => client.getQueriesData({ queryKey }))
      writeFavourite(client, kind, slug, next)
      return { snapshot }
    },

    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data)
    },

    onSuccess: () => {
      void client.invalidateQueries({ queryKey: favouriteKeys.all })
    },
  })
}

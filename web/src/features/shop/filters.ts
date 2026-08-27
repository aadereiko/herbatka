import type { ShopListParams } from '../../lib/shop'

/**
 * The shop-browse filters, and the two functions that move them in and out of the query
 * string — the same shape as `catalog/filters.ts`, for the same reasons.
 *
 * The URL is the state. No `useState` mirror of it exists anywhere, which is what makes
 * "every shop in Kraków" a link somebody can send, survive a reload and answer the back
 * button. Every function here is therefore total: a hand-edited `?page=-3` has to render
 * a page rather than throw.
 *
 * Unlike teas, city and country are free text rather than a closed vocabulary, so there
 * is no guard to write — anything the user types is a legitimate filter that simply
 * matches nothing. That is a real answer ("no shops there yet"), not a broken URL.
 */

export const SHOP_PAGE_SIZE = 24

export type ShopFilters = {
  q: string
  city: string
  country: string
  page: number
}

export const NO_SHOP_FILTERS: ShopFilters = { q: '', city: '', country: '', page: 1 }

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function readShopFilters(params: URLSearchParams): ShopFilters {
  return {
    q: params.get('q') ?? '',
    city: params.get('city') ?? '',
    country: params.get('country') ?? '',
    page: readPage(params.get('page')),
  }
}

/** Defaults are omitted rather than written out, so the common case stays a clean
 *  `/shops` instead of `/shops?q=&city=&country=&page=1`. */
export function writeShopFilters(filters: ShopFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.city) params.set('city', filters.city)
  if (filters.country) params.set('country', filters.country)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function shopQueryParams(filters: ShopFilters): ShopListParams {
  return {
    q: filters.q || undefined,
    city: filters.city || undefined,
    country: filters.country || undefined,
    page: filters.page,
    size: SHOP_PAGE_SIZE,
  }
}

/** Which of "no shops exist yet" and "no shops match this" to say. They are different
 *  situations and one sentence for both is a small lie in one of them. */
export function hasShopFilters(filters: ShopFilters): boolean {
  return Boolean(filters.q || filters.city || filters.country)
}

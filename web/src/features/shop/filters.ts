import type { ShopListParams } from '../../lib/shop'
import type { NearPosition } from './nearby'
import { formatNear, parseNear } from './nearby'

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

/**
 * List or map, in the URL like everything else.
 *
 * A union of two string literals rather than an enum: `erasableSyntaxOnly` bans enums,
 * and the value in the address bar has to be the string anyway.
 */
export type ShopView = 'list' | 'map'

export type ShopFilters = {
  q: string
  city: string
  country: string
  view: ShopView
  /**
   * Where the person browsing is. In the URL rather than in state, for the same reason
   * the filters are: "the shops near me, on a map" is a thing somebody sends to a
   * friend standing next to them, and it has to survive a reload.
   *
   * It is *also* kept in `localStorage` — see `nearby.ts` — but the URL is the truth
   * while a page is open. Storage only decides what an address bar with no `near` in it
   * starts as.
   */
  near: NearPosition | null
  page: number
}

export const NO_SHOP_FILTERS: ShopFilters = {
  q: '',
  city: '',
  country: '',
  view: 'list',
  near: null,
  page: 1,
}

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function readShopFilters(params: URLSearchParams): ShopFilters {
  return {
    q: params.get('q') ?? '',
    city: params.get('city') ?? '',
    country: params.get('country') ?? '',
    // Anything that is not exactly "map" is the list. `?view=MAP` and `?view=banana`
    // both render a page rather than an error.
    view: params.get('view') === 'map' ? 'map' : 'list',
    near: parseNear(params.get('near')),
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
  if (filters.view === 'map') params.set('view', 'map')
  if (filters.near) params.set('near', formatNear(filters.near))
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function shopQueryParams(filters: ShopFilters): ShopListParams {
  return {
    q: filters.q || undefined,
    city: filters.city || undefined,
    country: filters.country || undefined,
    // Both or neither, which `near` being one object rather than two numbers makes
    // impossible to get wrong. `view` is not here at all: which way the same page is
    // drawn is nothing the server needs to know, and putting it in the query key would
    // refetch an identical list every time somebody flipped the toggle.
    near_lat: filters.near?.lat,
    near_lng: filters.near?.lng,
    page: filters.page,
    size: SHOP_PAGE_SIZE,
  }
}

/**
 * Which of "no shops exist yet" and "no shops match this" to say. They are different
 * situations and one sentence for both is a small lie in one of them.
 *
 * `view` and `near` are deliberately not filters here. Neither one is something "Clear
 * filters" should undo: flipping to the map and then clearing a city search must not
 * throw you back to the list, and the nearby state has its own dismissal on its own
 * banner — one that also forgets the stored position, which a generic clear would not.
 */
export function hasShopFilters(filters: ShopFilters): boolean {
  return Boolean(filters.q || filters.city || filters.country)
}

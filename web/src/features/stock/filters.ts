import type { StockListParams } from '../../lib/household'

/**
 * The shelf filters, and the two functions that move them in and out of the query
 * string. Same contract as `catalog/filters.ts`: the URL *is* the state, every function
 * is total, and the address-bar names are the human ones rather than the API's.
 *
 * `?low=1` is what somebody sends to a flatmate — "here's what we're out of". The API
 * spells the same thing `low_only=true`, and the translation lives in one function
 * instead of leaking the wire format into every shared link forever.
 */

export const STOCK_PAGE_SIZE = 20

export type StockFilters = {
  q: string
  lowOnly: boolean
  page: number
}

export const NO_STOCK_FILTERS: StockFilters = { q: '', lowOnly: false, page: 1 }

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/** Anything truthy-looking counts as on. A hand-typed `?low=yes` should filter rather
 *  than silently do nothing, and only `low=0`/`low=false` read as an explicit off. */
function readFlag(raw: string | null): boolean {
  if (raw === null) return false
  return raw !== '0' && raw !== 'false'
}

export function readStockFilters(params: URLSearchParams): StockFilters {
  return {
    q: params.get('q') ?? '',
    lowOnly: readFlag(params.get('low')),
    page: readPage(params.get('page')),
  }
}

export function writeStockFilters(filters: StockFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.lowOnly) params.set('low', '1')
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function stockQueryParams(filters: StockFilters): StockListParams {
  return {
    q: filters.q || undefined,
    // `true` or absent, never `false` — see the note on StockListParams.
    low_only: filters.lowOnly ? true : undefined,
    page: filters.page,
    size: STOCK_PAGE_SIZE,
  }
}

export function hasStockFilters(filters: StockFilters): boolean {
  return Boolean(filters.q || filters.lowOnly)
}

import type { IngredientCategory, IngredientListParams, TeaListParams, TeaType } from '../../lib/catalog'
import { isIngredientCategory, isTeaType } from '../../lib/catalog'

/**
 * The browse filters, and the two functions that move them in and out of the query
 * string.
 *
 * The URL is the state — there is no `useState` mirror of it anywhere. That is what
 * makes a filtered view linkable, survive a reload, and answer the back button, and it
 * is why every one of these functions is total: a hand-edited `?type=lapsang` or
 * `?page=-3` has to render a page, not throw.
 *
 * The query-string names are deliberately not the API's. `?type=green` is what a person
 * pastes into Slack; `tea_type=green` is what the API asked for. The two are mapped in
 * one place — `teaQueryParams` — rather than leaking the wire format into the address
 * bar forever.
 */

export const TEA_PAGE_SIZE = 24
export const INGREDIENT_PAGE_SIZE = 30

export type TeaFilters = {
  q: string
  teaType: TeaType | null
  ingredient: string
  brand: string
  page: number
}

export const NO_TEA_FILTERS: TeaFilters = {
  q: '',
  teaType: null,
  ingredient: '',
  brand: '',
  page: 1,
}

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function readTeaFilters(params: URLSearchParams): TeaFilters {
  const type = params.get('type')
  return {
    q: params.get('q') ?? '',
    teaType: isTeaType(type) ? type : null,
    ingredient: params.get('ingredient') ?? '',
    brand: params.get('brand') ?? '',
    page: readPage(params.get('page')),
  }
}

/** Defaults are omitted rather than written out, so the common case stays a clean
 *  `/teas` instead of `/teas?q=&type=&ingredient=&brand=&page=1`. */
export function writeTeaFilters(filters: TeaFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.teaType) params.set('type', filters.teaType)
  if (filters.ingredient) params.set('ingredient', filters.ingredient)
  if (filters.brand) params.set('brand', filters.brand)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function teaQueryParams(filters: TeaFilters): TeaListParams {
  return {
    q: filters.q || undefined,
    tea_type: filters.teaType ?? undefined,
    ingredient: filters.ingredient || undefined,
    brand: filters.brand || undefined,
    page: filters.page,
    size: TEA_PAGE_SIZE,
  }
}

/** Which of "no teas exist yet" and "no teas match this" to say. They are different
 *  situations and a single "Nothing here" for both is a small lie in one of them. */
export function hasTeaFilters(filters: TeaFilters): boolean {
  return Boolean(filters.q || filters.teaType || filters.ingredient || filters.brand)
}

export type IngredientFilters = {
  q: string
  category: IngredientCategory | null
  page: number
}

export const NO_INGREDIENT_FILTERS: IngredientFilters = { q: '', category: null, page: 1 }

export function readIngredientFilters(params: URLSearchParams): IngredientFilters {
  const category = params.get('category')
  return {
    q: params.get('q') ?? '',
    category: isIngredientCategory(category) ? category : null,
    page: readPage(params.get('page')),
  }
}

export function writeIngredientFilters(filters: IngredientFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.category) params.set('category', filters.category)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function ingredientQueryParams(filters: IngredientFilters): IngredientListParams {
  return {
    q: filters.q || undefined,
    category: filters.category ?? undefined,
    page: filters.page,
    size: INGREDIENT_PAGE_SIZE,
  }
}

export function hasIngredientFilters(filters: IngredientFilters): boolean {
  return Boolean(filters.q || filters.category)
}

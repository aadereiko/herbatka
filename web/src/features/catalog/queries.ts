import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type {
  Brand,
  BrandListParams,
  Ingredient,
  IngredientListParams,
  Page,
  TeaDetail,
  TeaInput,
  TeaListParams,
  TeaSummary,
} from '../../lib/catalog'
import { toQuery } from '../../lib/query-string'
import { useAuth } from '../auth/auth-context'

/**
 * Query keys as data rather than string literals sprinkled across components: the admin
 * feature imports these to invalidate the public lists after a write, and a typo in a
 * key is a bug that shows up as "the list did not refresh", which is miserable to chase.
 *
 * The list keys are prefixes of the parameterised ones, so invalidating `teaLists`
 * invalidates every page and filter combination at once.
 */
export const catalogKeys = {
  all: ['catalog'] as const,
  teaLists: ['catalog', 'teas'] as const,
  teaList: (params: TeaListParams) => ['catalog', 'teas', params] as const,
  teaDetails: ['catalog', 'tea'] as const,
  teaDetail: (slug: string) => ['catalog', 'tea', slug] as const,
  ingredientLists: ['catalog', 'ingredients'] as const,
  ingredientList: (params: IngredientListParams) => ['catalog', 'ingredients', params] as const,
  brandLists: ['catalog', 'brands'] as const,
  brandList: (params: BrandListParams) => ['catalog', 'brands', params] as const,
}

/**
 * Tea responses depend on who is asking — `my_score` and `my_review` are the viewer's
 * own. Two things follow, and both are bugs if you skip them:
 *
 *  - The viewer belongs in the query key. Otherwise a signed-out response is cached
 *    under the same key a signed-in visitor reads, and signing out then in as somebody
 *    else shows them the previous person's rating.
 *  - The query must wait for auth to settle. `/teas/:slug` is public, so it renders and
 *    fetches immediately on a cold load — before AuthProvider's silent refresh has
 *    finished — and would cache the anonymous answer for a signed-in user.
 *
 * The viewer segment goes last, so `teaLists` and `teaDetail(slug)` still work as
 * invalidation prefixes.
 */
function useViewer() {
  const { user, isLoading } = useAuth()
  return { viewer: user?.id ?? 'anon', authReady: !isLoading }
}

export const fetchTeas = (params: TeaListParams) =>
  api<Page<TeaSummary>>(`/catalog/teas${toQuery(params)}`)

export const fetchTea = (slug: string) =>
  api<TeaDetail>(`/catalog/teas/${encodeURIComponent(slug)}`)

export const fetchIngredients = (params: IngredientListParams) =>
  api<Page<Ingredient>>(`/catalog/ingredients${toQuery(params)}`)

export const fetchBrands = (params: BrandListParams) =>
  api<Page<Brand>>(`/catalog/brands${toQuery(params)}`)

/**
 * `keepPreviousData` is what stops the grid collapsing into skeletons on every keystroke
 * and page change: the previous page stays on screen, dimmed, until the next one lands.
 * `isPending` is then true only for the genuine first load, which is exactly when a
 * skeleton is the right thing to show.
 */
export function useTeaList(params: TeaListParams) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...catalogKeys.teaList(params), viewer],
    queryFn: () => fetchTeas(params),
    placeholderData: keepPreviousData,
    enabled: authReady,
  })
}

export function useTeaDetail(slug: string) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...catalogKeys.teaDetail(slug), viewer],
    queryFn: () => fetchTea(slug),
    enabled: slug !== '' && authReady,
  })
}

export function useIngredientList(params: IngredientListParams) {
  return useQuery({
    queryKey: catalogKeys.ingredientList(params),
    queryFn: () => fetchIngredients(params),
    placeholderData: keepPreviousData,
  })
}

export function useBrandList(params: BrandListParams) {
  return useQuery({
    queryKey: catalogKeys.brandList(params),
    queryFn: () => fetchBrands(params),
  })
}

/**
 * A signed-in visitor suggesting a tea. It comes back `is_approved: false`, so nothing
 * the suggester can currently see changes — no invalidation. The pending queue it *does*
 * land in belongs to the admin feature, whose queries this user is not allowed to run.
 */
export function useSuggestTea() {
  return useMutation({
    mutationFn: (input: TeaInput) =>
      api<TeaDetail>('/catalog/teas', { method: 'POST', body: JSON.stringify(input) }),
  })
}

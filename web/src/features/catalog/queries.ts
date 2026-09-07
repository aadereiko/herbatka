import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type {
  Brand,
  BrandListParams,
  BrewingInput,
  BrewingNote,
  Ingredient,
  IngredientInput,
  IngredientListParams,
  IngredientTaste,
  Page,
  TeaDetail,
  TeaInput,
  TeaListParams,
  TeaSeries,
  TeaSummary,
} from '../../lib/catalog'
import { toQuery } from '../../lib/query-string'
import { useViewer } from '../auth/viewer'

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
  teaConsumption: (slug: string) => ['catalog', 'tea', slug, 'consumption'] as const,
  ingredientLists: ['catalog', 'ingredients'] as const,
  ingredientList: (params: IngredientListParams) => ['catalog', 'ingredients', params] as const,
  brandLists: ['catalog', 'brands'] as const,
  brandList: (params: BrandListParams) => ['catalog', 'brands', params] as const,
}

/**
 * Tea responses depend on who is asking — `my_score` and `my_review` are the viewer's
 * own — and these pages are public, so they render and fetch on a cold load *before*
 * AuthProvider's silent refresh has answered. Both halves of `useViewer` therefore
 * matter here: the viewer segment in the key, and `authReady` on `enabled`. Skipping
 * either caches the anonymous answer for a signed-in user. See `auth/viewer.ts`.
 */
export const fetchTeas = (params: TeaListParams) =>
  api<Page<TeaSummary>>(`/catalog/teas${toQuery(params)}`)

export const fetchTea = (slug: string) =>
  api<TeaDetail>(`/catalog/teas/${encodeURIComponent(slug)}`)

export const fetchIngredients = (params: IngredientListParams) =>
  api<Page<IngredientTaste>>(`/catalog/ingredients${toQuery(params)}`)

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

/**
 * How much of one tea the viewer's households have been drinking, by week.
 *
 * Keyed by viewer like `useTeaDetail` and for a stronger reason: this response is
 * *entirely* the viewer's own data on a page that is otherwise public, so a cache entry
 * leaking across a sign-out would show one person another's shelves.
 *
 * `enabled` on having a session, not merely on `authReady`. The tea page is public and a
 * signed-out reader would otherwise fire an authenticated request on every visit and get
 * a 401 for their trouble.
 */
/**
 * Propose a word for the shared vocabulary.
 *
 * Invalidates the ingredient lists rather than writing the new row into them by hand: it
 * arrives unapproved and every list is sorted by name, so there is no position a client
 * could put it in that the server would agree with.
 */
export function useSuggestIngredient() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: IngredientInput) =>
      api<Ingredient>('/catalog/ingredients', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: catalogKeys.ingredientLists })
    },
  })
}

export function useTeaConsumption(slug: string) {
  const { viewer, authReady, isSignedIn } = useViewer()
  return useQuery({
    queryKey: [...catalogKeys.teaConsumption(slug), viewer],
    queryFn: () => api<TeaSeries>(`/catalog/teas/${encodeURIComponent(slug)}/consumption`),
    // `isSignedIn`, not a truthiness check on `viewer` — that segment is the string
    // `'anon'` for a signed-out reader, which is deliberately truthy so it can key a
    // cache entry. Guarding on it would fire an authenticated request on every public
    // visit and collect a 401.
    enabled: slug !== '' && authReady && isSignedIn,
    retry: false,
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

/**
 * Viewer-keyed and gated on `authReady`, for the same reason `useTeaList` is: the rows
 * now carry `my_score`, so this is no longer a response that is the same for everybody.
 * /ingredients is a public page, so on a cold load it fetches before AuthProvider's
 * silent refresh has answered — without the viewer in the key, the anonymous answer
 * ("you have rated nothing") gets cached and shown to a signed-in user.
 */
export function useIngredientList(params: IngredientListParams) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...catalogKeys.ingredientList(params), viewer],
    queryFn: () => fetchIngredients(params),
    placeholderData: keepPreviousData,
    enabled: authReady,
  })
}

/**
 * Rating an ingredient touches two things: the ingredient lists, and every tea that
 * contains it — a `TeaDetail` carries `my_score` on each of its ingredients, which is
 * the whole reason anybody would rate one. There is no cheap way to know *which* teas
 * contain it from here, so this invalidates every tea detail. That is one refetch of the
 * page you are looking at, against the alternative of a page that still says you rated
 * clove 2 after you have just changed it to 7.
 */
function useInvalidateIngredientRatings() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: catalogKeys.ingredientLists })
    void client.invalidateQueries({ queryKey: catalogKeys.teaDetails })
  }
}

export function useRateIngredient() {
  const invalidate = useInvalidateIngredientRatings()
  return useMutation({
    mutationFn: ({ slug, score }: { slug: string; score: number }) =>
      api<IngredientTaste>(`/catalog/ingredients/${encodeURIComponent(slug)}/rating`, {
        method: 'PUT',
        body: JSON.stringify({ score }),
      }),
    onSuccess: invalidate,
  })
}

export function useClearIngredientRating() {
  const invalidate = useInvalidateIngredientRatings()
  return useMutation({
    mutationFn: (slug: string) =>
      api<void>(`/catalog/ingredients/${encodeURIComponent(slug)}/rating`, { method: 'DELETE' }),
    onSuccess: invalidate,
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

/* --------------------------------------------------- your own brewing numbers (M8) */

const brewingPath = (slug: string) => `/catalog/teas/${encodeURIComponent(slug)}/brewing`

/**
 * Only the tea's own detail moves. The card in a grid prints a name, a type and a rating
 * and has never printed a brewing spec, so sweeping `teaLists` here would refetch every
 * cached page of the catalog to change nothing on any of them.
 *
 * Not optimistic either, for the same reason the review upsert is not: this is four boxes
 * typed into a form and submitted once, and the round trip costs nothing anybody notices.
 */
function useInvalidateBrewing(slug: string) {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: catalogKeys.teaDetail(slug) })
  }
}

/** Upsert: there is one of these per person per tea, so PUT and there is nothing to
 *  decide — the server creates or replaces and the form is the same either way. */
export function useSetBrewing(slug: string) {
  const invalidate = useInvalidateBrewing(slug)
  return useMutation({
    mutationFn: (input: BrewingInput) =>
      api<BrewingNote>(brewingPath(slug), { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

/** "Go back to the catalog's numbers". A 404 means you had none to remove — after a
 *  delete that raced with another tab, a state the caller should read as done. */
export function useDeleteBrewing(slug: string) {
  const invalidate = useInvalidateBrewing(slug)
  return useMutation({
    mutationFn: () => api<void>(brewingPath(slug), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

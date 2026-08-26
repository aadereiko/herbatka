import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type {
  Brand,
  BrandInput,
  BrandPatch,
  Ingredient,
  IngredientInput,
  IngredientPatch,
  Page,
  TeaDetail,
  TeaInput,
  TeaPatch,
  TeaSummary,
} from '../../lib/catalog'
import { toQuery } from '../../lib/query-string'
import { catalogKeys } from '../catalog/queries'

export type AdminTeaListParams = {
  approved?: boolean
  page?: number
  size?: number
}

export const adminKeys = {
  all: ['admin'] as const,
  teaLists: ['admin', 'teas'] as const,
  teaList: (params: AdminTeaListParams) => ['admin', 'teas', params] as const,
}

export const fetchAdminTeas = (params: AdminTeaListParams) =>
  api<Page<TeaSummary>>(`/admin/teas${toQuery(params)}`)

/** The pending queue. `approved` is a real `false`, not an omitted parameter — see the
 *  note in `toQuery` about why empty values are dropped but `false` is not. */
export function useAdminTeaList(params: AdminTeaListParams) {
  return useQuery({
    queryKey: adminKeys.teaList(params),
    queryFn: () => fetchAdminTeas(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * Anything that changes a tea can change three lists at once: the pending queue it came
 * from, the public catalog it may now appear in, and any detail page cached for it. They
 * are invalidated by prefix, so every cached filter combination is covered.
 */
function useInvalidateTeas() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.teaLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaDetails })
  }
}

export function useCreateTea() {
  const invalidate = useInvalidateTeas()
  return useMutation({
    mutationFn: (input: TeaInput) =>
      api<TeaDetail>('/admin/teas', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateTea() {
  const invalidate = useInvalidateTeas()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TeaPatch }) =>
      api<TeaDetail>(`/admin/teas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  })
}

export function useApproveTea() {
  const invalidate = useInvalidateTeas()
  return useMutation({
    mutationFn: (id: string) => api<TeaDetail>(`/admin/teas/${id}/approve`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useDeleteTea() {
  const invalidate = useInvalidateTeas()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/teas/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/** A renamed or deleted ingredient changes the `primary_ingredients` strings carried on
 *  every tea summary, so the tea lists go stale too. */
function useInvalidateIngredients() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.ingredientLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaDetails })
  }
}

export function useCreateIngredient() {
  const invalidate = useInvalidateIngredients()
  return useMutation({
    mutationFn: (input: IngredientInput) =>
      api<Ingredient>('/admin/ingredients', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateIngredient() {
  const invalidate = useInvalidateIngredients()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IngredientPatch }) =>
      api<Ingredient>(`/admin/ingredients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  })
}

/**
 * Deleting an ingredient can legitimately fail with a 409 when a tea still uses it. That
 * is not an error to swallow into a toast: the caller renders the server's own sentence
 * next to the row, because "used by 3 teas" is the only useful thing to say.
 */
export function useDeleteIngredient() {
  const invalidate = useInvalidateIngredients()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/ingredients/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

function useInvalidateBrands() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.brandLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaLists })
    void queryClient.invalidateQueries({ queryKey: catalogKeys.teaDetails })
  }
}

export function useCreateBrand() {
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: (input: BrandInput) =>
      api<Brand>('/admin/brands', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateBrand() {
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BrandPatch }) =>
      api<Brand>(`/admin/brands/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  })
}

export function useDeleteBrand() {
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/brands/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

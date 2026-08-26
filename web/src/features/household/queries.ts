import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type {
  HouseholdDetail,
  HouseholdInput,
  HouseholdPatch,
  HouseholdSummary,
  Invite,
  InviteInput,
  JoinInput,
} from '../../lib/household'

/**
 * Query keys as data, same as `catalog/queries.ts` — the stock feature imports these to
 * invalidate a household's summary after an event, because a brew that empties a tin
 * changes `low_stock_count` on a card two screens away.
 *
 * `details` is a prefix of `detail(id)`, so a write that could touch any household (say,
 * joining one) can invalidate the lot without knowing which.
 */
export const householdKeys = {
  all: ['households'] as const,
  list: ['households', 'list'] as const,
  details: ['households', 'detail'] as const,
  detail: (id: string) => ['households', 'detail', id] as const,
  invites: (id: string) => ['households', 'invites', id] as const,
}

export const fetchHouseholds = () => api<HouseholdSummary[]>('/households')

export const fetchHousehold = (id: string) =>
  api<HouseholdDetail>(`/households/${encodeURIComponent(id)}`)

export const fetchInvites = (id: string) =>
  api<Invite[]>(`/households/${encodeURIComponent(id)}/invites`)

/** Not paginated, and not a `Page<T>`: you belong to a handful of households, not a
 *  hundred, so the envelope would be ceremony around a list of three. */
export function useHouseholdList() {
  return useQuery({
    queryKey: householdKeys.list,
    queryFn: fetchHouseholds,
  })
}

export function useHousehold(id: string) {
  return useQuery({
    queryKey: householdKeys.detail(id),
    queryFn: () => fetchHousehold(id),
    enabled: id !== '',
    // A 404 here means "no such household, or not yours" — the API deliberately does not
    // distinguish them. Retrying cannot change either answer.
    retry: false,
  })
}

/** Owner-only on the server. `enabled` keeps a member's browser from asking at all: a
 *  403-shaped error rendered in a panel nobody should see is worse than no panel. */
export function useInvites(id: string, enabled: boolean) {
  return useQuery({
    queryKey: householdKeys.invites(id),
    queryFn: () => fetchInvites(id),
    enabled: enabled && id !== '',
  })
}

/** Anything that changes membership or naming can move the cards on /households as well
 *  as the page you are standing on. */
function useInvalidateHouseholds() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: householdKeys.list })
    void queryClient.invalidateQueries({ queryKey: householdKeys.details })
  }
}

export function useCreateHousehold() {
  const invalidate = useInvalidateHouseholds()
  return useMutation({
    mutationFn: (input: HouseholdInput) =>
      api<HouseholdDetail>('/households', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useRenameHousehold(id: string) {
  const invalidate = useInvalidateHouseholds()
  return useMutation({
    mutationFn: (patch: HouseholdPatch) =>
      api<HouseholdDetail>(`/households/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteHousehold(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(`/households/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Dropped rather than invalidated: refetching a household that no longer exists
      // would answer 404 and paint a "not found" page over the redirect.
      queryClient.removeQueries({ queryKey: householdKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: householdKeys.list })
    },
  })
}

/**
 * One endpoint for two situations: an owner removing somebody, and you leaving. The
 * server tells them apart from the `user_id`, and refuses the second with a 409 when you
 * are the last owner — a household with nobody who can invite is a dead end.
 */
export function useRemoveMember(id: string) {
  const invalidate = useInvalidateHouseholds()
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/households/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  })
}

export function useJoinHousehold() {
  const invalidate = useInvalidateHouseholds()
  return useMutation({
    mutationFn: (input: JoinInput) =>
      api<HouseholdDetail>('/households/join', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

function useInvalidateInvites(id: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: householdKeys.invites(id) })
  }
}

export function useCreateInvite(id: string) {
  const invalidate = useInvalidateInvites(id)
  return useMutation({
    mutationFn: (input: InviteInput) =>
      api<Invite>(`/households/${encodeURIComponent(id)}/invites`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export function useRevokeInvite(id: string) {
  const invalidate = useInvalidateInvites(id)
  return useMutation({
    mutationFn: (inviteId: string) =>
      api<void>(
        `/households/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  })
}

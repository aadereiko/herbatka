import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type {
  FriendInviteInput,
  HouseholdDetail,
  HouseholdInput,
  HouseholdPatch,
  HouseholdSummary,
  Invitation,
  Invite,
  InviteInput,
  JoinInput,
} from '../../lib/household'
import { useViewer } from '../auth/viewer'

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
  /** Invitations addressed to *me*, across every household. Viewer-keyed at the point of
   *  use, like the friends keys, so this stays usable as an invalidation prefix. */
  invitations: ['households', 'invitations'] as const,
}

export const fetchHouseholds = () => api<HouseholdSummary[]>('/households')

export const fetchHousehold = (id: string) =>
  api<HouseholdDetail>(`/households/${encodeURIComponent(id)}`)

export const fetchInvites = (id: string) =>
  api<Invite[]>(`/households/${encodeURIComponent(id)}/invites`)

export const fetchInvitations = () => api<Invitation[]>('/households/invitations')

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

/**
 * Invitations waiting on *you*, the household counterpart of `useFriendRequests`.
 *
 * `isSignedIn`-gated, not `authReady`-gated and not bare, for exactly the reason the
 * friend-request badge is: a household nav badge would read this on every page including
 * the public catalog, and firing an authenticated request for a settled anonymous visitor
 * buys a guaranteed 401. `viewer` goes last in the key so what is waiting on Ada is never
 * served to Grace. The panel and any nav badge share this one query, so one invalidation
 * moves both and opening /households does not refetch what a badge already had.
 */
export function useInvitations() {
  const { viewer, isSignedIn } = useViewer()
  return useQuery({
    queryKey: [...householdKeys.invitations, viewer],
    queryFn: fetchInvitations,
    enabled: isSignedIn,
  })
}

/** The number a nav badge would show: zero while loading and zero signed out, which to the
 *  badge are the same thing. Mirrors `useIncomingRequestCount`. */
export function useIncomingInvitationCount(): number {
  return (useInvitations().data ?? []).length
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

/* --------------------------------------------------- inviting a friend, and being invited */

/**
 * Invite one named friend. The new invite lands in this household's pending list, so that
 * is what is invalidated — the same list the code path refreshes.
 *
 * A friendship read is *not* invalidated: inviting somebody into your household changes
 * nothing about the friendship itself. The mutation carries the whole `FriendInviteInput`
 * (not just an id) so a future expiry control has somewhere to go without changing the
 * hook's shape.
 */
export function useInviteFriend(id: string) {
  const invalidate = useInvalidateInvites(id)
  return useMutation({
    mutationFn: (input: FriendInviteInput) =>
      api<Invite>(`/households/${encodeURIComponent(id)}/invites/friend`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

/** Accepting and declining both empty a row from *my* invitations list; accepting also
 *  adds a household to the cards on /households. So both sweep the invitations query, and
 *  accept additionally invalidates the household lists — mirroring how joining by code
 *  does. */
function useInvalidateInvitations() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: householdKeys.invitations })
  }
}

export function useAcceptInvitation() {
  const invalidateInvitations = useInvalidateInvitations()
  const invalidateHouseholds = useInvalidateHouseholds()
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<HouseholdDetail>(
        `/households/invitations/${encodeURIComponent(invitationId)}/accept`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      invalidateInvitations()
      invalidateHouseholds()
    },
  })
}

/** POST, not DELETE: declining a household invitation *records* a refusal so the owner can
 *  stop waiting — the row is stamped, not removed. Only my own invitations list moves; no
 *  household changed hands. */
export function useDeclineInvitation() {
  const invalidateInvitations = useInvalidateInvitations()
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/households/invitations/${encodeURIComponent(invitationId)}/decline`, {
        method: 'POST',
      }),
    onSuccess: invalidateInvitations,
  })
}

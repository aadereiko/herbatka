import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Friend, FriendRequest, SearchResult } from '../../lib/friend'
import { USER_SEARCH_MIN_LENGTH } from '../../lib/friend'
import type { UserRef } from '../../lib/household'
import { toQuery } from '../../lib/query-string'
import { useViewer } from '../auth/viewer'
import { homeKeys } from '../home/queries'

/**
 * Query keys as data, same as `catalog/queries.ts` and `stock/queries.ts`.
 *
 *   ['friends']                  everything about who you know
 *   ['friends', 'list']          accepted friends
 *   ['friends', 'requests']      open requests, both directions
 *   ['friends', 'blocked']       people you have blocked
 *   ['friends', 'search']        every people-search result set
 *   ['friends', 'search', q]     one of them
 *
 * The viewer id is appended to each key at the point of use rather than baked in here,
 * so these four stay usable as invalidation prefixes. See `auth/viewer.ts` for why the
 * segment exists at all.
 */
export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  requests: ['friends', 'requests'] as const,
  blocked: ['friends', 'blocked'] as const,
  searches: ['friends', 'search'] as const,
  search: (query: string) => ['friends', 'search', query] as const,
}

const friendPath = (userId: string) => `/friends/${encodeURIComponent(userId)}`

const requestPath = (requestId: string) => `/friends/requests/${encodeURIComponent(requestId)}`

export const fetchFriends = () => api<Friend[]>('/friends')

export const fetchFriendRequests = () => api<FriendRequest[]>('/friends/requests')

export const fetchBlocked = () => api<UserRef[]>('/friends/blocked')

export const searchPeople = (query: string) =>
  api<SearchResult[]>(`/users/search${toQuery({ q: query })}`)

/* ------------------------------------------------------------------------ reads */

/** Not paginated and not a `Page<T>`, for the same reason `/households` is not: you have
 *  a friends list, not a friends database, and an envelope around it would be ceremony.
 *  No `enabled` — `/friends` renders only behind `RequireAuth`. */
export function useFriends() {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...friendKeys.list, viewer],
    queryFn: fetchFriends,
  })
}

/**
 * The one read in this feature that is *not* only used behind `RequireAuth`: the nav bar
 * shows the incoming count on every page, including the public catalog. Hence
 * `isSignedIn` rather than nothing and rather than `authReady` — a settled anonymous
 * visitor is exactly the case that would otherwise fire an authenticated request and
 * collect a guaranteed 401 on every page load.
 *
 * The nav and the page share this one query, so opening /friends does not refetch what
 * the badge already has, and one invalidation moves both.
 */
export function useFriendRequests() {
  const { viewer, isSignedIn } = useViewer()
  return useQuery({
    queryKey: [...friendKeys.requests, viewer],
    queryFn: fetchFriendRequests,
    enabled: isSignedIn,
  })
}

/** The number people actually look for. Zero while it is loading, and zero when nobody
 *  is signed in, which is the same thing as far as the badge is concerned. */
export function useIncomingRequestCount(): number {
  const requests = useFriendRequests()
  return (requests.data ?? []).filter((request) => request.direction === 'incoming').length
}

export function useBlockedUsers() {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...friendKeys.blocked, viewer],
    queryFn: fetchBlocked,
  })
}

/**
 * People search. Below `USER_SEARCH_MIN_LENGTH` the query does not run at all — the
 * server would answer `[]` anyway, and not asking is both faster and the difference
 * between "we found nothing" and "we have not looked yet", which the caller renders as
 * two different sentences.
 *
 * The caller passes an already-debounced value; debouncing inside the hook would put the
 * timer on the wrong side of the query key.
 */
export function useUserSearch(query: string) {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...friendKeys.search(query), viewer],
    queryFn: () => searchPeople(query),
    enabled: query.length >= USER_SEARCH_MIN_LENGTH,
  })
}

/* -------------------------------------------------------------------- mutations */

/**
 * One coarse sweep over `['friends']` rather than a hand-picked set per mutation.
 *
 * That is the opposite of the choice `review/queries.ts` makes, and deliberately so: the
 * four friend reads are unpaginated, tiny, and all four live on one screen, while nearly
 * every mutation moves at least two of them at once. Accepting a request empties a row
 * from the pending list, adds one to the friends list, *and* flips that person's state
 * in whatever search results are cached behind it. Enumerating that per mutation would
 * be three lines of ceremony that get one case wrong.
 *
 * The feed is separate and not always invalidated, because "who I can see" and "what I
 * can see" only move together some of the time — see each mutation below.
 */
function useInvalidateFriends() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: friendKeys.all })
  }
}

/**
 * Friendship changed, so both the friends lists and the activity stream are stale.
 *
 * It used to invalidate `feedKeys.all` — the `/feed` page's cache — and that page is gone.
 * The home summary is now the only place a friend's ratings appear, and it was *never* in
 * this invalidation: accepting a request refreshed a feed page and left the home panel
 * showing a timeline that did not yet include the person you had just accepted. Removing
 * the page turned a latent bug into the only path, so the key moved with the surface.
 */
function useInvalidateFriendsAndHome() {
  const client = useQueryClient()
  const invalidateFriends = useInvalidateFriends()
  return () => {
    invalidateFriends()
    void client.invalidateQueries({ queryKey: homeKeys.mine })
  }
}

/**
 * Sending a request changes nothing about what you can see, so the activity stream is
 * left alone — they are not a friend until they accept.
 *
 * Callers must render `SEND_REQUEST_FAILED` for *every* failure of this mutation rather
 * than `describeApiError`. `lib/friend.ts` explains why at length; the short version is
 * that a 404 here means "they blocked you", and a distinguishable error message is a
 * block that announces itself.
 */
export function useSendFriendRequest() {
  const invalidate = useInvalidateFriends()
  return useMutation({
    mutationFn: (userId: string) =>
      api<FriendRequest>('/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: invalidate,
  })
}

/** The one mutation that unambiguously widens the feed: their reviews are now yours to
 *  see, and a stream that stays empty right after you accept somebody reads as broken. */
export function useAcceptFriendRequest() {
  const invalidate = useInvalidateFriendsAndHome()
  return useMutation({
    mutationFn: (requestId: string) =>
      api<Friend>(`${requestPath(requestId)}/accept`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

/** One endpoint, two readings: declining somebody else's request and withdrawing your
 *  own. The server tells them apart from the request's own direction, and neither one
 *  changes the feed — no friendship existed either way. */
export function useDismissFriendRequest() {
  const invalidate = useInvalidateFriends()
  return useMutation({
    mutationFn: (requestId: string) => api<void>(requestPath(requestId), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useUnfriend() {
  const invalidate = useInvalidateFriendsAndHome()
  return useMutation({
    mutationFn: (userId: string) => api<void>(friendPath(userId), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/** Blocking is unfriend-plus: the server also tears down any friendship and any open
 *  request in either direction, so the feed loses their posts along with everything on
 *  this page moving. */
export function useBlockUser() {
  const invalidate = useInvalidateFriendsAndHome()
  return useMutation({
    mutationFn: (userId: string) => api<void>(`${friendPath(userId)}/block`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

/** Unblocking restores nothing: you are strangers again, not friends again. The feed is
 *  therefore unchanged, and only this page's lists move. */
export function useUnblockUser() {
  const invalidate = useInvalidateFriends()
  return useMutation({
    mutationFn: (userId: string) => api<void>(`${friendPath(userId)}/block`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

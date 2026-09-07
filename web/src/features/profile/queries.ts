import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { User } from '../../lib/api'
import type { Country, ProfileUpdate, PublicProfile } from '../../lib/profile'
import { useAuth } from '../auth/auth-context'
import { useViewer } from '../auth/viewer'

/**
 * Query keys as data, same as everywhere else.
 *
 *   ['profile']            every profile
 *   ['profile', userId]    one person's, before the viewer segment
 *
 * The viewer id is appended at the point of use rather than baked in, so `all` and
 * `detail` stay usable as invalidation prefixes. It has to be in the key: `friend_state`
 * is the same response field answering a different question per caller, and one visitor's
 * "Add friend" cached under a key the next one reads is the whole reason `viewer` exists.
 */
export const profileKeys = {
  all: ['profile'] as const,
  detail: (userId: string) => ['profile', userId] as const,
}

export const fetchProfile = (userId: string) =>
  api<PublicProfile>(`/users/${encodeURIComponent(userId)}/profile`)

/**
 * Somebody's profile, signed in or not.
 *
 * `authReady` rather than nothing: this page is public, so on a cold load it renders and
 * fetches while the silent refresh is still in flight. Asking early would cache the
 * anonymous answer — `friend_state: null`, no buttons — under the key the signed-in
 * viewer then reads, and the friend action would silently never appear. That exact bug
 * was found in the browser on `/teas/:slug` in M4; this is the same shape.
 */
export function useProfile(userId: string) {
  const { viewer, authReady } = useViewer()
  return useQuery({
    queryKey: [...profileKeys.detail(userId), viewer],
    queryFn: () => fetchProfile(userId),
    enabled: userId !== '' && authReady,
  })
}

/**
 * Save your own profile.
 *
 * Two things move on success and only two. The signed-in user, because the nav is showing
 * your name and avatar on every page and a save that leaves them stale reads as a save
 * that failed. And your own profile page, because the counts on it are the server's but
 * the name, bio and picture have just changed underneath whatever is cached.
 *
 * Not invalidated: every other profile, the feed, and the review lists. They carry your
 * avatar too, and refetching all of them to repaint a 24px circle is a lot of network for
 * a picture that will be right on the next natural refetch anyway.
 */
export function useUpdateProfile() {
  const client = useQueryClient()
  const { user, updateUser } = useAuth()
  const id = user?.id

  return useMutation({
    mutationFn: (input: ProfileUpdate) =>
      api<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (next) => {
      updateUser(next)
      if (id) void client.invalidateQueries({ queryKey: profileKeys.detail(id) })
    },
  })
}

/**
 * Every country the API will accept, sorted by name.
 *
 * Fetched rather than bundled so the picker and the server's validator cannot disagree:
 * a country in the dropdown the API rejects is a form nobody can submit. It is 249 rows
 * of two short strings — about 6 kB — and it changes roughly once a decade, so it is
 * cached indefinitely rather than refetched with everything else.
 */
export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: () => api<Country[]>('/countries'),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

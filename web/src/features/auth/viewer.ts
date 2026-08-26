import { useAuth } from './auth-context'

/**
 * Who is asking, for the benefit of a query key.
 *
 * Grew inside `catalog/queries.ts` in M4 and moved here in M5, when the friends and feed
 * features needed the same three facts. The reasoning is unchanged:
 *
 *  - **`viewer` belongs in the key** of any response that differs per person. Otherwise
 *    one visitor's answer is cached under a key the next one reads, and signing out and
 *    back in as somebody else shows them the previous person's data. It goes *last* in
 *    the key so the stable prefixes still work for invalidation.
 *  - **`authReady`** gates queries that can render before the silent refresh has
 *    settled — the public catalog pages. A query behind `RequireAuth` does not need it:
 *    that guard renders nothing at all while `isLoading`, so by the time the component
 *    exists the refresh has already answered. Adding it there is noise, not safety.
 *  - **`isSignedIn`** gates queries that must not be attempted at all without a session.
 *    `authReady` is not enough for those: it is true for a settled *anonymous* visitor
 *    too, and firing an authenticated endpoint for them buys a guaranteed 401.
 *
 * `'anon'` rather than `undefined` for the signed-out viewer, so the key segment is
 * always present and two signed-out entries share one cache line.
 */
export function useViewer() {
  const { user, isLoading } = useAuth()
  return { viewer: user?.id ?? 'anon', authReady: !isLoading, isSignedIn: user !== null }
}

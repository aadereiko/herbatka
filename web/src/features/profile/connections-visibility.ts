import type { PublicProfile } from '../../lib/profile'

type FriendState = PublicProfile['friend_state']

/**
 * Whether a panel has anything to say at all.
 *
 * Empty and absent are two different answers here, and telling them apart is most of the
 * work. The server has already applied the visibility rule before the lists reach us — see
 * `lib/profile.ts` — so an empty list on a stranger's profile does not mean "they have
 * none", it means "none that you may see", which is a fact about you rather than about
 * them and is not worth a box on their page. An empty list on your own profile or on a
 * friend's is the real answer, and saying it out loud is the point.
 *
 * Note what this does *not* do: work out what was filtered. It cannot. The browser is
 * never told what it was not allowed to see, and a second opinion computed here could
 * only ever disagree with the one that matters.
 */
export function worthShowing(count: number, state: FriendState): boolean {
  return count > 0 || state === 'self' || state === 'friends'
}

/**
 * Whether this profile has anything to say about who the person is connected to.
 *
 * The page's *layout* depends on the answer, not just the aside's content: with
 * connections the page is a wide main column and a narrow one beside it, and without them
 * the reviews should take the full width rather than two thirds of it and a column of
 * air. `ProfileConnections` returning null cannot express that — a grid with an empty
 * second column still reserves the column.
 *
 * It lives here rather than beside the component for the reason `auth-context.ts` and
 * `theme-context.ts` do: a module that exports both a component and a plain function
 * breaks Fast Refresh, and the lint rule that says so is worth listening to.
 */
export function hasProfileConnections(profile: PublicProfile): boolean {
  const { friend_state: state, households, friends } = profile
  return worthShowing(households.length, state) || worthShowing(friends.length, state)
}

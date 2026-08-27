import { useState } from 'react'

import { Link } from 'react-router'

import { Button } from '../../components/ui/button'
import { EmptyState, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Friend } from '../../lib/friend'
import type { Invite } from '../../lib/household'
import { PersonIdentity, RowError } from '../friend/PersonRow'
import { useFriends } from '../friend/queries'
import { useInviteFriend } from './queries'

/**
 * Pick a friend and invite them straight into the household — no code to relay.
 *
 * This is the point of M6h: the app already knows who your friends are, so inviting a
 * flatmate you already know should be choosing their name, not copying a string into a
 * chat window. The code form stays beside this one for the person who is not on Herbatka
 * yet; see `InvitesPanel`.
 *
 * The friends list is fetched here rather than passed in, because it is the owner's own
 * relationship graph and has nothing to do with the household being viewed — the same
 * `useFriends` the /friends page is built on, so "friend" means exactly what it means
 * there, blocks and all.
 *
 * Every friend is shown, but only the *invitable* ones carry a button:
 *  - already a member → "In this household", because inviting them would 409 and a button
 *    that only ever fails is a trap;
 *  - already invited and unanswered → "Invited", which is also what a just-clicked row
 *    flips to once the invites list refetches, so the click has visible consequence;
 *  - a friend who declined → invitable again, because a refusal is not a block and people
 *    change their minds.
 *
 * `memberIds` and the pending invites are the two exclusion sets. Both are the owner's to
 * see already — they are looking at the members panel and the invite list on the same
 * screen — so nothing here leaks a fact they did not have.
 */
export function FriendInvitePicker({
  householdId,
  memberIds,
  invites,
}: {
  householdId: string
  memberIds: Set<string>
  /** The household's outstanding invites, already loaded by the panel. A friend with an
   *  open (not declined) named invite among these is "Invited". */
  invites: Invite[]
}) {
  const friends = useFriends()
  const invite = useInviteFriend(householdId)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  // Open named invites only. A declined one leaves the friend invitable, which is the
  // whole reason the API records a decline rather than deleting it.
  const invitedIds = new Set(
    invites
      .filter((i) => i.invited_user != null && i.declined_at == null && i.accepted_at == null)
      .map((i) => i.invited_user!.id),
  )

  const items = friends.data ?? []

  function send(friend: Friend) {
    setError(null)
    invite.mutate(
      { user_id: friend.user.id },
      {
        onError: (cause) => setError({ id: friend.user.id, message: describeApiError(cause) }),
      },
    )
  }

  return (
    <div data-testid="friend-invite-picker">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Invite a friend
      </h3>

      {friends.isPending && (
        <div role="status" aria-live="polite" data-testid="friend-picker-loading" className="space-y-2">
          <span className="sr-only">Loading your friends…</span>
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {friends.isError && (
        <RowError testId="friend-picker-error">{describeApiError(friends.error)}</RowError>
      )}

      {/* No friends at all is a real, common state — you can own a household before you
          have added anybody — and it is a different sentence from "everybody is already
          here". It points at the one screen that can fix it. */}
      {!friends.isPending && !friends.isError && items.length === 0 && (
        <EmptyState title="No friends yet" testId="friend-picker-empty">
          <p>
            Invite a friend straight into the household once you have some. In the meantime,
            share a code below.
          </p>
          <Link to="/friends" className="font-medium text-brand-700 dark:text-brand-300">
            Find friends →
          </Link>
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul
          data-testid="friend-picker-list"
          className="divide-y divide-brand-100 dark:divide-neutral-800"
        >
          {items.map((friend) => {
            const isMember = memberIds.has(friend.user.id)
            const isInvited = invitedIds.has(friend.user.id)
            return (
              <li
                key={friend.user.id}
                data-testid={`friend-option-${friend.user.id}`}
                className="flex flex-wrap items-center gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <PersonIdentity user={friend.user} />
                  {error?.id === friend.user.id && (
                    <RowError testId={`friend-invite-error-${friend.user.id}`}>
                      {error.message}
                    </RowError>
                  )}
                </div>
                {isMember ? (
                  <span
                    data-testid={`friend-here-${friend.user.id}`}
                    className="text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    In this household
                  </span>
                ) : isInvited ? (
                  <span
                    data-testid={`friend-invited-${friend.user.id}`}
                    className="text-xs font-medium text-brand-700 dark:text-brand-300"
                  >
                    Invited
                  </span>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={invite.isPending}
                    ariaLabel={`Invite ${friend.user.display_name}`}
                    testId={`invite-friend-${friend.user.id}`}
                    onClick={() => send(friend)}
                  >
                    Invite
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

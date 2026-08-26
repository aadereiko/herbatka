import { useState } from 'react'

import { Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Friend } from '../../lib/friend'
import { formatDay } from '../../lib/format'
import { pluralise } from '../catalog/format'
import { ConfirmAction, PersonIdentity, RowError } from './PersonRow'
import { useBlockUser, useFriends, useUnfriend } from './queries'

/** Which of the two destructive actions on a row is currently asking. One at a time, so
 *  a row never shows two "Really" buttons and leaves the reader to match them up. */
type Pending = { userId: string; action: 'unfriend' | 'block' } | null

/**
 * The people whose reviews reach your feed.
 *
 * Both actions here are two-step. They earn it for different reasons: unfriending is
 * *quietly* destructive — nothing on screen explains that their side of it disappears
 * too — and blocking is loud and hard to undo from memory, since the person vanishes
 * from every list at once. Declining a request, by contrast, is one click, because it
 * costs nothing and can be re-offered.
 */
export function FriendsPanel() {
  const friends = useFriends()
  const unfriend = useUnfriend()
  const block = useBlockUser()
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const items = friends.data ?? []
  const busy = unfriend.isPending || block.isPending

  function handle(friend: Friend, action: 'unfriend' | 'block') {
    setError(null)
    const options = {
      onSuccess: () => setPending(null),
      onError: (cause: unknown) => {
        setPending(null)
        setError({ id: friend.user.id, message: describeApiError(cause) })
      },
    }
    if (action === 'unfriend') unfriend.mutate(friend.user.id, options)
    else block.mutate(friend.user.id, options)
  }

  function open(userId: string, action: 'unfriend' | 'block') {
    setError(null)
    setPending({ userId, action })
  }

  return (
    <Panel ariaLabel="Your friends" testId="friends-panel">
      <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Your friends{items.length > 0 && ` (${items.length})`}
      </h2>

      {friends.isPending && (
        <div role="status" aria-live="polite" data-testid="friends-loading" className="space-y-2">
          <span className="sr-only">Loading your friends…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {friends.isError && (
        <RowError testId="friends-error">{describeApiError(friends.error)}</RowError>
      )}

      {!friends.isPending && !friends.isError && items.length === 0 && (
        <p data-testid="friends-empty" className="text-sm text-neutral-600 dark:text-neutral-400">
          Nobody yet. Search for somebody below — once they accept, what they rate shows up
          in your feed.
        </p>
      )}

      {items.length > 0 && (
        <ul data-testid="friend-list" className="divide-y divide-brand-100 dark:divide-neutral-800">
          {items.map((friend) => (
            <li
              key={friend.user.id}
              data-testid="friend"
              className="flex flex-wrap items-center gap-2 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <PersonIdentity
                  user={friend.user}
                  note={`friends since ${formatDay(friend.friends_since)}`}
                />
                {error?.id === friend.user.id && (
                  <RowError testId={`friend-error-${friend.user.id}`}>{error.message}</RowError>
                )}
              </div>
              <span className="flex items-center gap-2">
                {(pending?.userId !== friend.user.id || pending.action === 'unfriend') && (
                  <ConfirmAction
                    open={pending?.userId === friend.user.id && pending.action === 'unfriend'}
                    onOpen={() => open(friend.user.id, 'unfriend')}
                    onCancel={() => setPending(null)}
                    onConfirm={() => handle(friend, 'unfriend')}
                    label="Unfriend"
                    confirmLabel="Really unfriend"
                    ariaLabel={`Unfriend ${friend.user.display_name}`}
                    pending={busy}
                    testId={`unfriend-${friend.user.id}`}
                    confirmTestId={`confirm-unfriend-${friend.user.id}`}
                  />
                )}
                {(pending?.userId !== friend.user.id || pending.action === 'block') && (
                  <ConfirmAction
                    open={pending?.userId === friend.user.id && pending.action === 'block'}
                    onOpen={() => open(friend.user.id, 'block')}
                    onCancel={() => setPending(null)}
                    onConfirm={() => handle(friend, 'block')}
                    label="Block"
                    confirmLabel="Really block"
                    ariaLabel={`Block ${friend.user.display_name}`}
                    pending={busy}
                    testId={`block-${friend.user.id}`}
                    confirmTestId={`confirm-block-${friend.user.id}`}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {pluralise(items.length, 'person', 'people')} can see what you rate.
        </p>
      )}
    </Panel>
  )
}

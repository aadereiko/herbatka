import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { Badge, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { FriendRequest } from '../../lib/friend'
import { formatDay } from '../../lib/format'
import { PersonIdentity, RowError } from './PersonRow'
import { useAcceptFriendRequest, useDismissFriendRequest, useFriendRequests } from './queries'

/**
 * Everything waiting on somebody's decision, incoming first.
 *
 * Incoming first is not a style choice: a request addressed to you is the only thing on
 * this page that is *yours to answer*, and it is what somebody opens /friends to deal
 * with. Outgoing requests are a receipt — worth showing, worth being able to withdraw,
 * not worth the top of the page.
 *
 * Both directions come from one `GET /friends/requests`; the split happens here rather
 * than across two calls, because the server sends `direction` precisely so the client
 * does not have to ask twice.
 */
export function RequestsPanel() {
  const requests = useFriendRequests()
  const accept = useAcceptFriendRequest()
  const dismiss = useDismissFriendRequest()
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const items = requests.data ?? []
  const incoming = items.filter((request) => request.direction === 'incoming')
  const outgoing = items.filter((request) => request.direction === 'outgoing')
  const busy = accept.isPending || dismiss.isPending

  function handle(request: FriendRequest, action: 'accept' | 'dismiss') {
    setError(null)
    const onError = (cause: unknown) =>
      setError({ id: request.id, message: describeApiError(cause) })
    if (action === 'accept') accept.mutate(request.id, { onError })
    else dismiss.mutate(request.id, { onError })
  }

  return (
    <Panel ariaLabel="Pending requests" testId="requests-panel">
      <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Pending requests
        {incoming.length > 0 && (
          <span className="ml-2 align-middle" data-testid="pending-count">
            <Badge tone="brand">{incoming.length} waiting on you</Badge>
          </span>
        )}
      </h2>

      {requests.isPending && (
        <div role="status" aria-live="polite" data-testid="requests-loading" className="space-y-2">
          <span className="sr-only">Loading your requests…</span>
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {requests.isError && (
        <RowError testId="requests-error">{describeApiError(requests.error)}</RowError>
      )}

      {!requests.isPending && !requests.isError && items.length === 0 && (
        <p data-testid="requests-empty" className="text-sm text-neutral-600 dark:text-neutral-400">
          Nothing waiting. Find somebody below and send them a request.
        </p>
      )}

      {incoming.length > 0 && (
        <ul
          data-testid="incoming-requests"
          className="divide-y divide-brand-100 dark:divide-neutral-800"
        >
          {incoming.map((request) => (
            <li
              key={request.id}
              data-testid="incoming-request"
              className="flex flex-wrap items-center gap-2 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <PersonIdentity
                  user={request.user}
                  note={`asked ${formatDay(request.created_at)}`}
                />
                {error?.id === request.id && (
                  <RowError testId={`request-error-${request.id}`}>{error.message}</RowError>
                )}
              </div>
              <span className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  ariaLabel={`Accept ${request.user.display_name}`}
                  testId={`accept-${request.id}`}
                  onClick={() => handle(request, 'accept')}
                >
                  Accept
                </Button>
                {/* Declining takes one step. It is reversible — they can ask again, and
                    nothing of theirs is destroyed — so a confirmation here would be
                    friction charged for nothing. Unfriending and blocking are not. */}
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  ariaLabel={`Decline ${request.user.display_name}`}
                  testId={`decline-${request.id}`}
                  onClick={() => handle(request, 'dismiss')}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Sent by you
          </h3>
          <ul
            data-testid="outgoing-requests"
            className="divide-y divide-brand-100 dark:divide-neutral-800"
          >
            {outgoing.map((request) => (
              <li
                key={request.id}
                data-testid="outgoing-request"
                className="flex flex-wrap items-center gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <PersonIdentity
                    user={request.user}
                    note={`sent ${formatDay(request.created_at)}`}
                  />
                  {error?.id === request.id && (
                    <RowError testId={`request-error-${request.id}`}>{error.message}</RowError>
                  )}
                </div>
                <span className="flex items-center gap-2">
                  <Badge>Waiting</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    ariaLabel={`Cancel your request to ${request.user.display_name}`}
                    testId={`cancel-${request.id}`}
                    onClick={() => handle(request, 'dismiss')}
                  >
                    Cancel
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

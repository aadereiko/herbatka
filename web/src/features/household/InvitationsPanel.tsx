import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '../../components/ui/button'
import { EntityImage } from '../../components/ui/image'
import { Panel } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Invitation } from '../../lib/household'
import { RowError } from '../friend/PersonRow'
import { formatDay } from '../stock/format'
import { useAcceptInvitation, useDeclineInvitation, useInvitations } from './queries'

/**
 * Household invitations waiting on you — the household counterpart of the friends page's
 * `RequestsPanel`, and modelled on it deliberately rather than as a second, different
 * "notifications" idea. Something is waiting on you; here is which household and who asked;
 * accept or decline.
 *
 * It sits at the top of the households list, above your own households, because a request
 * addressed to you is the only thing on that page that is *waiting* — the same reason
 * incoming friend requests sit first on /friends.
 *
 * **Absent, not empty, at zero.** When nothing is waiting the panel renders nothing at all
 * rather than an empty box. An empty "Invitations" card on every visit is a line people
 * learn to stop seeing, and this page already has a loading state of its own — so this
 * hook contributes only when it has something to contribute.
 *
 * Declining is one click, like declining a friend request: it is reversible from the
 * owner's side (they can invite again) and nothing of yours is destroyed, so a
 * confirmation would be friction charged for nothing. Accepting lands you on the household
 * you just joined, the same place joining by code takes you.
 */
export function InvitationsPanel() {
  const invitations = useInvitations()
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()
  const navigate = useNavigate()
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const items = invitations.data ?? []
  const busy = accept.isPending || decline.isPending

  // Nothing to show, or not loaded yet: contribute nothing. See the docstring.
  if (items.length === 0) return null

  function handle(invitation: Invitation, action: 'accept' | 'decline') {
    setError(null)
    const onError = (cause: unknown) =>
      setError({ id: invitation.id, message: describeApiError(cause) })
    if (action === 'accept') {
      accept.mutate(invitation.id, {
        onSuccess: (household) => void navigate(`/households/${household.id}`),
        onError,
      })
    } else {
      decline.mutate(invitation.id, { onError })
    }
  }

  return (
    <div className="mb-6">
      <Panel ariaLabel="Household invitations" testId="invitations-panel">
        <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
          Invitations
        </h2>
        <ul
          data-testid="invitation-list"
          className="divide-y divide-brand-100 dark:divide-neutral-800"
        >
          {items.map((invitation) => (
            <li
              key={invitation.id}
              data-testid="invitation"
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <EntityImage
                src={invitation.household.image_url}
                alt=""
                className="size-10 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-brand-900 dark:text-brand-100">
                  {invitation.household.name}
                </p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {invitation.invited_by
                    ? `Invited by ${invitation.invited_by.display_name}`
                    : 'Invited'}
                  {' · '}
                  {formatDay(invitation.created_at)}
                </p>
                {error?.id === invitation.id && (
                  <RowError testId={`invitation-error-${invitation.id}`}>{error.message}</RowError>
                )}
              </div>
              <span className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  ariaLabel={`Accept invitation to ${invitation.household.name}`}
                  testId={`accept-invitation-${invitation.id}`}
                  onClick={() => handle(invitation, 'accept')}
                >
                  Accept
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  ariaLabel={`Decline invitation to ${invitation.household.name}`}
                  testId={`decline-invitation-${invitation.id}`}
                  onClick={() => handle(invitation, 'decline')}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

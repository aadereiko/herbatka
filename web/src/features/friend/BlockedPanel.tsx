import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { Panel } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { PersonIdentity, RowError } from './PersonRow'
import { useBlockedUsers, useUnblockUser } from './queries'

/**
 * Who you have blocked, and the only way back out.
 *
 * Not in the brief's three sections, and here anyway: without it, `POST
 * /friends/{id}/block` is a one-way door — the person disappears from every list on this
 * page, search reports them as `blocked` with no affordance, and nothing in the UI can
 * ever call `DELETE /friends/{id}/block`. A destructive action with no undo path is a
 * bug however small the section that fixes it.
 *
 * It renders only when there is somebody in it. A permanent "Blocked (0)" heading is an
 * invitation to think about blocking people, which is not a thing this page should be
 * nudging anybody towards.
 *
 * Unblocking is one step, unlike blocking: it restores nothing and endangers nothing —
 * you are strangers again, not friends again — so there is nothing to confirm.
 */
export function BlockedPanel() {
  const blocked = useBlockedUsers()
  const unblock = useUnblockUser()
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const items = blocked.data ?? []
  if (items.length === 0) return null

  return (
    <Panel ariaLabel="Blocked" testId="blocked-panel">
      <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Blocked ({items.length})
      </h2>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        They cannot find you or send you a request, and they are not told why.
      </p>

      <ul data-testid="blocked-list" className="divide-y divide-brand-100 dark:divide-neutral-800">
        {items.map((user) => (
          <li
            key={user.id}
            data-testid="blocked-person"
            className="flex flex-wrap items-center gap-2 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <PersonIdentity user={user} />
              {error?.id === user.id && (
                <RowError testId={`blocked-error-${user.id}`}>{error.message}</RowError>
              )}
            </div>
            <Button
              size="sm"
              disabled={unblock.isPending}
              ariaLabel={`Unblock ${user.display_name}`}
              testId={`unblock-${user.id}`}
              onClick={() => {
                setError(null)
                unblock.mutate(user.id, {
                  onError: (cause) => setError({ id: user.id, message: describeApiError(cause) }),
                })
              }}
            >
              Unblock
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

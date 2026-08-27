import { useState } from 'react'
import { Link } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { Badge, Panel } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Member } from '../../lib/household'
import { MEMBER_ROLE_LABELS } from '../../lib/household'
import { formatDay } from '../stock/format'
import { useRemoveMember } from './queries'

/**
 * Who else can see the shelf.
 *
 * An owner can remove anybody but themselves — leaving is its own action in the page
 * header, because "remove Ada" and "leave this household" have different consequences
 * and reading the second off a row labelled with your own name is how people leave by
 * accident. A member sees the list and no buttons.
 */
export function MembersPanel({
  householdId,
  members,
  isOwner,
  currentUserId,
}: {
  householdId: string
  members: Member[]
  isOwner: boolean
  currentUserId: string | null
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const remove = useRemoveMember(householdId)

  function handleRemove(member: Member) {
    setError(null)
    remove.mutate(member.user.id, {
      onSuccess: () => setConfirming(null),
      onError: (cause) => {
        setConfirming(null)
        setError({ id: member.user.id, message: describeApiError(cause) })
      },
    })
  }

  return (
    <Panel ariaLabel="Members" testId="members-panel">
      <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Members ({members.length})
      </h2>
      <ul className="divide-y divide-brand-100 dark:divide-neutral-800" data-testid="member-list">
        {members.map((member) => {
          const isYou = member.user.id === currentUserId
          return (
            <li key={member.user.id} className="flex flex-wrap items-center gap-2.5 py-2.5">
              <Avatar
                src={member.user.avatar_url}
                name={member.user.display_name}
                size="sm"
                testId={`member-avatar-${member.user.id}`}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-900 dark:text-brand-100">
                  <Link to={`/users/${member.user.id}`} className="hover:underline">
                    {member.user.display_name}
                  </Link>
                  {isYou && <span className="ml-1 text-xs text-neutral-500">(you)</span>}
                </p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {member.user.email} · joined {formatDay(member.joined_at)}
                </p>
                {error?.id === member.user.id && (
                  <p
                    role="alert"
                    data-testid={`member-error-${member.user.id}`}
                    className="mt-1 text-xs text-rose-600 dark:text-rose-400"
                  >
                    {error.message}
                  </p>
                )}
              </div>

              <span className="ml-auto flex items-center gap-2">
                <Badge tone={member.role === 'owner' ? 'brand' : 'neutral'}>
                  {MEMBER_ROLE_LABELS[member.role]}
                </Badge>
                {isOwner &&
                  !isYou &&
                  (confirming === member.user.id ? (
                    <>
                      {/* Two steps, inline. window.confirm is a no-op under jsdom, so a
                          destructive action guarded by it is one no test can cover. */}
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={remove.isPending}
                        testId={`confirm-remove-${member.user.id}`}
                        onClick={() => handleRemove(member)}
                      >
                        Really remove
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      ariaLabel={`Remove ${member.user.display_name}`}
                      testId={`remove-${member.user.id}`}
                      onClick={() => {
                        setError(null)
                        setConfirming(member.user.id)
                      }}
                    >
                      Remove
                    </Button>
                  ))}
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

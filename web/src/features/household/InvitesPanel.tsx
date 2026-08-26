import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import { FormError, SubmitButton, TextField } from '../../components/ui/form'
import { EmptyState, ErrorNote, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { InviteInput } from '../../lib/household'
import { formatDay } from '../stock/format'
import { useCreateInvite, useInvites, useRevokeInvite } from './queries'

/**
 * Owner-only, and rendered only for an owner — the route is the server's business but a
 * panel of controls that always answers 403 is nobody's idea of a useful screen.
 *
 * The code itself is the product here, so it is rendered large, selectable and in a
 * monospace face: it gets read aloud across a kitchen or pasted into a message, and an
 * `l`/`1` mix-up in a proportional font costs somebody a phone call.
 */
export function InvitesPanel({ householdId }: { householdId: string }) {
  const [email, setEmail] = useState('')
  const [days, setDays] = useState('')
  const [daysError, setDaysError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<string | null>(null)

  const invites = useInvites(householdId, true)
  const create = useCreateInvite(householdId)
  const revoke = useRevokeInvite(householdId)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const input: InviteInput = {}
    const trimmedEmail = email.trim()
    if (trimmedEmail) input.invited_email = trimmedEmail

    const rawDays = days.trim()
    if (rawDays) {
      const value = Number(rawDays)
      if (!Number.isInteger(value) || value <= 0) {
        setDaysError('Whole days, and more than zero.')
        return
      }
      input.expires_in_days = value
    }

    setDaysError(undefined)
    create.mutate(input, {
      onSuccess: () => {
        setEmail('')
        setDays('')
      },
    })
  }

  const items = invites.data ?? []

  return (
    <Panel ariaLabel="Invites" testId="invites-panel">
      <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">Invites</h2>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        Share a code and whoever has it can join. Only owners can see this.
      </p>

      <form noValidate onSubmit={handleSubmit} data-testid="create-invite-form" className="space-y-3">
        <TextField
          id="invite-email"
          label="For whom? (optional)"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="flatmate@example.com"
          hint="Leave blank for a code anybody can use."
        />
        <TextField
          id="invite-days"
          label="Expires in (optional)"
          type="number"
          min={1}
          step={1}
          value={days}
          onChange={setDays}
          error={daysError}
          hint="Days. Blank uses the server's default."
        />
        {create.isError && <FormError testId="invite-error">{describeApiError(create.error)}</FormError>}
        <div className="sm:w-44">
          <SubmitButton pending={create.isPending}>
            {create.isPending ? 'Making a code…' : 'Make an invite'}
          </SubmitButton>
        </div>
      </form>

      <div className="mt-4 border-t border-brand-100 pt-4 dark:border-neutral-800">
        {invites.isError && (
          <ErrorNote testId="invites-load-error">{describeApiError(invites.error)}</ErrorNote>
        )}

        {invites.isPending && (
          <div role="status" aria-live="polite" data-testid="invites-loading">
            <span className="sr-only">Loading invites…</span>
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!invites.isPending && !invites.isError && items.length === 0 && (
          <EmptyState title="No codes outstanding" testId="invites-empty">
            <p>Make one above when somebody needs to join.</p>
          </EmptyState>
        )}

        {items.length > 0 && (
          <ul className="space-y-3" data-testid="invite-list">
            {items.map((invite) => (
              <li
                key={invite.id}
                className="rounded-xl border border-brand-200 p-3 dark:border-neutral-700"
              >
                <p
                  data-testid={`invite-code-${invite.id}`}
                  className="select-all font-mono text-lg font-semibold tracking-wider text-brand-900 dark:text-brand-100"
                >
                  {invite.code}
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {invite.invited_email ? `For ${invite.invited_email} · ` : 'Anyone · '}
                  expires {formatDay(invite.expires_at)}
                </p>
                <div className="mt-2 flex gap-2">
                  {confirming === invite.id ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={revoke.isPending}
                        testId={`confirm-revoke-${invite.id}`}
                        onClick={() =>
                          revoke.mutate(invite.id, { onSuccess: () => setConfirming(null) })
                        }
                      >
                        Really revoke
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Keep it
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      ariaLabel={`Revoke invite ${invite.code}`}
                      testId={`revoke-${invite.id}`}
                      onClick={() => setConfirming(invite.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

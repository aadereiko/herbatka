import { useState } from 'react'
import type { FormEvent } from 'react'

import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { FormError, SubmitButton, TextField } from '../../components/ui/form'
import { Badge, EmptyState, ErrorNote, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Invite, InviteInput } from '../../lib/household'
import { formatDay } from '../stock/format'
import { FriendInvitePicker } from './FriendInvitePicker'
import { useCreateInvite, useInvites, useRevokeInvite } from './queries'

/**
 * Owner-only, and rendered only for an owner — the route is the server's business but a
 * panel of controls that always answers 403 is nobody's idea of a useful screen.
 *
 * Two ways to invite, in the order most people want them. **A friend, by name** comes
 * first: the app already knows who your friends are, so inviting a flatmate you already
 * know is picking them off a list, not minting and relaying a string. **A code** stays
 * below it, because it is still the only answer for somebody who is not on Herbatka yet —
 * you cannot pick a name that has no account behind it.
 *
 * The code itself is rendered large, selectable and monospace: it gets read aloud across a
 * kitchen or pasted into a message, and an `l`/`1` mix-up in a proportional font costs
 * somebody a phone call. A named invite carries no code by design, so its row shows the
 * person instead — there is nothing to copy, which is the whole point.
 */
export function InvitesPanel({
  householdId,
  memberIds,
}: {
  householdId: string
  /** The current members, so the friend picker can mark those already here and never
   *  offer a button that would only 409. Passed down rather than refetched — the detail
   *  page already has it. */
  memberIds: string[]
}) {
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
        Invite a friend by name, or share a code with anybody else. Only owners can see this.
      </p>

      <FriendInvitePicker
        householdId={householdId}
        memberIds={new Set(memberIds)}
        invites={items}
      />

      <form
        noValidate
        onSubmit={handleSubmit}
        data-testid="create-invite-form"
        className="mt-4 space-y-3 border-t border-brand-100 pt-4 dark:border-neutral-800"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Or share a code
        </h3>
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
          <EmptyState title="Nothing outstanding" testId="invites-empty">
            <p>Invite a friend above, or make a code, when somebody needs to join.</p>
          </EmptyState>
        )}

        {items.length > 0 && (
          <ul className="space-y-3" data-testid="invite-list">
            {items.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                confirming={confirming === invite.id}
                revoking={revoke.isPending}
                onConfirm={() => setConfirming(invite.id)}
                onCancel={() => setConfirming(null)}
                onRevoke={() => revoke.mutate(invite.id, { onSuccess: () => setConfirming(null) })}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/**
 * One outstanding invite. The two flavours look different on purpose: a code is a thing to
 * copy, so it is shown as one; a named invite is a person, so it shows who — there is no
 * string to hand over. A named invite that has been declined says so rather than sitting
 * there looking like it is still waiting, because the owner is the one entitled to know
 * the answer came back "no".
 */
function InviteRow({
  invite,
  confirming,
  revoking,
  onConfirm,
  onCancel,
  onRevoke,
}: {
  invite: Invite
  confirming: boolean
  revoking: boolean
  onConfirm: () => void
  onCancel: () => void
  onRevoke: () => void
}) {
  const named = invite.invited_user
  const declined = invite.declined_at != null
  const revokeLabel = named
    ? `Revoke invite for ${named.display_name}`
    : `Revoke invite ${invite.code}`

  return (
    <li className="rounded-xl border border-brand-200 p-3 dark:border-neutral-700">
      {named ? (
        <div className="flex items-center gap-2.5" data-testid={`invite-friend-row-${invite.id}`}>
          <Avatar src={named.avatar_url} name={named.display_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-brand-900 dark:text-brand-100">
              {named.display_name}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{named.email}</p>
          </div>
          {declined && (
            <span className="ml-auto" data-testid={`invite-declined-${invite.id}`}>
              <Badge tone="rose">Declined</Badge>
            </span>
          )}
        </div>
      ) : (
        <p
          data-testid={`invite-code-${invite.id}`}
          className="select-all font-mono text-lg font-semibold tracking-wider text-brand-900 dark:text-brand-100"
        >
          {invite.code}
        </p>
      )}

      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {named
          ? declined
            ? `Declined ${formatDay(invite.declined_at as string)}`
            : `Invited · expires ${formatDay(invite.expires_at)}`
          : `${invite.invited_email ? `For ${invite.invited_email} · ` : 'Anyone · '}expires ${formatDay(invite.expires_at)}`}
      </p>

      <div className="mt-2 flex gap-2">
        {confirming ? (
          <>
            <Button
              variant="danger"
              size="sm"
              disabled={revoking}
              testId={`confirm-revoke-${invite.id}`}
              onClick={onRevoke}
            >
              Really revoke
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            size="sm"
            ariaLabel={revokeLabel}
            testId={`revoke-${invite.id}`}
            onClick={onConfirm}
          >
            Revoke
          </Button>
        )}
      </div>
    </li>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { FormError, SubmitButton, TextField } from '../../components/ui/form'
import { EntityImage } from '../../components/ui/image'
import {
  Badge,
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Panel,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { HouseholdSummary } from '../../lib/household'
import { MEMBER_ROLE_LABELS } from '../../lib/household'
import { pluralise } from '../catalog/format'
import { InvitationsPanel } from './InvitationsPanel'
import { useCreateHousehold, useHouseholdList, useJoinHousehold } from './queries'

function HouseholdCard({ household }: { household: HouseholdSummary }) {
  return (
    <li className="list-none">
      <Link
        to={`/households/${household.id}`}
        data-testid="household-card"
        className="flex h-full flex-col gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start gap-3">
          {/* Empty alt: the whole card is one link whose text is the household's name,
              and hearing it twice is repetition rather than information. */}
          <EntityImage
            src={household.image_url}
            alt=""
            className="size-12 shrink-0 rounded-xl"
            testId="household-card-image"
          />
          <h2 className="mr-auto text-base font-semibold text-brand-900 dark:text-brand-100">
            {household.name}
          </h2>
          <Badge tone={household.role === 'owner' ? 'brand' : 'neutral'}>
            {MEMBER_ROLE_LABELS[household.role]}
          </Badge>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {pluralise(household.member_count, 'member')} · {pluralise(household.stock_item_count, 'tin')}
        </p>

        {/* Only shown when there is something to say. A permanent "0 running low" trains
            people to stop reading the line that matters. */}
        {household.low_stock_count > 0 && (
          <span className="mt-auto" data-testid={`household-low-${household.id}`}>
            <Badge tone="rose">{pluralise(household.low_stock_count, 'tin')} running low</Badge>
          </span>
        )}
      </Link>
    </li>
  )
}

/** Two ways in — start one, or join one somebody else started — side by side, because
 *  which of the two you want is obvious to you and unguessable to us. */
function CreateHouseholdForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const create = useCreateHousehold()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Give it a name — “Home” is fine.')
      return
    }
    setNameError(undefined)
    create.mutate(
      { name: trimmed },
      { onSuccess: (household) => void navigate(`/households/${household.id}`) },
    )
  }

  return (
    <Panel ariaLabel="Start a household">
      <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Start a household
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        You become its owner and can invite whoever shares the shelf.
      </p>
      <form noValidate onSubmit={handleSubmit} data-testid="create-household-form" className="space-y-3">
        <TextField
          id="household-name"
          label="Name"
          value={name}
          onChange={setName}
          error={nameError}
          placeholder="Home, Flat 3, The Office…"
        />
        {create.isError && (
          <FormError testId="create-household-error">{describeApiError(create.error)}</FormError>
        )}
        <div className="sm:w-44">
          <SubmitButton pending={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </SubmitButton>
        </div>
      </form>
    </Panel>
  )
}

function JoinHouseholdForm() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)
  const join = useJoinHousehold()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setCodeError('Paste the code you were sent.')
      return
    }
    setCodeError(undefined)
    join.mutate(
      { code: trimmed },
      { onSuccess: (household) => void navigate(`/households/${household.id}`) },
    )
  }

  return (
    <Panel ariaLabel="Join a household">
      <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Join with a code
      </h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Somebody sent you one — paste it here.
      </p>
      <form noValidate onSubmit={handleSubmit} data-testid="join-household-form" className="space-y-3">
        <TextField
          id="join-code"
          label="Invite code"
          value={code}
          onChange={setCode}
          error={codeError}
          placeholder="ABCD-1234"
        />
        {/* Three different refusals arrive here — unknown code, expired code, already a
            member — and the server's sentence is the only one that says which. */}
        {join.isError && <FormError testId="join-error">{describeApiError(join.error)}</FormError>}
        <div className="sm:w-44">
          <SubmitButton pending={join.isPending}>
            {join.isPending ? 'Joining…' : 'Join'}
          </SubmitButton>
        </div>
      </form>
    </Panel>
  )
}

export function HouseholdListPage() {
  const households = useHouseholdList()
  const items = households.data ?? []

  return (
    <PageShell>
      <PageHeading
        title="Households"
        subtitle="A shared shelf. Everyone in one sees the same tins and the same amounts left."
      />

      {/* Anything waiting on you, first — the same placement incoming friend requests get
          on /friends. Renders nothing when there is nothing to answer. */}
      <InvitationsPanel />

      {households.isError && (
        <div className="mb-6">
          <ErrorNote testId="household-list-error">{describeApiError(households.error)}</ErrorNote>
        </div>
      )}

      {households.isPending && (
        <div className="mb-6">
          <LoadingGrid
            label="Loading your households…"
            testId="household-list-loading"
            count={2}
            className="grid gap-4 sm:grid-cols-2"
          />
        </div>
      )}

      {!households.isPending && !households.isError && items.length === 0 && (
        <div className="mb-6">
          <EmptyState title="You are not in a household yet" testId="household-list-empty">
            <p>
              A household is the shelf you share. Put a tin in it and everybody in the
              household sees how much is left — so nobody buys a fourth bag of sencha, and
              whoever finishes the oolong is the one who knows to replace it.
            </p>
            <p>Start one below, or join an existing one with a code.</p>
          </EmptyState>
        </div>
      )}

      {items.length > 0 && (
        <ul data-testid="household-list" className="mb-6 grid gap-4 sm:grid-cols-2">
          {items.map((household) => (
            <HouseholdCard key={household.id} household={household} />
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CreateHouseholdForm />
        <JoinHouseholdForm />
      </div>
    </PageShell>
  )
}

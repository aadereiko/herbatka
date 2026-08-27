import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormError, SubmitButton, TextField } from '../../components/ui/form'
import { EntityImage } from '../../components/ui/image'
import { IMAGE_UPLOAD_HINT, ImageUploadField } from '../../components/ui/image-upload'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { ApiError, describeApiError } from '../../lib/api'
import type { HouseholdPatch } from '../../lib/household'
import { MEMBER_ROLE_LABELS } from '../../lib/household'
import { pluralise } from '../catalog/format'
import { useAuth } from '../auth/auth-context'
import { StockList } from '../stock/StockList'
import { InvitesPanel } from './InvitesPanel'
import { MembersPanel } from './MembersPanel'
import {
  useDeleteHousehold,
  useHousehold,
  useRemoveMember,
  useRenameHousehold,
} from './queries'

/**
 * The owner's edit form: a name and a picture.
 *
 * It was a rename box until M6 widened `PATCH /households/{id}` to take `image_url` too.
 * Both go in one submit rather than the picture saving itself on upload, because
 * `ImageUploadField` hands back a URL and nothing more — until this form is submitted,
 * the file is on the server and the household still points at whatever it pointed at.
 * Anything else would make "Cancel" a lie about the half of the form that had already
 * committed itself.
 *
 * Only what actually changed goes in the body, which is what a PATCH is for and is not
 * merely tidy: an owner who touched the picture and not the name should not be sending
 * the name back, because that is the write that clobbers the rename another owner made
 * thirty seconds ago. A removed picture is an honest `null` — the whole reason
 * `HouseholdPatch` types it `string | null` rather than optional-only.
 */
function EditHouseholdForm({
  householdId,
  currentName,
  currentImage,
  onDone,
}: {
  householdId: string
  currentName: string
  currentImage: string | null
  onDone: () => void
}) {
  const [name, setName] = useState(currentName)
  const [imageUrl, setImageUrl] = useState<string | null>(currentImage)
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const rename = useRenameHousehold(householdId)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('It needs a name.')
      return
    }
    setNameError(undefined)

    const patch: HouseholdPatch = {}
    if (trimmed !== currentName) patch.name = trimmed
    if (imageUrl !== currentImage) patch.image_url = imageUrl

    rename.mutate(patch, { onSuccess: onDone })
  }

  return (
    <Panel ariaLabel="Edit this household" className="mb-6">
      <form noValidate onSubmit={handleSubmit} data-testid="rename-household-form" className="space-y-3">
        <TextField
          id="rename-household"
          label="Household name"
          value={name}
          onChange={setName}
          error={nameError}
        />
        <ImageUploadField
          id="household-image"
          label="Photo"
          value={imageUrl}
          onChange={setImageUrl}
          hint={IMAGE_UPLOAD_HINT}
          previewAlt={`Photo of ${currentName}`}
        />
        {rename.isError && (
          <FormError testId="rename-error">{describeApiError(rename.error)}</FormError>
        )}
        <div className="flex items-center gap-3">
          <div className="w-40">
            <SubmitButton pending={rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </SubmitButton>
          </div>
          <Button variant="ghost" testId="cancel-rename" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  )
}

/**
 * One household: its shelf, who is in it, and — for an owner — the invite codes.
 *
 * The stock list comes first in the document as well as on screen. Members and invites
 * are the settings of this page; the shelf is the reason anybody opened it, and on a
 * phone that means it must not be below two panels of administration.
 */
export function HouseholdDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const household = useHousehold(id)
  const remove = useDeleteHousehold(id)
  const leave = useRemoveMember(id)

  if (household.isPending) {
    return (
      <PageShell>
        <div role="status" aria-live="polite" data-testid="household-loading" className="space-y-4">
          <span className="sr-only">Loading household…</span>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PageShell>
    )
  }

  if (household.isError) {
    /**
     * The API answers 404 rather than 403 for a household you are not in, so that ids
     * cannot be probed for existence. That means we genuinely cannot tell "no such
     * household" from "not yours" — and must not pretend to. There is no retry here on
     * purpose: neither answer changes on a second ask, and a Retry button that cannot
     * help is a button that wastes somebody's time twice.
     */
    const missing = household.error instanceof ApiError && household.error.status === 404
    return (
      <PageShell>
        {missing ? (
          <EmptyState title="Not found, or not yours" testId="household-missing">
            <p>
              Either this household does not exist or you are not a member of it. If
              somebody meant to add you, ask them for an invite code.
            </p>
            <Link to="/households" className="font-medium text-brand-700 dark:text-brand-300">
              Back to your households
            </Link>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            <ErrorNote testId="household-error">{describeApiError(household.error)}</ErrorNote>
            <Button testId="household-retry" onClick={() => void household.refetch()}>
              Try again
            </Button>
          </div>
        )}
      </PageShell>
    )
  }

  const detail = household.data
  const isOwner = detail.role === 'owner'

  function handleDelete() {
    setActionError(null)
    remove.mutate(undefined, {
      onSuccess: () => void navigate('/households'),
      onError: (error) => {
        setConfirming(null)
        setActionError(describeApiError(error))
      },
    })
  }

  function handleLeave() {
    setActionError(null)
    if (!user) return
    leave.mutate(user.id, {
      onSuccess: () => void navigate('/households'),
      // The 409 case: the last owner cannot walk out and leave a household nobody can
      // administer. The server's sentence says exactly that, so it is the one to show.
      onError: (error) => {
        setConfirming(null)
        setActionError(describeApiError(error))
      },
    })
  }

  return (
    <PageShell>
      <PageHeading
        leading={
          <EntityImage
            src={detail.image_url}
            // A real alt: unlike on the card, this picture is not inside a link whose
            // text already says the name.
            alt={`Photo of ${detail.name}`}
            className="size-14 shrink-0 rounded-2xl"
            testId="household-detail-image"
          />
        }
        title={detail.name}
        subtitle={`${pluralise(detail.member_count, 'member')} · ${pluralise(
          detail.stock_item_count,
          'tin',
        )}${detail.low_stock_count > 0 ? ` · ${detail.low_stock_count} running low` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isOwner ? 'brand' : 'neutral'}>{MEMBER_ROLE_LABELS[detail.role]}</Badge>
            <Link
              to="/households"
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              ← All households
            </Link>
          </div>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorNote testId="household-action-error">{actionError}</ErrorNote>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {isOwner && !renaming && (
          <Button testId="start-rename" onClick={() => setRenaming(true)}>
            Edit
          </Button>
        )}

        {/* Leaving is available to everybody, including an owner — the server refuses only
            when they are the last one, and says so. */}
        {confirming === 'leave' ? (
          <>
            <Button
              variant="danger"
              testId="confirm-leave"
              disabled={leave.isPending}
              onClick={handleLeave}
            >
              Really leave “{detail.name}”
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Stay
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            testId="leave-household"
            onClick={() => {
              setActionError(null)
              setConfirming('leave')
            }}
          >
            Leave household
          </Button>
        )}

        {isOwner &&
          (confirming === 'delete' ? (
            <>
              <Button
                variant="danger"
                testId="confirm-delete-household"
                disabled={remove.isPending}
                onClick={handleDelete}
              >
                Really delete, with every tin
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              testId="delete-household"
              onClick={() => {
                setActionError(null)
                setConfirming('delete')
              }}
            >
              Delete household
            </Button>
          ))}
      </div>

      {isOwner && renaming && (
        <EditHouseholdForm
          householdId={id}
          currentName={detail.name}
          currentImage={detail.image_url}
          onDone={() => setRenaming(false)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <StockList householdId={id} />

        <div className="space-y-6">
          <MembersPanel
            householdId={id}
            members={detail.members}
            isOwner={isOwner}
            currentUserId={user?.id ?? null}
          />
          {/* Absent, not disabled, for a member: the endpoint is owner-only and a panel
              that can only ever answer 403 is worse than no panel at all. */}
          {isOwner && <InvitesPanel householdId={id} />}
        </div>
      </div>
    </PageShell>
  )
}

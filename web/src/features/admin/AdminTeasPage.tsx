import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormNote } from '../../components/ui/form'
import {
  Badge,
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { TeaSummary } from '../../lib/catalog'
import { CAFFEINE_LEVEL_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'
import { pluralise } from '../catalog/format'
import { TeaForm } from '../catalog/TeaForm'
import { useAdminTeaList, useApproveTea, useCreateTea, useDeleteTea } from './queries'

const QUEUE_PAGE_SIZE = 20

export function AdminTeasPage() {
  // The queue has no filters, so its one piece of state stays local — unlike /teas,
  // where the whole point is that the filters are in the URL and therefore shareable.
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const queue = useAdminTeaList({ approved: false, page, size: QUEUE_PAGE_SIZE })
  const approve = useApproveTea()
  const remove = useDeleteTea()
  const create = useCreateTea()

  const items = queue.data?.items ?? []

  function handleApprove(tea: TeaSummary) {
    setRowError(null)
    setNotice(null)
    approve.mutate(tea.id, {
      onSuccess: () => setNotice(`“${tea.name}” is now in the catalog.`),
      onError: (error) => setRowError({ id: tea.id, message: describeApiError(error) }),
    })
  }

  function handleDelete(tea: TeaSummary) {
    setRowError(null)
    setNotice(null)
    remove.mutate(tea.id, {
      onSuccess: () => {
        setConfirming(null)
        setNotice(`Rejected “${tea.name}”.`)
      },
      onError: (error) => {
        setConfirming(null)
        setRowError({ id: tea.id, message: describeApiError(error) })
      },
    })
  }

  return (
    <PageShell>
      <PageHeading
        title="Tea queue"
        subtitle="Submissions waiting for review. Approving one publishes it to the public catalog."
        actions={
          <Button
            variant={creating ? 'ghost' : 'primary'}
            testId="toggle-create-tea"
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Cancel' : 'Add a tea'}
          </Button>
        }
      />

      {creating && (
        <Panel className="mb-6" ariaLabel="Add a tea">
          <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Add a tea
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Created by an admin, so it goes straight into the catalog approved.
          </p>
          {create.isSuccess && (
            <div className="mb-4">
              <FormNote testId="create-tea-success">
                “{create.data.name}” is live.{' '}
                <Link to={`/teas/${create.data.slug}`} className="font-medium underline">
                  View it
                </Link>
              </FormNote>
            </div>
          )}
          <TeaForm
            key={formKey}
            idPrefix="admin-tea"
            submitLabel="Create tea"
            pendingLabel="Creating…"
            pending={create.isPending}
            error={create.isError ? describeApiError(create.error) : null}
            onSubmit={(input) =>
              create.mutate(input, { onSuccess: () => setFormKey((key) => key + 1) })
            }
          />
        </Panel>
      )}

      {notice && (
        <div className="mb-4">
          <FormNote testId="queue-notice">{notice}</FormNote>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        data-testid="queue-count"
        className="mb-4 text-sm text-neutral-600 dark:text-neutral-400"
      >
        {queue.isPending
          ? 'Loading the queue…'
          : `${pluralise(queue.data?.total ?? 0, 'tea')} waiting`}
      </p>

      {queue.isError && <ErrorNote testId="queue-error">{describeApiError(queue.error)}</ErrorNote>}

      {queue.isPending && (
        <LoadingGrid
          label="Loading the queue…"
          testId="queue-loading"
          count={3}
          className="space-y-3"
        />
      )}

      {!queue.isPending && !queue.isError && items.length === 0 && (
        <EmptyState title="Nothing waiting" testId="queue-empty">
          <p>Every submission has been dealt with. Good.</p>
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul className="space-y-3" data-testid="queue-list">
          {items.map((tea) => (
            <Panel as="li" key={tea.id} className="list-none">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-brand-900 dark:text-brand-100">
                    {tea.name}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {tea.brand ? tea.brand.name : 'Unbranded'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{TEA_TYPE_LABELS[tea.tea_type]}</Badge>
                    <Badge tone={tea.caffeine_level === 'none' ? 'neutral' : 'amber'}>
                      {CAFFEINE_LEVEL_LABELS[tea.caffeine_level]}
                    </Badge>
                    {tea.primary_ingredients.map((ingredient) => (
                      <Badge key={ingredient} tone="neutral">
                        {ingredient}
                      </Badge>
                    ))}
                  </div>
                  {rowError?.id === tea.id && (
                    <p
                      role="alert"
                      data-testid={`queue-error-${tea.id}`}
                      className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                    >
                      {rowError.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {confirming === tea.id ? (
                    <>
                      <Button
                        variant="danger"
                        testId={`confirm-delete-${tea.id}`}
                        disabled={remove.isPending}
                        onClick={() => handleDelete(tea)}
                      >
                        Really delete
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        ariaLabel={`Approve ${tea.name}`}
                        testId={`approve-${tea.id}`}
                        disabled={approve.isPending}
                        onClick={() => handleApprove(tea)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        ariaLabel={`Delete ${tea.name}`}
                        testId={`delete-${tea.id}`}
                        onClick={() => {
                          setRowError(null)
                          setConfirming(tea.id)
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </ul>
      )}

      <Pagination
        page={queue.data?.page ?? 1}
        pages={queue.data?.pages ?? 1}
        onPageChange={setPage}
      />
    </PageShell>
  )
}

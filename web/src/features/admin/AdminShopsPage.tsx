import { useState } from 'react'
import type { ReactNode } from 'react'
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
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { ShopSummary } from '../../lib/shop'
import { pluralise } from '../catalog/format'
import { AdminListingsPanel } from '../shop/AdminListingsPanel'
import { draftFromShop, toShopInput, toShopPatch } from '../shop/draft'
import { describePlace } from '../shop/format'
import {
  useAdminShopList,
  useApproveShop,
  useCreateShop,
  useDeleteShop,
  useShopDetail,
  useUpdateShop,
} from '../shop/queries'
import { ShopForm } from '../shop/ShopForm'

const QUEUE_PAGE_SIZE = 20

/**
 * Editing an approved shop, and managing what it stocks.
 *
 * It fetches the *detail* rather than editing from the summary row it was opened from,
 * and the reason is not tidiness: `address` and `description` exist only on the detail,
 * and a PATCH built from a shape that lacks them would send `null` for both and quietly
 * delete a shop's description the first time anybody fixed a typo in its name.
 */
function EditShopPanel({ shop, onSaved }: { shop: ShopSummary; onSaved: (name: string) => void }) {
  const detail = useShopDetail(shop.slug)
  const update = useUpdateShop()

  if (detail.isPending) {
    return (
      <div role="status" aria-live="polite" data-testid={`edit-shop-loading-${shop.id}`}>
        <span className="sr-only">Loading {shop.name}…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (detail.isError) {
    return (
      <ErrorNote testId={`edit-shop-error-${shop.id}`}>{describeApiError(detail.error)}</ErrorNote>
    )
  }

  return (
    <div className="mt-4 space-y-4 border-t border-brand-100 pt-4 dark:border-neutral-800">
      <ShopForm
        idPrefix={`edit-shop-${shop.id}`}
        submitLabel="Save shop"
        pendingLabel="Saving…"
        pending={update.isPending}
        error={update.isError ? describeApiError(update.error) : null}
        initial={draftFromShop(detail.data)}
        withImage
        onSubmit={(draft) =>
          update.mutate(
            { id: shop.id, patch: toShopPatch(draft) },
            { onSuccess: (saved) => onSaved(saved.name) },
          )
        }
      />
      <AdminListingsPanel shopId={shop.id} shopSlug={shop.slug} />
    </div>
  )
}

/** One row in either list. The queue's rows approve and reject; the listed rows open the
 *  editor into `expanded`. Same card, different buttons, because they are the same
 *  object at two points in its life. */
function ShopRow({
  shop,
  actions,
  expanded,
}: {
  shop: ShopSummary
  actions: ReactNode
  expanded?: ReactNode
}) {
  const place = describePlace(shop)
  return (
    <Panel as="li" className="list-none">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-brand-900 dark:text-brand-100">{shop.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {place ?? 'Online only'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={shop.listing_count > 0 ? 'brand' : 'neutral'}>
              {pluralise(shop.listing_count, 'tea')}
            </Badge>
            {shop.website && <Badge tone="neutral">Has a website</Badge>}
            {!shop.image_url && <Badge tone="neutral">No photo</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {expanded}
    </Panel>
  )
}

/**
 * The shop queue, plus creating and editing — the shape of `/admin/teas`, with the one
 * addition that a shop has listings hanging off it.
 *
 * Two lists rather than one. A pending shop can only be approved or rejected: it is a
 * stranger's suggestion and there is nothing to curate yet. An approved shop is the
 * opposite — its name, photo and stock are exactly what wants maintaining, and burying
 * that behind a filter toggle on a queue that is empty most days would hide the half of
 * the page that gets daily use.
 */
export function AdminShopsPage() {
  const [queuePage, setQueuePage] = useState(1)
  const [livePage, setLivePage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const queue = useAdminShopList({ approved: false, page: queuePage, size: QUEUE_PAGE_SIZE })
  const live = useAdminShopList({ approved: true, page: livePage, size: QUEUE_PAGE_SIZE })
  const approve = useApproveShop()
  const remove = useDeleteShop()
  const create = useCreateShop()

  const pending = queue.data?.items ?? []
  const approved = live.data?.items ?? []

  function handleApprove(shop: ShopSummary) {
    setRowError(null)
    setNotice(null)
    approve.mutate(shop.id, {
      onSuccess: () => setNotice(`“${shop.name}” is now listed.`),
      onError: (error) => setRowError({ id: shop.id, message: describeApiError(error) }),
    })
  }

  function handleDelete(shop: ShopSummary) {
    setRowError(null)
    setNotice(null)
    remove.mutate(shop.id, {
      onSuccess: () => {
        setConfirming(null)
        setNotice(`Removed “${shop.name}”.`)
      },
      onError: (error) => {
        setConfirming(null)
        setRowError({ id: shop.id, message: describeApiError(error) })
      },
    })
  }

  return (
    <PageShell>
      <PageHeading
        title="Shops"
        subtitle="Suggestions waiting for review, and the shops already listed."
        actions={
          <Button
            variant={creating ? 'ghost' : 'primary'}
            testId="toggle-create-shop"
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Cancel' : 'Add a shop'}
          </Button>
        }
      />

      {creating && (
        <Panel className="mb-6" ariaLabel="Add a shop">
          <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Add a shop
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Created by an admin, so it is listed straight away.
          </p>
          {create.isSuccess && (
            <div className="mb-4">
              <FormNote testId="create-shop-success">
                “{create.data.name}” is live.{' '}
                <Link to={`/shops/${create.data.slug}`} className="font-medium underline">
                  View it
                </Link>
              </FormNote>
            </div>
          )}
          <ShopForm
            key={formKey}
            idPrefix="admin-shop"
            submitLabel="Create shop"
            pendingLabel="Creating…"
            pending={create.isPending}
            error={create.isError ? describeApiError(create.error) : null}
            withImage
            onSubmit={(draft) =>
              create.mutate(toShopInput(draft, true), {
                onSuccess: () => setFormKey((key) => key + 1),
              })
            }
          />
        </Panel>
      )}

      {notice && (
        <div className="mb-4">
          <FormNote testId="shop-queue-notice">{notice}</FormNote>
        </div>
      )}

      <h2 className="mb-2 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Waiting for review
      </h2>
      <p
        role="status"
        aria-live="polite"
        data-testid="shop-queue-count"
        className="mb-4 text-sm text-neutral-600 dark:text-neutral-400"
      >
        {queue.isPending
          ? 'Loading the queue…'
          : `${pluralise(queue.data?.total ?? 0, 'shop')} waiting`}
      </p>

      {queue.isError && (
        <ErrorNote testId="shop-queue-error">{describeApiError(queue.error)}</ErrorNote>
      )}

      {queue.isPending && (
        <LoadingGrid
          label="Loading the queue…"
          testId="shop-queue-loading"
          count={2}
          className="space-y-3"
        />
      )}

      {!queue.isPending && !queue.isError && pending.length === 0 && (
        <EmptyState title="Nothing waiting" testId="shop-queue-empty">
          <p>Every suggestion has been dealt with. Good.</p>
        </EmptyState>
      )}

      {pending.length > 0 && (
        <ul className="space-y-3" data-testid="shop-queue-list">
          {pending.map((shop) => (
            <ShopRow
              key={shop.id}
              shop={shop}
              expanded={
                rowError?.id === shop.id && (
                  <p
                    role="alert"
                    data-testid={`shop-row-error-${shop.id}`}
                    className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                  >
                    {rowError.message}
                  </p>
                )
              }
              actions={
                confirming === shop.id ? (
                  <>
                    <Button
                      variant="danger"
                      testId={`confirm-delete-shop-${shop.id}`}
                      disabled={remove.isPending}
                      onClick={() => handleDelete(shop)}
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
                      ariaLabel={`Approve ${shop.name}`}
                      testId={`approve-shop-${shop.id}`}
                      disabled={approve.isPending}
                      onClick={() => handleApprove(shop)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      ariaLabel={`Delete ${shop.name}`}
                      testId={`delete-shop-${shop.id}`}
                      onClick={() => {
                        setRowError(null)
                        setConfirming(shop.id)
                      }}
                    >
                      Delete
                    </Button>
                  </>
                )
              }
            />
          ))}
        </ul>
      )}

      <Pagination
        page={queue.data?.page ?? 1}
        pages={queue.data?.pages ?? 1}
        onPageChange={setQueuePage}
      />

      <h2 className="mb-4 mt-8 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Listed shops
      </h2>

      {live.isError && (
        <ErrorNote testId="shop-live-error">{describeApiError(live.error)}</ErrorNote>
      )}

      {live.isPending && (
        <LoadingGrid
          label="Loading listed shops…"
          testId="shop-live-loading"
          count={2}
          className="space-y-3"
        />
      )}

      {!live.isPending && !live.isError && approved.length === 0 && (
        <EmptyState title="No shops listed yet" testId="shop-live-empty">
          <p>Approve a suggestion, or add one above.</p>
        </EmptyState>
      )}

      {approved.length > 0 && (
        <ul className="space-y-3" data-testid="shop-live-list">
          {approved.map((shop) => (
            <ShopRow
              key={shop.id}
              shop={shop}
              expanded={
                <>
                  {rowError?.id === shop.id && (
                    <p
                      role="alert"
                      data-testid={`shop-row-error-${shop.id}`}
                      className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                    >
                      {rowError.message}
                    </p>
                  )}
                  {editing === shop.id && (
                    <EditShopPanel
                      shop={shop}
                      onSaved={(name) => {
                        setEditing(null)
                        setNotice(`Saved “${name}”.`)
                      }}
                    />
                  )}
                </>
              }
              actions={
                <>
                  <Button
                    testId={`edit-shop-${shop.id}`}
                    ariaLabel={`Edit ${shop.name}`}
                    onClick={() => setEditing(editing === shop.id ? null : shop.id)}
                  >
                    {editing === shop.id ? 'Close' : 'Edit'}
                  </Button>
                  {confirming === shop.id ? (
                    <>
                      <Button
                        variant="danger"
                        testId={`confirm-delete-shop-${shop.id}`}
                        disabled={remove.isPending}
                        onClick={() => handleDelete(shop)}
                      >
                        Really delete
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="danger"
                      ariaLabel={`Delete ${shop.name}`}
                      testId={`delete-shop-${shop.id}`}
                      onClick={() => {
                        setRowError(null)
                        setConfirming(shop.id)
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </ul>
      )}

      <Pagination
        page={live.data?.page ?? 1}
        pages={live.data?.pages ?? 1}
        onPageChange={setLivePage}
      />
    </PageShell>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Button } from '../../components/ui/button'
import {
  FormError,
  FormNote,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '../../components/ui/form'
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
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import type {
  StockEventInputKind,
  StockItemDetail,
  StockItemPatch,
} from '../../lib/household'
import { STOCK_EVENT_INPUT_KINDS, STOCK_EVENT_LABELS } from '../../lib/household'
import { describeActor, formatDay, formatDelta, formatGrams, formatMoment, formatPrice } from './format'
import { PaceNote } from './PaceNote'
import {
  useDeleteStockItem,
  useStockAdjust,
  useStockEvent,
  useStockItem,
  useUpdateStockItem,
} from './queries'

const eventKindOptions = STOCK_EVENT_INPUT_KINDS.map((kind) => ({
  value: kind,
  label: STOCK_EVENT_LABELS[kind],
}))

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800 dark:text-neutral-200">{value}</dd>
    </div>
  )
}

/** Only the fields that actually changed go in the PATCH, and `''` means "clear it" —
 *  which is why the nullable fields are `T | null` rather than optional-only. */
function patchText(raw: string, current: string | null): string | null | undefined {
  const next = raw.trim() === '' ? null : raw.trim()
  return next === current ? undefined : next
}

function EditTinForm({
  householdId,
  item,
  onDone,
}: {
  householdId: string
  item: StockItemDetail
  onDone: () => void
}) {
  const [location, setLocation] = useState(item.location ?? '')
  const [lowStock, setLowStock] = useState(String(item.low_stock_grams))
  const [openedAt, setOpenedAt] = useState(item.opened_at ?? '')
  const [bestBefore, setBestBefore] = useState(item.best_before ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [lowStockError, setLowStockError] = useState<string | undefined>(undefined)
  const update = useUpdateStockItem(householdId, item.id)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const patch: StockItemPatch = {
      location: patchText(location, item.location),
      opened_at: patchText(openedAt, item.opened_at),
      best_before: patchText(bestBefore, item.best_before),
      notes: patchText(notes, item.notes),
    }

    const low = Number(lowStock.trim())
    if (!Number.isFinite(low) || low < 0) {
      setLowStockError('Use a number of grams.')
      return
    }
    if (low !== item.low_stock_grams) patch.low_stock_grams = low
    setLowStockError(undefined)

    update.mutate(patch, { onSuccess: onDone })
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid="edit-tin-form" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="edit-tin-location" label="Where is it kept?" value={location} onChange={setLocation} />
        <TextField
          id="edit-tin-low-stock"
          label="Warn me below"
          type="number"
          min={0}
          step={0.1}
          value={lowStock}
          onChange={setLowStock}
          error={lowStockError}
          hint="Grams."
        />
        <TextField id="edit-tin-opened" label="Opened on" value={openedAt} onChange={setOpenedAt} />
        <TextField
          id="edit-tin-best-before"
          label="Best before"
          value={bestBefore}
          onChange={setBestBefore}
        />
      </div>
      <TextAreaField id="edit-tin-notes" label="Notes" value={notes} onChange={setNotes} rows={2} />
      {/* No quantity field, and that is the design: grams only ever move through an event,
          so that the history is a complete account of where the tea went. */}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        How much is left is not edited here — use “I recounted it” below, which records the
        difference.
      </p>
      {update.isError && <FormError testId="edit-tin-error">{describeApiError(update.error)}</FormError>}
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save details'}
          </SubmitButton>
        </div>
        <Button variant="ghost" testId="cancel-edit-tin" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * One tin: what is in it, where it went, and the two ways to correct the number.
 *
 * The list screen owns the daily gesture (tap 5 g, done). This screen owns everything
 * that needs thought — a recount, a bag thrown out, the metadata — and the history that
 * makes the number believable.
 */
export function StockItemPage() {
  const { id = '', itemId = '' } = useParams()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [eventError, setEventError] = useState<string | null>(null)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const [kind, setKind] = useState<StockEventInputKind>('brew')
  const [grams, setGrams] = useState('')
  const [eventNote, setEventNote] = useState('')
  const [gramsError, setGramsError] = useState<string | undefined>(undefined)

  const [total, setTotal] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [totalError, setTotalError] = useState<string | undefined>(undefined)

  const tin = useStockItem(id, itemId)
  const event = useStockEvent(id)
  const adjust = useStockAdjust(id, itemId)
  const remove = useDeleteStockItem(id)

  if (tin.isPending) {
    return (
      <PageShell>
        <div role="status" aria-live="polite" data-testid="tin-loading" className="space-y-4">
          <span className="sr-only">Loading tin…</span>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PageShell>
    )
  }

  if (tin.isError) {
    // Same reasoning as the household page: non-members get 404 rather than 403, so the
    // two are indistinguishable from here and a retry cannot change either one.
    const missing = tin.error instanceof ApiError && tin.error.status === 404
    return (
      <PageShell>
        {missing ? (
          <EmptyState title="Not found, or not yours" testId="tin-missing">
            <p>This tin is gone, or it is on a shelf you are not a member of.</p>
            <Link to="/households" className="font-medium text-brand-700 dark:text-brand-300">
              Back to your households
            </Link>
          </EmptyState>
        ) : (
          <ErrorNote testId="tin-error">{describeApiError(tin.error)}</ErrorNote>
        )}
      </PageShell>
    )
  }

  const item = tin.data
  const price = formatPrice(item.price_paid_minor, item.currency)

  function handleEvent(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    const amount = Number(grams.trim())
    if (!Number.isFinite(amount) || amount <= 0) {
      setGramsError('A number of grams, more than zero.')
      return
    }
    setGramsError(undefined)
    setEventError(null)
    setNotice(null)

    event.mutate(
      { itemId, input: { kind, grams: amount, note: eventNote.trim() || undefined } },
      {
        onSuccess: (detail) => {
          setGrams('')
          setEventNote('')
          setNotice(`Recorded. ${formatGrams(detail.quantity_grams)} left.`)
        },
        // The 409: brewing or discarding more than is in the tin. The server names what is
        // actually left, and `useStockEvent` has already put the number back.
        onError: (cause) => setEventError(describeApiError(cause)),
      },
    )
  }

  function handleAdjust(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    const amount = Number(total.trim())
    if (!Number.isFinite(amount) || amount < 0) {
      setTotalError('A number of grams, zero or more.')
      return
    }
    setTotalError(undefined)
    setAdjustError(null)
    setNotice(null)

    adjust.mutate(
      { quantity_grams: amount, note: adjustNote.trim() || undefined },
      {
        onSuccess: (detail) => {
          setTotal('')
          setAdjustNote('')
          setNotice(`Recounted to ${formatGrams(detail.quantity_grams)}.`)
        },
        onError: (cause) => setAdjustError(describeApiError(cause)),
      },
    )
  }

  return (
    <PageShell>
      <PageHeading
        title={item.tea.name}
        subtitle={TEA_TYPE_LABELS[item.tea.tea_type]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/teas/${item.tea.slug}`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              About this tea
            </Link>
            <Link
              to={`/households/${id}`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              ← The shelf
            </Link>
          </div>
        }
      />

      {notice && (
        <div className="mb-4">
          <FormNote testId="tin-notice">{notice}</FormNote>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Panel ariaLabel="How much is left" testId="tin-detail">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p
                data-testid="tin-quantity"
                className={`text-4xl font-semibold tabular-nums ${
                  item.is_low ? 'text-rose-700 dark:text-rose-300' : 'text-brand-900 dark:text-brand-100'
                }`}
              >
                {formatGrams(item.quantity_grams)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {item.is_low && <Badge tone="rose">Running low</Badge>}
                <Badge tone="neutral">warns below {formatGrams(item.low_stock_grams)}</Badge>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <DetailRow label="Kept in" value={item.location ?? '—'} />
              <DetailRow label="Opened" value={formatDay(item.opened_at)} />
              <DetailRow label="Best before" value={formatDay(item.best_before)} />
              <DetailRow label="Bought" value={formatDay(item.purchased_at)} />
              <DetailRow label="Price paid" value={price ?? '—'} />
              <DetailRow label="Last change" value={formatMoment(item.updated_at)} />
              {/* Only when the tin came from a shop the catalog knows — most tins are
                  typed in by hand and have no answer, and a row of em dashes down the
                  grid is a row nobody reads. A link, because "buy another one" is the
                  reason anybody looks at where a tin came from. */}
              {item.shop && (
                <div data-testid="tin-shop">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Bought at
                  </dt>
                  <dd className="text-sm">
                    <Link
                      to={`/shops/${item.shop.slug}`}
                      className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                    >
                      {item.shop.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            {item.notes && (
              <p
                data-testid="tin-notes"
                className="mt-4 border-t border-brand-100 pt-3 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
              >
                {item.notes}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-brand-100 pt-3 dark:border-neutral-800">
              {!editing && (
                <Button testId="start-edit-tin" onClick={() => setEditing(true)}>
                  Edit details
                </Button>
              )}
              {confirmingDelete ? (
                <>
                  <Button
                    variant="danger"
                    testId="confirm-delete-tin"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(itemId, { onSuccess: () => void navigate(`/households/${id}`) })
                    }
                  >
                    Really remove this tin
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button variant="danger" testId="delete-tin" onClick={() => setConfirmingDelete(true)}>
                  Remove from the shelf
                </Button>
              )}
            </div>
          </Panel>

          {editing && (
            <Panel ariaLabel="Edit this tin">
              <EditTinForm householdId={id} item={item} onDone={() => setEditing(false)} />
            </Panel>
          )}

          {/* Between the tin's numbers and its log, which is where the question forms:
              you have just read "62 g left" and the next thing you want to know is
              whether that is a fortnight or a year. Putting it above the history also
              means the answer arrives before the evidence for it, which is the right
              order for a summary. */}
          <Panel ariaLabel="How fast it is going" testId="tin-pace-panel">
            <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
              How fast it is going
            </h2>
            <PaceNote pace={item.pace} testId="tin-pace" />
          </Panel>

          <Panel ariaLabel="History" testId="tin-events">
            <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">History</h2>
            {item.recent_events.length === 0 ? (
              <p data-testid="tin-events-empty" className="text-sm text-neutral-500 dark:text-neutral-400">
                Nothing has happened to this tin yet.
              </p>
            ) : (
              <ul className="divide-y divide-brand-100 dark:divide-neutral-800">
                {item.recent_events.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
                    <span className="text-sm font-medium text-brand-900 dark:text-brand-100">
                      {STOCK_EVENT_LABELS[entry.kind]}
                    </span>
                    <span
                      data-testid={`event-delta-${entry.id}`}
                      className={`text-sm font-semibold tabular-nums ${
                        entry.delta_grams < 0
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {formatDelta(entry.delta_grams)}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {describeActor(entry)} · {formatMoment(entry.occurred_at)}
                    </span>
                    {entry.note && (
                      <span className="w-full text-xs italic text-neutral-600 dark:text-neutral-400">
                        “{entry.note}”
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel ariaLabel="Record a change">
            <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
              Record a change
            </h2>
            <form noValidate onSubmit={handleEvent} data-testid="event-form" className="space-y-3">
              <SelectField
                id="event-kind"
                label="What happened?"
                value={kind}
                onChange={(value) => setKind(value as StockEventInputKind)}
                options={eventKindOptions}
              />
              <TextField
                id="event-grams"
                label="How much?"
                type="number"
                min={0}
                step={0.1}
                value={grams}
                onChange={setGrams}
                error={gramsError}
                hint="Grams. Always a positive amount — the kind decides the direction."
              />
              <TextField id="event-note" label="Note (optional)" value={eventNote} onChange={setEventNote} />
              {eventError && <FormError testId="event-error">{eventError}</FormError>}
              <SubmitButton pending={event.isPending}>
                {event.isPending ? 'Recording…' : 'Record it'}
              </SubmitButton>
            </form>
          </Panel>

          <Panel ariaLabel="Recount">
            <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
              I recounted it
            </h2>
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
              Put the scales under it and type what is really there. The difference goes into
              the history as a recount.
            </p>
            <form noValidate onSubmit={handleAdjust} data-testid="adjust-form" className="space-y-3">
              <TextField
                id="adjust-total"
                label="Actually there now"
                type="number"
                min={0}
                step={0.1}
                value={total}
                onChange={setTotal}
                error={totalError}
                hint="Grams, in total — not a difference."
              />
              <TextField
                id="adjust-note"
                label="Note (optional)"
                value={adjustNote}
                onChange={setAdjustNote}
              />
              {adjustError && <FormError testId="adjust-error">{adjustError}</FormError>}
              <SubmitButton pending={adjust.isPending}>
                {adjust.isPending ? 'Saving…' : 'Set the total'}
              </SubmitButton>
            </form>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}

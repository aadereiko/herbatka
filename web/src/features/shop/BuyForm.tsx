import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/ui/button'
import { FormError, SelectField, SubmitButton, TextField } from '../../components/ui/form'
import { EmptyState, ErrorNote, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { formatGrams } from '../../lib/format'
import type { Listing } from '../../lib/shop'
import { useHouseholdList } from '../household/queries'
import { priceMajorInput, readPriceMajor } from './format'
import { useBuyListing } from './queries'

/** Today, as the `<input type="date">` wants it. Local rather than UTC: somebody buying
 *  tea at 9pm in Kraków means today, and `toISOString` would say tomorrow. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

type FieldErrors = { grams?: string; price?: string }

/**
 * "I bought this" — the centre of M6.
 *
 * Four questions, and three of them are already answered. The pack size and the price
 * come from the listing, the date is today, and all three stay editable because the
 * listing is what the shop advertises and the receipt is what actually happened.
 *
 * The household is the one genuine question, and the interesting case is having no
 * answer to it. Somebody with no household cannot be shown a picker with nothing in it —
 * a `<select>` with no options is a control that looks broken and refuses to say why. So
 * that state is its own explanation and a way out of it, and the form never renders.
 */
export function BuyForm({
  shopSlug,
  shopName,
  listing,
  onClose,
}: {
  shopSlug: string
  shopName: string
  listing: Listing
  onClose: () => void
}) {
  const households = useHouseholdList()
  const buy = useBuyListing()

  const [householdId, setHouseholdId] = useState('')
  const [grams, setGrams] = useState(listing.pack_grams === null ? '' : String(listing.pack_grams))
  const [price, setPrice] = useState(priceMajorInput(listing.price_minor))
  const [purchasedAt, setPurchasedAt] = useState(today())
  const [errors, setErrors] = useState<FieldErrors>({})

  const items = households.data ?? []
  // The first household is preselected rather than left on a "choose one" placeholder:
  // most people have exactly one, and making them pick it is a step for nobody. It stays
  // in a `??` rather than an effect so that switching it does not fight a re-render.
  const chosen = householdId || items[0]?.id || ''

  if (households.isPending) {
    return (
      <div role="status" aria-live="polite" data-testid="buy-loading" className="space-y-2">
        <span className="sr-only">Loading your households…</span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    )
  }

  if (households.isError) {
    return <ErrorNote testId="buy-households-error">{describeApiError(households.error)}</ErrorNote>
  }

  if (items.length === 0) {
    return (
      <EmptyState title="You need a household first" testId="buy-no-households">
        <p>
          A tin has to land on somebody’s shelf, and yours is a household — the shared
          list that everybody in it sees. Start one and this button will work.
        </p>
        <p>
          <Link to="/households" className="font-medium text-brand-700 dark:text-brand-300">
            Set up a household →
          </Link>
        </p>
      </EmptyState>
    )
  }

  if (buy.isSuccess) {
    const tin = buy.data
    const home = items.find((household) => household.id === chosen)
    return (
      <div
        role="status"
        data-testid="buy-success"
        className="space-y-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900 dark:text-brand-100"
      >
        <p>
          {formatGrams(tin.quantity_grams)} of {tin.tea.name} on the shelf
          {home ? ` at ${home.name}` : ''}, from {shopName}.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/households/${chosen}/stock/${tin.id}`}
            data-testid="buy-success-tin-link"
            className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
          >
            View the tin →
          </Link>
          <Button variant="ghost" size="sm" testId="buy-close" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: FieldErrors = {}

    const amount = Number(grams.trim())
    if (grams.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
      next.grams = 'How many grams did you get?'
    }

    // The API stores minor units; the form asks for the number on the receipt, so the
    // ×100 happens here rather than asking anybody to type 450 for 4.50 zł.
    const paid = readPriceMajor(price)
    if (paid.error) next.price = paid.error

    setErrors(next)
    if (Object.keys(next).length > 0) return

    buy.mutate({
      shopSlug,
      listingId: listing.id,
      input: {
        household_id: chosen,
        grams: amount,
        price_paid_minor: paid.minor,
        // Taken from the listing rather than asked for. The shop already publishes what
        // it prices in, and a currency box next to a prefilled price is a question with
        // one plausible answer.
        currency: listing.currency ?? undefined,
        purchased_at: purchasedAt || undefined,
      },
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid="buy-form" className="space-y-4">
      <SelectField
        id={`buy-household-${listing.id}`}
        label="Onto whose shelf?"
        value={chosen}
        onChange={setHouseholdId}
        options={items.map((household) => ({ value: household.id, label: household.name }))}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`buy-grams-${listing.id}`}
          label="How much?"
          type="number"
          min={0}
          step={0.1}
          value={grams}
          onChange={setGrams}
          error={errors.grams}
          hint="Grams."
        />
        <TextField
          id={`buy-price-${listing.id}`}
          label="What did you pay?"
          value={price}
          onChange={setPrice}
          error={errors.price}
          placeholder="4.50"
          hint={listing.currency ?? 'Leave blank if you would rather not say.'}
        />
        <TextField
          id={`buy-date-${listing.id}`}
          label="When?"
          type="date"
          value={purchasedAt}
          onChange={setPurchasedAt}
        />
      </div>

      {/* A 403 means the household is not yours and a 404 that the listing has gone —
          both are the server's to explain, and both are worth reading rather than
          flattening into "something went wrong". */}
      {buy.isError && <FormError testId="buy-error">{describeApiError(buy.error)}</FormError>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="sm:w-52">
          <SubmitButton pending={buy.isPending}>
            {buy.isPending ? 'Adding…' : 'Add it to the shelf'}
          </SubmitButton>
        </div>
        <Button variant="ghost" testId="buy-cancel" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

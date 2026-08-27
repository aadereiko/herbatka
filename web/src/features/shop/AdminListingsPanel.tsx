import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  CheckboxField,
  FormError,
  SubmitButton,
  TextField,
} from '../../components/ui/form'
import { ErrorNote, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { TeaRef } from '../../lib/household'
import type { Listing, ListingInput, ListingPatch } from '../../lib/shop'
import { TeaPicker } from '../stock/TeaPicker'
import { formatListingPrice, formatPack, priceMajorInput, readOptionalGrams, readPriceMajor } from './format'
import { useCreateListing, useDeleteListing, useShopListings, useUpdateListing } from './queries'

const PAGE_SIZE = 50

type Draft = {
  packGrams: string
  price: string
  currency: string
  productUrl: string
  isAvailable: boolean
}

type DraftErrors = { pack?: string; price?: string; tea?: string }

function emptyDraft(): Draft {
  return { packGrams: '', price: '', currency: '', productUrl: '', isAvailable: true }
}

function draftFrom(listing: Listing): Draft {
  return {
    packGrams: listing.pack_grams === null ? '' : String(listing.pack_grams),
    price: priceMajorInput(listing.price_minor),
    currency: listing.currency ?? '',
    productUrl: listing.product_url ?? '',
    isAvailable: listing.is_available,
  }
}

/** The four fields both the create and the edit form share. Extracted because a listing
 *  has exactly one interesting shape and two endpoints that take it. */
function DraftFields({
  idPrefix,
  draft,
  errors,
  onChange,
}: {
  idPrefix: string
  draft: Draft
  errors: DraftErrors
  onChange: (draft: Draft) => void
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <TextField
          id={`${idPrefix}-pack`}
          label="Pack size"
          type="number"
          min={0}
          step={1}
          value={draft.packGrams}
          onChange={(packGrams) => onChange({ ...draft, packGrams })}
          error={errors.pack}
          hint="Grams."
        />
        <TextField
          id={`${idPrefix}-price`}
          label="Price"
          value={draft.price}
          onChange={(price) => onChange({ ...draft, price })}
          error={errors.price}
          placeholder="8.50"
        />
        <TextField
          id={`${idPrefix}-currency`}
          label="Currency"
          value={draft.currency}
          onChange={(currency) => onChange({ ...draft, currency })}
          placeholder="PLN"
        />
        <TextField
          id={`${idPrefix}-url`}
          label="Product page"
          type="url"
          value={draft.productUrl}
          onChange={(productUrl) => onChange({ ...draft, productUrl })}
          placeholder="https://…"
        />
      </div>
      <CheckboxField
        id={`${idPrefix}-available`}
        label="In stock"
        checked={draft.isAvailable}
        onChange={(isAvailable) => onChange({ ...draft, isAvailable })}
      />
    </>
  )
}

function validate(draft: Draft): { errors: DraftErrors; pack?: number; minor?: number } {
  const errors: DraftErrors = {}
  const pack = readOptionalGrams(draft.packGrams)
  if (pack.error) errors.pack = pack.error
  const price = readPriceMajor(draft.price)
  if (price.error) errors.price = price.error
  return { errors, pack: pack.grams, minor: price.minor }
}

function AddListingForm({ shopId, shopSlug }: { shopId: string; shopSlug: string }) {
  const [tea, setTea] = useState<TeaRef | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<DraftErrors>({})
  const create = useCreateListing(shopId)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { errors: found, pack, minor } = validate(draft)
    if (!tea) found.tea = 'Pick which tea this is.'
    setErrors(found)
    if (Object.keys(found).length > 0 || !tea) return

    // Blank boxes come out `undefined` and `JSON.stringify` drops them, so an unpriced
    // listing sends no key rather than an empty string the server has to interpret.
    const input: ListingInput = {
      tea_id: tea.id,
      pack_grams: pack,
      price_minor: minor,
      currency: draft.currency.trim().toUpperCase() || undefined,
      product_url: draft.productUrl.trim() || undefined,
      is_available: draft.isAvailable,
    }

    create.mutate(input, {
      onSuccess: () => {
        setTea(null)
        setDraft(emptyDraft())
        setErrors({})
      },
    })
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      data-testid={`add-listing-form-${shopSlug}`}
      className="space-y-3 rounded-xl border border-brand-200 p-3 dark:border-neutral-800"
    >
      <TeaPicker idPrefix={`listing-${shopId}`} selected={tea} onSelect={setTea} error={errors.tea} />
      <DraftFields idPrefix={`add-listing-${shopId}`} draft={draft} errors={errors} onChange={setDraft} />
      {create.isError && (
        <FormError testId="add-listing-error">{describeApiError(create.error)}</FormError>
      )}
      <div className="sm:w-44">
        <SubmitButton pending={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add listing'}
        </SubmitButton>
      </div>
    </form>
  )
}

function EditListingForm({
  shopId,
  listing,
  onDone,
}: {
  shopId: string
  listing: Listing
  onDone: () => void
}) {
  const [draft, setDraft] = useState<Draft>(draftFrom(listing))
  const [errors, setErrors] = useState<DraftErrors>({})
  const update = useUpdateListing(shopId)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { errors: found, pack, minor } = validate(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // `null`, not omitted: emptying the price box has to *clear* the price, which is the
    // whole reason `ListingPatch`'s fields are `T | null`.
    const patch: ListingPatch = {
      pack_grams: pack ?? null,
      price_minor: minor ?? null,
      currency: draft.currency.trim().toUpperCase() || null,
      product_url: draft.productUrl.trim() || null,
      is_available: draft.isAvailable,
    }

    update.mutate({ listingId: listing.id, patch }, { onSuccess: onDone })
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      data-testid={`edit-listing-form-${listing.id}`}
      className="mt-3 space-y-3"
    >
      <DraftFields
        idPrefix={`edit-listing-${listing.id}`}
        draft={draft}
        errors={errors}
        onChange={setDraft}
      />
      {update.isError && (
        <FormError testId={`edit-listing-error-${listing.id}`}>
          {describeApiError(update.error)}
        </FormError>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save listing'}
          </SubmitButton>
        </div>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * What one shop carries, for an admin.
 *
 * It reads through the *public* listings endpoint rather than an admin one, because
 * there is no admin one — the contract has admin writes hanging off `/admin/shops/{id}`
 * and no admin read to match. That is fine for an approved shop, which is the only kind
 * this panel is opened on: a shop still in the queue has nothing to list yet, and its
 * public detail would 404 anyway.
 */
export function AdminListingsPanel({ shopId, shopSlug }: { shopId: string; shopSlug: string }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const listings = useShopListings(shopSlug, { page: 1, size: PAGE_SIZE })
  const remove = useDeleteListing(shopId)

  const items = listings.data?.items ?? []

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Listings
      </h3>

      {listings.isError && (
        <ErrorNote testId="admin-listings-error">{describeApiError(listings.error)}</ErrorNote>
      )}
      {listings.isPending && <Skeleton className="h-10 w-full" />}

      {!listings.isPending && items.length === 0 && (
        <p data-testid="admin-listings-empty" className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing listed for this shop yet.
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-brand-100 dark:divide-neutral-800">
          {items.map((listing) => (
            <li key={listing.id} className="py-2" data-testid={`admin-listing-${listing.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm text-brand-900 dark:text-brand-100">
                  {listing.tea.name}
                  <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                    {[formatPack(listing.pack_grams), formatListingPrice(listing)]
                      .filter(Boolean)
                      .join(' · ') || 'no pack size or price'}
                  </span>
                </span>
                {confirming === listing.id ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      testId={`confirm-delete-listing-${listing.id}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(listing.id, { onSettled: () => setConfirming(null) })
                      }
                    >
                      Really remove
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      testId={`edit-listing-${listing.id}`}
                      ariaLabel={`Edit the ${listing.tea.name} listing`}
                      onClick={() => setEditing(editing === listing.id ? null : listing.id)}
                    >
                      {editing === listing.id ? 'Close' : 'Edit'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      testId={`delete-listing-${listing.id}`}
                      ariaLabel={`Remove the ${listing.tea.name} listing`}
                      onClick={() => setConfirming(listing.id)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>

              {editing === listing.id && (
                <EditListingForm
                  shopId={shopId}
                  listing={listing}
                  onDone={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <AddListingForm shopId={shopId} shopSlug={shopSlug} />
    </div>
  )
}

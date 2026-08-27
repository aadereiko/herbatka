import { useState } from 'react'
import type { FormEvent } from 'react'

import { FormError, SubmitButton, TextAreaField, TextField } from '../../components/ui/form'
import { IMAGE_UPLOAD_HINT, ImageUploadField } from '../../components/ui/image-upload'
import type { PinErrors, ShopDraft } from './draft'
import { EMPTY_SHOP_DRAFT, hasPinErrors, validatePin } from './draft'
import { ShopPinField } from './ShopPinField'

/**
 * One shop form, three callers: a signed-in visitor suggesting a shop, an admin creating
 * one, an admin editing one. It takes the submit function and an initial draft rather
 * than knowing which of the three it is — the endpoint and the body shape are the
 * caller's business, and `draft.ts` is where the two body shapes are made.
 *
 * `withImage` and `withPin` are the two things it does branch on, both for the same
 * reason: the suggestion endpoint's body carries neither a picture nor a pin, and
 * rendering a control whose value would be silently dropped is worse than not offering
 * it. Two props rather than one `isAdmin`, because a control the form draws is a
 * question about this form and not about who is looking at it.
 *
 * Only `name` is required, here and on the server. Everything else about a shop is
 * something somebody may simply not know while standing in it, and a form that refuses
 * to accept "Herbaciarnia u Kruka, Kraków" until a postcode is typed is a form that gets
 * nothing at all.
 */
export function ShopForm({
  idPrefix,
  submitLabel,
  pendingLabel,
  pending,
  error,
  initial = EMPTY_SHOP_DRAFT,
  withImage = false,
  withPin = false,
  geocodeShopId,
  onSubmit,
}: {
  idPrefix: string
  submitLabel: string
  pendingLabel: string
  pending: boolean
  error?: string | null
  initial?: ShopDraft
  withImage?: boolean
  withPin?: boolean
  /** Passed straight through to the pin editor; only an already-created shop has one. */
  geocodeShopId?: string
  onSubmit: (draft: ShopDraft) => void
}) {
  const [draft, setDraft] = useState<ShopDraft>(initial)
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [pinErrors, setPinErrors] = useState<PinErrors>({})

  function set<K extends keyof ShopDraft>(key: K, value: ShopDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function setPin(latitude: string, longitude: string) {
    setDraft((current) => ({ ...current, latitude, longitude }))
    // Clicking the map is how somebody answers "give a longitude too", so the complaint
    // has to go away when they do — a stale error under a box they have just fixed is
    // how a form ends up looking broken while being fine.
    setPinErrors({})
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = draft.name.trim() ? undefined : 'Give the shop a name.'
    // Only when the editor is on screen: a suggestion never sends coordinates, so
    // validating a pair of fields nobody can see would be a refusal with nothing to fix.
    const nextPin = withPin ? validatePin(draft) : {}

    setNameError(nextName)
    setPinErrors(nextPin)
    if (nextName || hasPinErrors(nextPin)) return

    onSubmit(draft)
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid={`${idPrefix}-form`} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-name`}
          label="Name"
          value={draft.name}
          onChange={(value) => set('name', value)}
          error={nameError}
          placeholder="Herbaciarnia u Kruka"
        />
        <TextField
          id={`${idPrefix}-website`}
          label="Website"
          type="url"
          value={draft.website}
          onChange={(value) => set('website', value)}
          placeholder="https://…"
        />
        <TextField
          id={`${idPrefix}-city`}
          label="City"
          value={draft.city}
          onChange={(value) => set('city', value)}
          placeholder="Kraków"
        />
        <TextField
          id={`${idPrefix}-country`}
          label="Country"
          value={draft.country}
          onChange={(value) => set('country', value)}
          placeholder="Poland"
        />
        <div className="sm:col-span-2">
          <TextField
            id={`${idPrefix}-address`}
            label="Address"
            value={draft.address}
            onChange={(value) => set('address', value)}
            hint="Leave it blank for a shop that only exists online."
          />
        </div>
      </div>

      <TextAreaField
        id={`${idPrefix}-description`}
        label="Description"
        value={draft.description}
        onChange={(value) => set('description', value)}
      />

      {withPin && (
        <ShopPinField
          idPrefix={idPrefix}
          latitude={draft.latitude}
          longitude={draft.longitude}
          errors={pinErrors}
          geocodeShopId={geocodeShopId}
          onChange={setPin}
        />
      )}

      {withImage && (
        <ImageUploadField
          id={`${idPrefix}-image`}
          label="Photo"
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          hint={IMAGE_UPLOAD_HINT}
          previewAlt={draft.name ? `Photo of ${draft.name}` : 'The photo you chose'}
        />
      )}

      {error && <FormError testId={`${idPrefix}-error`}>{error}</FormError>}

      <div className="sm:w-52">
        <SubmitButton pending={pending}>{pending ? pendingLabel : submitLabel}</SubmitButton>
      </div>
    </form>
  )
}

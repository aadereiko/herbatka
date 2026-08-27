import type { ShopDetail, ShopInput, ShopPatch } from '../../lib/shop'

/**
 * What the shop form holds, and how it becomes each of the two bodies the API takes.
 *
 * The form is used three ways — a visitor suggesting a shop, an admin creating one, an
 * admin editing one — and the first two POST while the third PATCHes. Rather than three
 * forms, or one form that knows which endpoint it is feeding, it edits this and the
 * caller converts.
 *
 * The conversion is where the difference actually lives, and it is not cosmetic:
 *
 *  - **Creating**, an empty box means "I have nothing to say", so the key is omitted and
 *    the server's own default applies. `JSON.stringify` drops `undefined` outright.
 *  - **Editing**, an emptied box means "delete what was there", which is `null` — and is
 *    the only reason `ShopPatch`'s fields are `T | null` rather than optional-only.
 *
 * A single "blank means blank" rule would get one of the two wrong. Sending `null` on
 * create asks the server to store an explicit nothing; omitting on edit is how somebody
 * clears a shop's dead website and finds it still there after a reload.
 */
export type ShopDraft = {
  name: string
  website: string
  address: string
  city: string
  country: string
  description: string
  /** Already a URL by the time it lands here — `ImageUploadField` does the upload and
   *  hands back what the server stored. `null` is "no picture", cleared or never set. */
  imageUrl: string | null
  /**
   * The pin, as *strings*, and that is on purpose.
   *
   * These are bound to two number boxes as well as to a map, and a number box has to be
   * allowed to hold `-` and `50.` while somebody is halfway through typing. Storing
   * `number | null` means every keystroke round-trips through a parse that turns `50.`
   * into `50` and moves the caret, which is the classic way a coordinate box becomes
   * impossible to type into. They are parsed once, on submit.
   */
  latitude: string
  longitude: string
}

export const EMPTY_SHOP_DRAFT: ShopDraft = {
  name: '',
  website: '',
  address: '',
  city: '',
  country: '',
  description: '',
  imageUrl: null,
  latitude: '',
  longitude: '',
}

/* ------------------------------------------------------------------- coordinates */

const COORD_LIMIT = { latitude: 90, longitude: 180 }

export type CoordinateKind = 'latitude' | 'longitude'

/** A stored coordinate as something to put in a text box. Blank for no pin — never
 *  "null", and never 0, which is a real place off the coast of Ghana. */
export function coordinateInput(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Blank is "no pin" and is not an error; anything else has to be a real number inside
 * the range that kind of coordinate has.
 *
 * The range check is the point. A longitude of 500 is not a slow map, it is a row the
 * server stores and every later query quietly skips, and finding out months later that
 * one shop has never appeared on the map is much worse than a red line under a box.
 */
export function readCoordinate(raw: string, kind: CoordinateKind): { value?: number; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  const value = Number(trimmed)
  const limit = COORD_LIMIT[kind]
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    return { error: `Use a number between -${limit} and ${limit}, or leave it blank.` }
  }
  return { value }
}

export type PinErrors = { latitude?: string; longitude?: string }

/**
 * Both halves or neither.
 *
 * Half a pin is not a place, and the server will happily store one — a shop with a
 * latitude and no longitude simply never appears on a map again, silently. Catching it
 * here is the difference between a sentence under a box and a shop nobody can find.
 */
export function validatePin(draft: ShopDraft): PinErrors {
  const errors: PinErrors = {}
  const latitude = readCoordinate(draft.latitude, 'latitude')
  const longitude = readCoordinate(draft.longitude, 'longitude')

  if (latitude.error) errors.latitude = latitude.error
  if (longitude.error) errors.longitude = longitude.error
  if (latitude.error || longitude.error) return errors

  if (latitude.value !== undefined && longitude.value === undefined) {
    errors.longitude = 'Give a longitude too, or clear the pin.'
  }
  if (longitude.value !== undefined && latitude.value === undefined) {
    errors.latitude = 'Give a latitude too, or clear the pin.'
  }
  return errors
}

export function hasPinErrors(errors: PinErrors): boolean {
  return Boolean(errors.latitude || errors.longitude)
}

/** A `ShopDetail` and not a `ShopSummary`, deliberately: `address` and `description`
 *  exist only on the detail, and prefilling a form from a shape that lacks them would
 *  make the resulting PATCH delete both. */
export function draftFromShop(shop: ShopDetail): ShopDraft {
  return {
    name: shop.name,
    website: shop.website ?? '',
    address: shop.address ?? '',
    city: shop.city ?? '',
    country: shop.country ?? '',
    description: shop.description ?? '',
    imageUrl: shop.image_url,
    latitude: coordinateInput(shop.latitude),
    longitude: coordinateInput(shop.longitude),
  }
}

function omitBlank(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function clearBlank(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * `asAdmin` is false for `POST /shops` and true for `POST /admin/shops`, and it governs
 * the two fields the suggestion body does not carry — for two different reasons that
 * happen to land on one flag.
 *
 * The **picture** is a product decision: the server would take `image_url` on either,
 * and we choose not to offer an upload control to somebody who has not been vetted yet.
 * The **pin** is a contract limit: `POST /shops` does not accept `latitude` at all.
 *
 * One boolean rather than two, because no caller has ever wanted one without the other
 * and a second parameter would be two booleans at every call site to express a
 * distinction that has never once mattered. Was `withImage` before the pin existed.
 */
export function toShopInput(draft: ShopDraft, asAdmin: boolean): ShopInput {
  return {
    name: draft.name.trim(),
    website: omitBlank(draft.website),
    address: omitBlank(draft.address),
    city: omitBlank(draft.city),
    country: omitBlank(draft.country),
    description: omitBlank(draft.description),
    image_url: asAdmin ? (draft.imageUrl ?? undefined) : undefined,
    // Omitted rather than null on create, like every other blank field: the key vanishes
    // from the body and the server's own default stands.
    latitude: asAdmin ? readCoordinate(draft.latitude, 'latitude').value : undefined,
    longitude: asAdmin ? readCoordinate(draft.longitude, 'longitude').value : undefined,
  }
}

/** Blank means `null` here rather than "omit", so clearing a pin actually takes it off
 *  the map — the same rule the rest of the patch follows. */
function clearCoordinate(raw: string, kind: CoordinateKind): number | null {
  return readCoordinate(raw, kind).value ?? null
}

export function toShopPatch(draft: ShopDraft): ShopPatch {
  return {
    name: draft.name.trim(),
    website: clearBlank(draft.website),
    address: clearBlank(draft.address),
    city: clearBlank(draft.city),
    country: clearBlank(draft.country),
    description: clearBlank(draft.description),
    image_url: draft.imageUrl,
    latitude: clearCoordinate(draft.latitude, 'latitude'),
    longitude: clearCoordinate(draft.longitude, 'longitude'),
  }
}

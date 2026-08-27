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
}

export const EMPTY_SHOP_DRAFT: ShopDraft = {
  name: '',
  website: '',
  address: '',
  city: '',
  country: '',
  description: '',
  imageUrl: null,
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

/** `withImage` is false for `POST /shops`, whose documented body has no picture in it,
 *  and true for `POST /admin/shops` — see the note on `ShopInput`. */
export function toShopInput(draft: ShopDraft, withImage: boolean): ShopInput {
  return {
    name: draft.name.trim(),
    website: omitBlank(draft.website),
    address: omitBlank(draft.address),
    city: omitBlank(draft.city),
    country: omitBlank(draft.country),
    description: omitBlank(draft.description),
    image_url: withImage ? (draft.imageUrl ?? undefined) : undefined,
  }
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
  }
}

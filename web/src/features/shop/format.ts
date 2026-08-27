import { formatGrams, formatPrice } from '../../lib/format'
import type { Listing, ShopSummary } from '../../lib/shop'

/** "Kraków, Poland", "Poland", or null when the shop has said neither. Returning null
 *  rather than a placeholder lets the caller drop the line entirely — an online-only
 *  shop has no city, and a card reading "— , —" says nothing twice. */
export function describePlace(shop: ShopSummary): string | null {
  const parts = [shop.city, shop.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * The price of a pack, as money — never the raw `price_minor`.
 *
 * Null when the shop has not published one, which is common and not an error. The whole
 * point of returning null is that the caller says "Price not listed" instead of "0.00",
 * because a listing rendering £0.00 reads as free rather than as unknown.
 */
export function formatListingPrice(listing: Listing): string | null {
  return formatPrice(listing.price_minor, listing.currency)
}

/** "50 g", or null when the shop has not said how big the bag is. */
export function formatPack(packGrams: number | null): string | null {
  return packGrams === null ? null : formatGrams(packGrams)
}

/* ------------------------------------------------- money, in and out of a text box */

/**
 * Minor units to the number a person types into a price box: 450 → "4.50".
 *
 * Empty for null, not "0.00". Every form that prefills a price — the buy form, the admin
 * listing editor — needs the same rule, and prefilling zero is a claim the tea was free
 * that somebody then has to notice and delete.
 */
export function priceMajorInput(minor: number | null): string {
  return minor === null ? '' : (minor / 100).toFixed(2)
}

/**
 * And back: "4.50" → 450, blank → nothing at all.
 *
 * Blank is a legitimate answer meaning "I would rather not say", so it is neither an
 * error nor a zero. Anything else has to be a real non-negative number, because "abt 5"
 * silently becoming `NaN` and then `null` in the database is worse than a refusal.
 *
 * The `Math.round` is not cosmetic: `4.55 * 100` is 454.99999999999994 in binary
 * floating point, and storing 454 minor units for a 4.55 price is the kind of bug that
 * shows up as a one-grosz discrepancy months later.
 */
export function readPriceMajor(raw: string): { minor?: number; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  const major = Number(trimmed)
  if (!Number.isFinite(major) || major < 0) return { error: 'Use a number, like 4.50.' }
  return { minor: Math.round(major * 100) }
}

/** `''` means "not given" and is not an error; anything else has to be a real
 *  non-negative number of grams. */
export function readOptionalGrams(raw: string): { grams?: number; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  const grams = Number(trimmed)
  if (!Number.isFinite(grams) || grams < 0) {
    return { error: 'Use a number of grams, or leave it blank.' }
  }
  return { grams }
}

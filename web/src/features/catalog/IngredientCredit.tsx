import type { Ingredient } from '../../lib/catalog'

/**
 * Who took the photograph on an ingredient card, and under what licence.
 *
 * **This is a legal obligation rendered as UI, not a nicety.** Most of the seeded
 * photographs are Wikimedia Commons files under CC BY or CC BY-SA, and those licences are
 * satisfied only while the credit is *shown to a person* — a comment in the seed file, or
 * a column nobody renders, discharges nothing. That is why this is on the card rather than
 * on a colophon page: the card is where the picture is used.
 *
 * **Two links, because there are two things to point at.** The name goes to the Commons
 * file page, which is where the licence, the full author record and the edit history
 * actually live; the licence name goes to the deed, because CC asks for the licence notice
 * to be linked and "CC BY-SA 4.0" as bare text is an assertion rather than a reference.
 * This is the reason the API carries four fields instead of one pre-formatted string:
 * splitting a display line back into two hrefs is exactly where credits go wrong.
 *
 * **Absent for an admin's own upload, and that asymmetry is correct.** Our photograph of
 * our clove needs nobody's permission, so there is nobody to credit — `image_attribution`
 * is null and this renders nothing. `catalog.update_ingredient` clears the credit whenever
 * the picture changes, so the case this must never hit is a stale credit naming a stranger
 * under somebody else's photograph.
 *
 * **Quiet on purpose.** Smallest type on the card, muted, last line, no border. The
 * ingredient's tasting note is what the page is for; this has to be present and reachable,
 * not noticed.
 */
export function IngredientCredit({ ingredient }: { ingredient: Ingredient }) {
  // `image_attribution` is the one that decides, not `image_url`: a picture with nobody to
  // credit is the normal state for an upload, and printing an empty "Photo:" under it
  // would announce a gap where there is none.
  if (!ingredient.image_attribution) return null

  return (
    <p
      data-testid={`ingredient-credit-${ingredient.slug}`}
      className="mt-2 text-[0.6875rem] leading-tight text-neutral-500 dark:text-neutral-400"
    >
      {/* "Photo" rather than a camera glyph: this line is read, rarely, by somebody
          checking provenance, and an icon would make them guess. */}
      Photo{' '}
      {ingredient.image_source_url ? (
        <a
          href={ingredient.image_source_url}
          // Somebody else's site in somebody else's tab. `noopener` is the one that
          // matters — without it the opened page gets a handle on this one through
          // `window.opener` and can navigate it wherever it likes.
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {ingredient.image_attribution}
        </a>
      ) : (
        ingredient.image_attribution
      )}
      {ingredient.image_license && (
        <>
          {' · '}
          {ingredient.image_license_url ? (
            <a
              href={ingredient.image_license_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {ingredient.image_license}
            </a>
          ) : (
            ingredient.image_license
          )}
        </>
      )}
    </p>
  )
}

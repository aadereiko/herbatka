import type { ReactNode } from 'react'

import type { IngredientCategory } from '../../lib/catalog'

/**
 * A picture of an ingredient, or a drawing of what kind of thing it is.
 *
 * `EntityImage` already does "the photo, or the leaf" for teas, shops and households, and
 * this is deliberately *not* that. Two reasons, and the second is the real one:
 *
 *  - **A leaf standing in for "leaf" is a tautology, and for "clove" it is a lie.** The
 *    shared placeholder works where every subject is the same kind of thing — a tea, a
 *    shop — and stops working the moment the subject has a category. Six drawings say
 *    something ("this is a spice") where one drawing says only "no picture".
 *  - **There are no photos to seed, and there never will be a batch of them.** A tea gets
 *    its picture from a packet shot; an ingredient would need thirty-nine photographs
 *    nobody has. Inventing URLs for files that do not exist would fill the page with
 *    broken-image icons, which is strictly worse than the wall of names we started with.
 *    So the illustration is not a temporary state to be embarrassed about — it is what
 *    most rows will show for good, and it is drawn to look deliberate.
 *
 * Kept in `features/catalog/` rather than `components/ui/`: it is not a general primitive
 * — it takes an `IngredientCategory` — and one feature owning it means nobody has to
 * reason about what a seventh caller would want.
 *
 * **On the line work.** Flat, chunky, `currentColor`, no fills, round joins, nothing
 * smaller than a stroke width across. A restyle that retints `--color-brand-*` or wraps
 * these in a wooden frame gets all six for free, because the only colours here are the
 * two Tailwind tokens on the wrapper. Anything airbrushed or realistic would have to be
 * redrawn instead.
 */
const CATEGORY_ART: Record<IngredientCategory, ReactNode> = {
  // A single leaf, veins and all — greens, blacks, rooibos, matcha.
  leaf: (
    <>
      <path d="M32 9C47 17 51 37 32 55 13 37 17 17 32 9Z" />
      <path d="M32 13v40" />
      <path d="M32 27l11-7" />
      <path d="M32 27l-11-7" />
      <path d="M32 39l12-8" />
      <path d="M32 39l-12-8" />
    </>
  ),
  // A sprig: paired leaves up a stem, the way mint or verbena is picked.
  herb: (
    <>
      <path d="M32 56V14" />
      <path d="M32 45c-8 0-13-5-13-12 8 0 13 5 13 12Z" />
      <path d="M32 45c8 0 13-5 13-12-8 0-13 5-13 12Z" />
      <path d="M32 31c-7 0-11-5-11-11 7 0 11 5 11 11Z" />
      <path d="M32 31c7 0 11-5 11-11-7 0-11 5-11 11Z" />
      <circle cx="32" cy="11" r="3" />
    </>
  ),
  // Five round petals. Round, so it never reads as the pointed star below.
  flower: (
    <>
      <circle cx="32" cy="19" r="8.5" />
      <circle cx="44.4" cy="28" r="8.5" />
      <circle cx="39.6" cy="42.5" r="8.5" />
      <circle cx="24.4" cy="42.5" r="8.5" />
      <circle cx="19.6" cy="28" r="8.5" />
      <circle cx="32" cy="32" r="5" />
    </>
  ),
  // Star anise, which is the one spice with a silhouette everybody already knows.
  spice: (
    <>
      <path d="M32 10 36.5 24.2 51.1 21 41 32 51.1 43 36.5 39.8 32 54 27.5 39.8 12.9 43 23 32 12.9 21 27.5 24.2Z" />
      <circle cx="32" cy="32" r="4" />
    </>
  ),
  // A round fruit with a leaf on the stalk — apple, orange, rosehip, mango.
  fruit: (
    <>
      <circle cx="31" cy="38" r="17" />
      <path d="M32 21V10" />
      <path d="M32 13c7-6 15-5 18-2-4 6-12 8-18 2Z" />
    </>
  ),
  // A caddy, for the things that are none of the above. Toasted rice is not a plant part.
  other: (
    <>
      <rect x="17" y="21" width="30" height="34" rx="5" />
      <rect x="22" y="10" width="20" height="10" rx="3" />
      <path d="M17 33h30" />
    </>
  ),
}

export function IngredientImage({
  src,
  alt,
  category,
  className,
  testId,
}: {
  src: string | null
  /** `''` where the name is already right beside the picture, as it is on a card. */
  alt: string
  category: IngredientCategory
  className: string
  testId?: string
}) {
  if (!src) {
    return (
      <div
        // Nothing here a screen reader needs. It says "this is a flower", which the
        // category badge two lines down already says in words.
        aria-hidden="true"
        data-testid={testId ? `${testId}-placeholder` : undefined}
        // The category, in the DOM, so a test can prove that a *spice* gets the spice
        // drawing rather than merely that some drawing appeared.
        data-category={category}
        className={`grid place-items-center bg-brand-100 text-brand-700 dark:bg-neutral-800 dark:text-brand-200 ${className}`}
      >
        <svg
          viewBox="0 0 64 64"
          className="h-3/5 w-3/5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          {CATEGORY_ART[category]}
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      data-testid={testId}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  )
}

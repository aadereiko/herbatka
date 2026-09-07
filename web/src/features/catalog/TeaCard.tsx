import { Link } from 'react-router'

import { EntityImage } from '../../components/ui/image'
import { Badge, PendingBadge } from '../../components/ui/page'
import type { TeaSummary } from '../../lib/catalog'
import { CAFFEINE_LEVEL_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'
import { FavouriteStar } from '../favourite/FavouriteStar'
import { formatAverage, formatScore } from '../review/format'
import { pluralise } from './format'

/**
 * "★ 8.2 · 14", or an invitation when nobody has rated it.
 *
 * The invitation is the whole reason this is a function rather than two lines of JSX: an
 * unrated tea rendering "0" or "0.0" would read as a terrible tea, and a grid of them
 * would read as a terrible catalog. The star and the numbers are `aria-hidden` with a
 * spoken sentence beside them — "8.2 · 14" is not something a screen reader can make
 * sense of on its own.
 */
function Rating({ tea }: { tea: TeaSummary }) {
  const average = tea.average_score
  const count = tea.review_count
  // `count > 0` rather than `count !== 0` so a server that has not shipped these fields
  // yet lands in the same branch as an unrated tea instead of rendering "NaN · undefined".
  const rated = average != null && count > 0

  if (!rated) {
    return (
      <p data-testid="tea-card-unrated" className="text-xs text-neutral-500 dark:text-neutral-400">
        Not rated yet
      </p>
    )
  }

  return (
    <p data-testid="tea-card-rating" className="text-sm text-neutral-700 dark:text-neutral-300">
      <span className="sr-only">
        Rated {formatAverage(average)} out of 10, from {pluralise(count, 'review')}.
      </span>
      <span aria-hidden="true" className="font-medium tabular-nums">
        {`★ ${formatAverage(average)} · ${count}`}
      </span>
    </p>
  )
}

/**
 * One tea in the browse grid. The whole card is the link — a tap target the size of a
 * card rather than the size of a word, because this list is read on a phone.
 *
 * Which is exactly why the star is a *sibling* of that link rather than something inside
 * it: a `<button>` nested in an `<a>` is invalid markup, and in practice it navigates to
 * the tea instead of starring it. Absolutely positioned over the corner of the picture,
 * so it costs no layout, and absent altogether for a signed-out reader.
 */
export function TeaCard({ tea }: { tea: TeaSummary }) {
  return (
    <li className="relative list-none">
      <div className="absolute right-2 top-2 z-10">
        <FavouriteStar kind="tea" slug={tea.slug} name={tea.name} isFavourite={tea.is_favourite} />
      </div>
      <Link
        to={`/teas/${tea.slug}`}
        data-testid="tea-card"
        // Borderless, after the reference: a big image well, then the name under it in
        // plain type. The old card was a bordered box with the picture inset in it, which
        // is a different idea — there the card was the object and the photograph was a
        // detail on it. Here the *tea* is the object and the card is only the space it
        // occupies, so the only thing separating one from the next is the gap.
        //
        // Which is why the hover is on the image rather than the box: with no edge to
        // light up, the picture receding slightly is the whole affordance.
        className="group flex h-full flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {/* A tall image well rather than a 128px strip. The reference gives the picture
            most of the card and the words a caption's worth underneath, and on a catalog
            where two thirds of the teas have no photograph the well is doing real work:
            it makes the drawn leaf look like a chosen placeholder rather than a gap.

            `aspect-[4/5]` rather than a fixed height, so a row of cards lines up at every
            width without the grid having to know how tall a card is. */}
        <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-neutral-800 transition-opacity duration-200 group-hover:opacity-90">
          <EntityImage src={tea.image_url} alt="" className="size-full" testId="tea-card-image" />
        </div>

        <div className="flex flex-1 flex-col gap-2 pt-3">
          <div>
            <h3 className="text-base font-medium text-brand-900 group-hover:underline dark:text-brand-100">
              {tea.name}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {tea.brand ? tea.brand.name : 'Unbranded'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Rating tea={tea} />
            {/* Your own score sits beside the average rather than replacing it, on the
                card for the same reason as on the detail page: the two are different
                facts, and a grid where you cannot tell which teas you have already
                rated is a grid you rate the same tea in twice. */}
            {tea.my_score != null && (
              <span data-testid="tea-card-my-score">
                <Badge tone="brand">You rated {formatScore(tea.my_score)}</Badge>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{TEA_TYPE_LABELS[tea.tea_type]}</Badge>
            <Badge tone={tea.caffeine_level === 'none' ? 'neutral' : 'amber'}>
              {CAFFEINE_LEVEL_LABELS[tea.caffeine_level]}
            </Badge>
            {!tea.is_approved && <PendingBadge />}
          </div>

          {tea.primary_ingredients.length > 0 && (
            <p className="mt-auto text-xs text-neutral-500 dark:text-neutral-400">
              {tea.primary_ingredients.join(' · ')}
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}

import { Link } from 'react-router'

import { EntityImage } from '../../components/ui/image'
import { Badge } from '../../components/ui/page'
import type { TeaSummary } from '../../lib/catalog'
import { CAFFEINE_LEVEL_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'
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

/** One tea in the browse grid. The whole card is the link — a tap target the size of a
 *  card rather than the size of a word, because this list is read on a phone. */
export function TeaCard({ tea }: { tea: TeaSummary }) {
  return (
    <li className="list-none">
      <Link
        to={`/teas/${tea.slug}`}
        data-testid="tea-card"
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* The leaf placeholder this card introduced in M2 now lives in `EntityImage`,
            because M6 gives shops and households pictures too and three copies of one
            fallback is three chances to pick a different emoji. Empty alt: the whole
            card is one link and the tea's name is its text. */}
        <EntityImage src={tea.image_url} alt="" className="h-32 w-full" testId="tea-card-image" />

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">
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
            {!tea.is_approved && <Badge tone="rose">Awaiting review</Badge>}
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

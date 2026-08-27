import type { ReactNode } from 'react'

import { Panel } from '../../components/ui/page'
import type { TeaDetail } from '../../lib/catalog'
import type { RatingRollup, Subscore } from '../../lib/review'
import { SUBSCORES, SUBSCORE_LABELS } from '../../lib/review'
import { pluralise } from '../catalog/format'
import { formatAverage, formatScore } from './format'

type GivenAverage = { key: Subscore; value: number }

/** The per-aspect averages, and only the ones anybody has actually given. A row of three
 *  em-dashes tells the reader nothing they could not infer from its absence.
 *
 *  Tea-only, and stays that way: a shop has no aroma. It is handed to `RatingSummary` as
 *  `details` rather than read out of the rollup, which is what lets the same summary
 *  serve both without growing a "what am I a summary of" flag. */
export function SubscoreAverages({ tea }: { tea: TeaDetail }) {
  const values: Record<Subscore, number | null> = {
    aroma: tea.average_aroma,
    flavour: tea.average_flavour,
    aftertaste: tea.average_aftertaste,
  }
  const given = SUBSCORES.map((key) => ({ key, value: values[key] })).filter(
    (entry): entry is GivenAverage => entry.value != null,
  )
  if (given.length === 0) return null

  return (
    <dl
      data-testid="subscore-averages"
      className="mt-4 grid grid-cols-3 gap-2 border-t border-brand-100 pt-4 dark:border-neutral-800"
    >
      {given.map(({ key, value }) => (
        <div key={key} data-testid={`average-${key}`} className="text-center">
          <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {SUBSCORE_LABELS[key]}
          </dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-brand-900 dark:text-brand-100">
            {formatAverage(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * What everybody thinks, and — kept visibly apart from it — what you thought.
 *
 * The separation is the point of the whole screen. Your 9 is one of the numbers inside
 * the 8.2, and a design that shows only one of them leaves you hunting for whether your
 * rating registered at all. So the average is the big number, your score is its own
 * labelled block beside it, and neither is ever rendered as the other's fallback.
 *
 * M8 gives shops the same three numbers, so this takes a `RatingRollup` rather than a
 * `TeaDetail` — the only tea-shaped thing left on it is the optional `details` slot, which
 * the tea page fills with its per-aspect averages and the shop page leaves empty. The copy
 * for the "nobody has rated this" branch is a prop for the same reason: "be the first to
 * say what it is like" is about a cup, and a shop wants its own sentence.
 */
export function RatingSummary({
  rating,
  emptyTitle,
  emptyBody,
  details,
}: {
  rating: RatingRollup
  emptyTitle: string
  emptyBody: string
  /** Rendered under the numbers, and only when there are numbers. */
  details?: ReactNode
}) {
  const average = rating.average_score
  const count = rating.review_count
  const mine = rating.my_score
  // `count > 0` rather than `count !== 0`: this also survives an API that has not shipped
  // the field yet and sends nothing, where "0 reviews" would be a guess dressed as a fact.
  const rated = average != null && count > 0

  return (
    <Panel ariaLabel="Ratings" testId="rating-summary">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {rated ? (
          <div data-testid="rating-average">
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-semibold tabular-nums text-brand-900 dark:text-brand-100">
                {formatAverage(average)}
              </span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">out of 10</span>
            </p>
            <p
              data-testid="review-count"
              className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
            >
              from {pluralise(count, 'review')}
            </p>
          </div>
        ) : (
          <div data-testid="rating-empty">
            <h2 className="text-lg font-semibold text-brand-900 dark:text-brand-100">
              {emptyTitle}
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{emptyBody}</p>
          </div>
        )}

        {/* Outside both branches: your score belongs beside the crowd's number whether or
            not there is a crowd, and it reads the same either way. */}
        {mine != null && (
          <div
            data-testid="your-score"
            className="rounded-xl bg-brand-100 px-4 py-2 text-center dark:bg-brand-900"
          >
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
              You rated {formatScore(mine)}
            </p>
            <p className="text-xs text-brand-800 dark:text-brand-200">out of 10</p>
          </div>
        )}
      </div>

      {rated && details}
    </Panel>
  )
}

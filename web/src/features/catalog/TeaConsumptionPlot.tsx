import { useState } from 'react'

import type { TeaSeries, TeaWeek } from '../../lib/catalog'
import { formatGrams } from '../../lib/format'

/**
 * How much of this tea you have been drinking, by week.
 *
 * ## Why columns, and why not a library
 *
 * The data's job is change over time, and the values are *discrete weekly totals* rather
 * than samples of a continuous quantity — so columns, not a line. A line drawn through
 * twelve weekly totals implies something existed between them, and nothing did.
 *
 * It is plain HTML rather than SVG or a charting dependency for three reasons: twelve
 * divs are responsive for free where a fixed viewBox is not (and scaling an SVG scales
 * its type, which is the usual reason small embedded charts have unreadable labels); the
 * marks are real DOM nodes, so hover and focus need no hit-testing; and a chart library
 * for one twelve-bar plot is 60 kB to draw twelve rectangles.
 *
 * ## The specs are not arbitrary
 *
 * Columns cap at 24px and never fill their slot — the leftover is air. The data-end is
 * rounded 4px and the baseline is square, because the baseline is a real edge and the top
 * is where the value stops. One hairline gridline at the maximum, and no y-axis at all:
 * direct labels beat gridlines, gridlines beat an axis, and with one labelled extreme the
 * axis has nothing left to say.
 *
 * ## Zero weeks are drawn differently from small weeks
 *
 * A week with nothing in it gets a flat tick in the *grid* colour, not a short bar in the
 * series colour. Rendering zero as a 2px stub of the data colour would read as "a little",
 * and the difference between "we drank none" and "we drank a little" is the whole reason
 * somebody looks at this.
 *
 * ## Accessibility
 *
 * The plot is one `role="img"` with a summary label rather than twelve tab stops, and the
 * table underneath carries every value — so nothing here is gated behind hovering, colour
 * or a pointer. There is no legend, deliberately: one series, and the heading above names
 * it. A legend box with a single swatch restates the title and costs a line.
 */

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

function Column({
  week,
  max,
  onHover,
  isActive,
}: {
  week: TeaWeek
  max: number
  onHover: (week: TeaWeek | null) => void
  isActive: boolean
}) {
  const empty = week.grams <= 0
  // A floor of 3% so that a real but tiny week is still a visible mark rather than a
  // hairline indistinguishable from the zero tick below it.
  const height = empty ? 0 : Math.max((week.grams / max) * 100, 3)

  return (
    <div
      className="flex h-full flex-1 items-end justify-center"
      onPointerEnter={() => onHover(week)}
      onPointerLeave={() => onHover(null)}
    >
      {empty ? (
        <span
          aria-hidden="true"
          className="h-0.5 w-full max-w-6 rounded-full bg-[var(--chart-grid)]"
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ height: `${height}%` }}
          className={`w-full max-w-6 rounded-t-[4px] bg-[var(--chart-series)] transition-opacity duration-150 ${
            isActive ? 'opacity-100' : 'opacity-90'
          }`}
        />
      )}
    </div>
  )
}

export function TeaConsumptionPlot({ series, teaName }: { series: TeaSeries; teaName: string }) {
  const [hovered, setHovered] = useState<TeaWeek | null>(null)

  const weeks = series.weeks
  const max = Math.max(...weeks.map((w) => w.grams), 0)
  const peak = weeks.reduce((best, w) => (w.grams > best.grams ? w : best), weeks[0])
  const shown = hovered ?? peak

  return (
    <figure className="m-0" data-testid="tea-plot">
      {/* `mb-2.5`, not `mb-1`. At 4px the maximum gridline — which sits at the very top
          of the plot box — ran through the descenders of the read-out above it. Caught by
          rendering the thing and looking at it, which no amount of reading the markup
          would have found. */}
      <figcaption className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {formatGrams(series.total_grams)} over {weeks.length} weeks · {series.total_brews}{' '}
          {series.total_brews === 1 ? 'cup' : 'cups'}
        </span>
        {/* The read-out for whichever column the pointer is on, falling back to the peak
            so the space is never empty and the chart has a value on it before anyone
            touches it. Fixed height, so hovering does not shift the plot underneath. */}
        <span
          aria-hidden="true"
          data-testid="tea-plot-readout"
          className="text-sm font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {shown && shown.grams > 0
            ? `${weekLabel(shown.week_start)} · ${formatGrams(shown.grams)}`
            : ' '}
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={`Weekly ${teaName} brewed over the last ${weeks.length} weeks. ${formatGrams(
          series.total_grams,
        )} in total. The busiest week was ${weekLabel(peak.week_start)} at ${formatGrams(
          peak.grams,
        )}.`}
        className="relative h-24"
      >
        {/* The one gridline: the maximum. Hairline, solid, one step off the surface. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 border-t border-[var(--chart-grid)]"
        />
        <div className="flex h-full items-end gap-[3px]">
          {weeks.map((week) => (
            <Column
              key={week.week_start}
              week={week}
              max={max}
              isActive={hovered?.week_start === week.week_start}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>

      {/* Three labels, not twelve. The axis carries the shape of the window; the values
          live in the read-out above and the table below. */}
      <div
        aria-hidden="true"
        className="mt-1.5 flex justify-between text-xs text-neutral-500 dark:text-neutral-400"
      >
        <span>{weekLabel(weeks[0].week_start)}</span>
        <span>{weekLabel(weeks[Math.floor(weeks.length / 2)].week_start)}</span>
        <span>this week</span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-brand-700 dark:text-neutral-400 dark:hover:text-brand-300">
          Show the numbers
        </summary>
        <table className="mt-2 w-full text-left text-xs" data-testid="tea-plot-table">
          <caption className="sr-only">
            Weekly {teaName} brewed on your shelves, oldest week first
          </caption>
          <thead className="text-neutral-500 dark:text-neutral-400">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Week of
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Brewed
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Cups
              </th>
            </tr>
          </thead>
          <tbody className="text-neutral-700 dark:text-neutral-300">
            {weeks.map((week) => (
              <tr key={week.week_start} className="border-t border-brand-100 dark:border-neutral-800">
                <th scope="row" className="py-1 font-normal">
                  {weekLabel(week.week_start)}
                </th>
                <td className="py-1 text-right tabular-nums">{formatGrams(week.grams)}</td>
                <td className="py-1 text-right tabular-nums">{week.brews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

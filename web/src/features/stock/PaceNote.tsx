import { BrewIcon } from '../../components/ui/botanical'
import type { StockPace } from '../../lib/household'
import { describeConfidence, formatRate, formatTimeLeft } from './format'

/**
 * How fast a tin is going, and how long that leaves — or an honest blank.
 *
 * ## The null branch is the point
 *
 * `pace` is null whenever the server's ledger has too little to go on: fewer than two
 * outflow events, or less than a week of history. Rendering that as "0 g a week" would
 * be a lie in the most expensive direction — a tin nobody has recorded twice would look
 * like a tin nobody is drinking, and the reader would stop restocking it.
 *
 * So the empty state says what is actually true: not enough recorded yet, and here is
 * what would fix it. That sentence is doing real work — the forecast only exists for
 * people who log their brews, and the one moment somebody is receptive to being told
 * that is when they have just looked for a number and found none.
 *
 * ## Why the evidence is on screen
 *
 * `describeConfidence` prints "from 4 entries over 3 weeks" under every figure. The
 * projection is arithmetic over a handful of rows, and a bare "about 3 weeks left"
 * invites exactly the trust it has not earned. Showing its working costs one line of
 * small type and turns a number into a claim the reader can weigh.
 */
export function PaceNote({ pace, testId }: { pace: StockPace | null; testId?: string }) {
  if (!pace) {
    return (
      <div
        data-testid={testId ? `${testId}-unknown` : undefined}
        className="rounded-sm border border-dashed border-brand-300 bg-brand-50 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400"
      >
        <p className="font-medium text-brand-900 dark:text-brand-100">Not enough history yet</p>
        <p className="mt-1">
          Record a couple of brews a week apart and this will show how fast the tin is going,
          and roughly when it will run out.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid={testId}
      className="rounded-sm border border-brand-200 bg-brand-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="flex items-center gap-2.5">
        <BrewIcon glyph="leaf" className="size-6 shrink-0 text-leaf-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
            {formatRate(pace.grams_per_week)}
            {pace.days_remaining !== null && (
              <>
                {' · '}
                <span data-testid={testId ? `${testId}-left` : undefined}>
                  {formatTimeLeft(pace.days_remaining)}
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {describeConfidence(pace.days_observed, pace.events_counted)}
          </p>
        </div>
      </div>
    </div>
  )
}

import { Link, useParams } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { BrewIcon, TeaBranch } from '../../components/ui/botanical'
import {
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Panel,
  SectionLabel,
  Skeleton,
} from '../../components/ui/page'
import { ApiError, describeApiError } from '../../lib/api'
import { formatGrams } from '../../lib/format'
import type { DrinkerShare, TeaShare, TinForecast } from '../../lib/household'
import { useHousehold } from '../household/queries'
import { formatRate, formatTimeLeft } from './format'
import { useConsumption } from './queries'

/**
 * What a shelf gets through, who drinks it, and what to buy next.
 *
 * The page the ledger was always for. `StockEvent` has been recording signed deltas
 * since M3 with a docstring promising it could answer "who finished the oolong" and "how
 * fast do we get through this"; the tin page answered the first years ago, one row at a
 * time. This answers the second, and it needed no migration to do it — every number here
 * is an aggregate over rows the app already had.
 *
 * ## Two totals that do not add up, on purpose
 *
 * `grams_out` counts everything that left the shelf, including tea thrown away, because
 * that is what actually empties a tin. The per-person and per-tea breakdowns count
 * *brewing* only. So the shares sum to less than the total wherever something was
 * discarded, and that gap is a real fact rather than a rounding error. Crediting somebody
 * with finishing a tin they poured down the sink is how a leaderboard loses its readers.
 */

/** A bar for a share of the total.
 *
 * `aria-hidden`, with the grams and the count in real text beside it. The bar is a
 * comparison aid for people scanning the column, not the data — a screen reader user
 * gets the numbers, which is strictly more than the bar conveys.
 */
function Share({ label, grams, brews, of }: { label: string; grams: number; brews: number; of: number }) {
  const percent = of > 0 ? Math.round((grams / of) * 100) : 0
  return (
    <li className="border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-brand-900 dark:text-brand-100">
          {label}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
          {formatGrams(grams)} · {brews} {brews === 1 ? 'cup' : 'cups'}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-100 dark:bg-neutral-800"
      >
        <div
          className="h-full rounded-full bg-leaf-600 transition-[width] duration-300"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </li>
  )
}

function DrinkerRow({ share, of }: { share: DrinkerShare; of: number }) {
  return (
    <li className="flex items-center gap-3 border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800">
      {/* `user` is null for a departed member: `stock_event.user_id` is ON DELETE SET
          NULL, so their brews stay in a ledger the rest of the household still shares.
          "Somebody" is the honest word, and they get no avatar — initials for a person we
          cannot name would be an invention. */}
      {share.user ? (
        <Avatar src={null} name={share.user.display_name} size="sm" />
      ) : (
        <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-neutral-800" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium text-brand-900 dark:text-brand-100">
            {share.user ? share.user.display_name : 'Somebody'}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {formatGrams(share.grams)} · {share.brews} {share.brews === 1 ? 'cup' : 'cups'}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-100 dark:bg-neutral-800"
        >
          <div
            className="h-full rounded-full bg-leaf-600 transition-[width] duration-300"
            style={{ width: `${Math.max(of > 0 ? Math.round((share.grams / of) * 100) : 0, 2)}%` }}
          />
        </div>
      </div>
    </li>
  )
}

function ForecastRow({ forecast, householdId }: { forecast: TinForecast; householdId: string }) {
  const { item, pace } = forecast
  return (
    <li className="flex items-center justify-between gap-3 border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800">
      <div className="min-w-0">
        <Link
          to={`/households/${householdId}/stock/${item.id}`}
          className="font-medium text-brand-900 hover:underline dark:text-brand-100"
        >
          {item.tea.name}
        </Link>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
          {formatGrams(item.quantity_grams)} left · {formatRate(pace.grams_per_week)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-amber-700 dark:text-amber-300">
        {pace.days_remaining !== null && formatTimeLeft(pace.days_remaining)}
      </span>
    </li>
  )
}

export function ConsumptionPage() {
  const { id = '' } = useParams()
  const household = useHousehold(id)
  const consumption = useConsumption(id)

  if (consumption.isPending || household.isPending) {
    return (
      <PageShell>
        <div role="status" aria-live="polite" className="space-y-4" data-testid="consumption-loading">
          <span className="sr-only">Working out what you drink…</span>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageShell>
    )
  }

  if (consumption.isError) {
    // A 404 here means "no such household, or not yours" — the API deliberately does not
    // distinguish the two, and neither does this page.
    const missing = consumption.error instanceof ApiError && consumption.error.status === 404
    return (
      <PageShell>
        {missing ? (
          <EmptyState title="We could not find that shelf" testId="consumption-missing">
            <p>It may have been deleted, or you may no longer be a member.</p>
            <Link to="/households" className="font-medium text-brand-700 dark:text-brand-300">
              Back to your households
            </Link>
          </EmptyState>
        ) : (
          <ErrorNote testId="consumption-error">{describeApiError(consumption.error)}</ErrorNote>
        )}
      </PageShell>
    )
  }

  const data = consumption.data
  const weeks = Math.round(data.window_days / 7)
  const brewedTotal = data.drinkers.reduce((sum, d) => sum + d.grams, 0)
  const teaTotal = data.teas.reduce((sum, t) => sum + t.grams, 0)
  const nothingYet = data.grams_out === 0

  return (
    <PageShell>
      <PageHeading
        title="What we drink"
        subtitle={`${household.data?.name ?? 'This shelf'} · the last ${weeks} weeks`}
        actions={
          <Link
            to={`/households/${id}`}
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            ← Back to the shelf
          </Link>
        }
      />

      {nothingYet ? (
        <EmptyState title="Nothing has left the shelf yet" testId="consumption-empty">
          <p className="mx-auto max-w-md">
            Record a brew on any tin and this page starts filling in: how much the household
            gets through, who drinks what, and which tin runs out next.
          </p>
        </EmptyState>
      ) : (
        <>
          <Panel testId="consumption-headline">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <BrewIcon glyph="cup" className="size-9 shrink-0 text-leaf-600" />
                <div>
                  <p className="text-2xl font-semibold text-brand-900 dark:text-brand-100">
                    {formatRate(data.grams_per_week)}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {formatGrams(data.grams_out)} left the shelf over {weeks} weeks
                  </p>
                </div>
              </div>
              <TeaBranch
                aria-hidden="true"
                className="hidden h-10 w-24 text-leaf-600 opacity-70 sm:block"
              />
            </div>
          </Panel>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <SectionLabel>Who drinks it</SectionLabel>
              <Panel testId="consumption-drinkers">
                {data.drinkers.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Nothing brewed in this window — everything that left the shelf was thrown
                    out or recounted away.
                  </p>
                ) : (
                  <ul>
                    {data.drinkers.map((share, index) => (
                      <DrinkerRow
                        key={share.user ? share.user.id : `nobody-${index}`}
                        share={share}
                        of={brewedTotal}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </section>

            <section>
              <SectionLabel>Which teas</SectionLabel>
              <Panel testId="consumption-teas">
                {data.teas.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Nothing brewed in this window.
                  </p>
                ) : (
                  <ul>
                    {data.teas.map((share: TeaShare) => (
                      <Share
                        key={share.tea.id}
                        label={share.tea.name}
                        grams={share.grams}
                        brews={share.brews}
                        of={teaTotal}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </section>
          </div>

          <section className="mt-6">
            <SectionLabel>Running out next</SectionLabel>
            <Panel testId="consumption-forecast">
              {data.running_out.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No tin has enough recorded history to forecast yet. Two brews a week apart
                  is enough to start.
                </p>
              ) : (
                <ul>
                  {data.running_out.map((forecast) => (
                    <ForecastRow key={forecast.item.id} forecast={forecast} householdId={id} />
                  ))}
                </ul>
              )}
            </Panel>
          </section>
        </>
      )}
    </PageShell>
  )
}

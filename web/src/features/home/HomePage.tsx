import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { LinkButton } from '../../components/ui/button'
import { TeaBranch, TeaCupMark, TeapotMark } from '../../components/ui/botanical'
import {
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Panel,
  SectionLabel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { formatGrams } from '../../lib/format'
import { formatTimeLeft } from '../stock/format'
import type { HomeSummary, LowTin, PublicSummary } from '../../lib/home'
import { TeaCard } from '../catalog/TeaCard'
import { FeedRow } from '../feed/FeedRow'
import { useAuth } from '../auth/auth-context'
import { useHomeSummary, usePublicSummary } from './queries'

/**
 * The home page shows what you could do next; the nav bar handles going places.
 *
 * It used to be a stack of link cards duplicating the nav, which meant the first screen
 * after signing in told you nothing you did not already know. Everything here is real
 * data with an action attached — a tin running out, a tea you own but have never rated,
 * what your friends have been drinking.
 */

function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-brand-900 dark:text-brand-100">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <>
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-brand-900 dark:text-brand-100">{value}</dd>
    </>
  )
  const shell =
    'paper-grain rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900'
  return to ? (
    <Link
      to={to}
      className={`${shell} block transition hover:border-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}

/**
 * Why this tin is on the list, in as few words as possible.
 *
 * There are two ways in and the reader has to be able to tell them apart, because they
 * call for different reactions. A tin below its threshold is a fact — you set 20 g and
 * there are 18. A tin above its threshold that is *forecast* to empty is a projection,
 * and saying "about 5 days left" without saying it is an estimate would be overclaiming
 * on a handful of ledger rows.
 *
 * A tin can be both, and then the forecast wins the line: "18 g, about 5 days left" is
 * strictly more useful than "18 g, below 20 g", which the reader can see for themselves.
 */
function LowTinReason({ low }: { low: LowTin }) {
  if (low.pace && low.pace.days_remaining !== null) {
    return (
      <span data-testid={`low-forecast-${low.item.id}`} className="text-amber-700 dark:text-amber-300">
        {formatTimeLeft(low.pace.days_remaining)}
      </span>
    )
  }
  return (
    <span className="text-neutral-500 dark:text-neutral-400">
      below {formatGrams(low.item.low_stock_grams)}
    </span>
  )
}

function LowTinRow({ low }: { low: LowTin }) {
  const { item, household } = low
  return (
    <li className="flex items-center justify-between gap-3 border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800">
      <div className="min-w-0">
        <Link
          to={`/households/${household.id}/stock/${item.id}`}
          className="font-medium text-brand-900 hover:underline dark:text-brand-100"
        >
          {item.tea.name}
        </Link>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
          {household.name}
          {item.location ? ` · ${item.location}` : ''}
          {' · '}
          <LowTinReason low={low} />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-semibold text-amber-700 dark:text-amber-400">
          {formatGrams(item.quantity_grams)}
        </span>
        <Link
          to={`/teas/${item.tea.slug}`}
          className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Buy more
        </Link>
      </div>
    </li>
  )
}

function SignedIn({ summary }: { summary: HomeSummary }) {
  const {
    display_name,
    household_count,
    tin_count,
    friend_count,
    pending_requests,
    review_count,
    low_stock,
    recent_activity,
    unrated,
  } = summary

  const brandNew = household_count === 0 && review_count === 0 && friend_count === 0

  return (
    <>
      <div data-testid="home-greeting">
        <PageHeading
          title={`Hello, ${display_name}`}
          subtitle="What is running out, what you have not rated, and what your friends have been drinking."
        />
      </div>

      {brandNew && (
        <Panel>
          <EmptyState title="Nothing on your shelves yet">
            <p className="mx-auto max-w-md text-sm text-neutral-500 dark:text-neutral-400">
              Start a household to track what you have, then add the tins you own.
              Everything else follows from that.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <LinkButton to="/households" variant="primary">
                Start a household
              </LinkButton>
              <LinkButton to="/teas">Browse the catalog</LinkButton>
            </div>
          </EmptyState>
        </Panel>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shelves" value={household_count} to="/households" />
        <Stat label="Tins" value={tin_count} to="/households" />
        <Stat
          label={pending_requests > 0 ? `Friends · ${pending_requests} waiting` : 'Friends'}
          value={friend_count}
          to="/friends"
        />
        <Stat label="Reviews" value={review_count} to="/reviews/mine" />
      </dl>

      {low_stock.length > 0 && (
        <section className="mt-6">
          <Panel testId="home-low-stock">
            <PanelHeader
              title="Running low"
              description="Under the amount you set, or going fast enough to run out soon."
            />
            <ul>
              {low_stock.map((low) => (
                <LowTinRow key={low.item.id} low={low} />
              ))}
            </ul>
          </Panel>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <Panel testId="home-activity">
            {/* No "all activity →" any more: this *is* all of it. The link pointed at a
                page showing a longer version of the same stream, and the longer version
                turned out to be the part nobody needed. */}
            <PanelHeader
              title="Lately"
              description="Your friends' ratings, and what has been landing on — and leaving — your shelves."
            />
            {recent_activity.length === 0 ? (
              <EmptyState title="Quiet so far">
                <p className="mx-auto max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                  Add a friend and their ratings will show up here, alongside anything new on
                  your shelves.
                </p>
                <div className="mt-4 flex justify-center">
                  <LinkButton to="/friends">Find people</LinkButton>
                </div>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-brand-100 dark:divide-neutral-800">
                {recent_activity.map((item, index) => (
                  <FeedRow key={`${item.kind}-${item.at}-${index}`} item={item} />
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <section>
          <Panel testId="home-unrated">
            <PanelHeader title="Not rated yet" description="On your shelves, no opinion recorded." />
            {unrated.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {tin_count === 0
                  ? 'Add a tin and it will show up here until you rate it.'
                  : 'You have rated everything you own. Impressive.'}
              </p>
            ) : (
              <ul className="grid gap-3">
                {unrated.map((tea) => (
                  <TeaCard key={tea.id} tea={tea} />
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}

/**
 * The still life beside the headline: a branch over a shelf, a pot, and a cup with steam
 * coming off it.
 *
 * Everything about this is decoration, so all of it is `aria-hidden` and none of it says
 * anything the headline does not. Three rules it follows, all of them from the brief:
 *
 *  - **It never sits behind the words.** The objects are in their own column at `lg`,
 *    beside the copy rather than under it. Below `lg` the whole thing is removed rather
 *    than shrunk: a 280px tableau stacked above a headline on a phone pushes the button
 *    below the fold to make room for a picture of a teapot.
 *  - **It is the only steam in the app.** `TeaCupMark` takes `steam` as an opt-in
 *    precisely so that this can be the one place it is on. Steam on every cup in a grid
 *    is a screensaver, and the CSS animation stops under `prefers-reduced-motion` with
 *    everything else.
 *  - **The shelf is what makes it a room.** Without a line under them the three objects
 *    float, and floating objects read as clip art. One 2px rule is the whole difference.
 */
function ShelfStill() {
  return (
    <div aria-hidden="true" className="relative hidden h-60 w-72 shrink-0 lg:block">
      <TeaBranch className="absolute -top-1 right-1 h-20 w-36 text-leaf-600 opacity-75" />
      <span className="absolute bottom-9 left-2 right-2 h-0.5 rounded-full bg-brand-300/70 dark:bg-neutral-700" />
      <span className="absolute bottom-2 left-7 h-7 w-1.5 bg-brand-300/50 dark:bg-neutral-800" />
      <span className="absolute bottom-2 right-7 h-7 w-1.5 bg-brand-300/50 dark:bg-neutral-800" />
      <TeapotMark className="absolute bottom-9 left-0 h-20 w-24 text-brand-300" />
      <TeaCupMark steam className="absolute bottom-8 right-3 h-28 w-28 text-brand-200" />
    </div>
  )
}

function SignedOut({ summary }: { summary: PublicSummary }) {
  const { tea_count, shop_count, ingredient_count, featured } = summary
  return (
    <>
      {/* A single flat tinted block, after the reference's promo panel.
          
          It was paper set inside a timber frame — two nested boxes with different corners
          and different textures, which is a real idea when one of them is wood. With both
          reduced to hairlines it was just a box inside a box, and the pinned-card marks in
          the corners were pinning nothing. One tinted surface, no border, no pins. */}
      <section>
        <div className="rounded-3xl bg-leaf-100 px-6 py-10 dark:bg-neutral-900 sm:px-12 sm:py-14">
          <div className="flex items-center justify-center gap-10 lg:justify-between">
            <div className="max-w-xl text-center lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Herbatka · a tea house
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-900 dark:text-brand-100 sm:text-4xl">
                Know your tea, and what is left of it
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-neutral-600 dark:text-neutral-300 lg:mx-0">
                Look up what is actually in a blend, rate what you drink, and keep track of how
                much is left in the tin — shared with whoever else raids the same cupboard.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
                <LinkButton to="/register" variant="primary" size="lg">
                  Create an account
                </LinkButton>
                <LinkButton to="/teas" size="lg">
                  Browse the catalog
                </LinkButton>
              </div>
              <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
                Already have one?{' '}
                <Link
                  to="/login"
                  className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <ShelfStill />
          </div>
        </div>
      </section>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Teas" value={tea_count} to="/teas" />
        <Stat label="Ingredients" value={ingredient_count} to="/ingredients" />
        <Stat label="Shops" value={shop_count} to="/shops" />
      </dl>

      {featured.length > 0 && (
        <section className="mt-10">
          <SectionLabel action={
            <Link
              to="/teas"
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              All teas →
            </Link>
          }>
            Well thought of
          </SectionLabel>
          <p className="-mt-1 mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            The best-rated teas in the catalog. No account needed to read about them.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((tea) => (
              <TeaCard key={tea.id} tea={tea} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

export function HomePage() {
  const { isLoading: authLoading, user } = useAuth()
  const mine = useHomeSummary()
  const anon = usePublicSummary()
  const active = user ? mine : anon

  return (
    <PageShell>
      {authLoading || active.isPending ? (
        <HomeSkeleton />
      ) : active.isError ? (
        <ErrorNote>{describeApiError(active.error)}</ErrorNote>
      ) : user && mine.data ? (
        <SignedIn summary={mine.data} />
      ) : anon.data ? (
        <SignedOut summary={anon.data} />
      ) : null}
    </PageShell>
  )
}

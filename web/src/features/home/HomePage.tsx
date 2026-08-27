import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { LinkButton } from '../../components/ui/button'
import { EmptyState, ErrorNote, PageHeading, PageShell, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { formatGrams } from '../../lib/format'
import type { HomeSummary, LowTin, PublicSummary } from '../../lib/home'
import { TeaCard } from '../catalog/TeaCard'
import { FeedRow } from '../feed/FeedPage'
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
    'rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
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
              description="Below the amount you asked to be warned at."
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
            <PanelHeader
              title="Lately"
              description="Your friends' ratings, and what has landed on your shelves."
              action={
                <Link
                  to="/feed"
                  className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  All activity →
                </Link>
              }
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

function SignedOut({ summary }: { summary: PublicSummary }) {
  const { tea_count, shop_count, ingredient_count, featured } = summary
  return (
    <>
      <section className="rounded-2xl border border-brand-200 bg-white px-6 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-10 sm:py-14">
        <p className="text-4xl" role="img" aria-label="teacup">
          🍵
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-900 dark:text-brand-100 sm:text-4xl">
          Know your tea, and what is left of it
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-neutral-600 dark:text-neutral-300">
          Look up what is actually in a blend, rate what you drink, and keep track of how much
          is left in the tin — shared with whoever else raids the same cupboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/register" variant="primary" size="lg">
            Create an account
          </LinkButton>
          <LinkButton to="/teas" size="lg">
            Browse the catalog
          </LinkButton>
        </div>
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          Already have one?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Sign in
          </Link>
        </p>
      </section>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Teas" value={tea_count} to="/teas" />
        <Stat label="Ingredients" value={ingredient_count} to="/ingredients" />
        <Stat label="Shops" value={shop_count} to="/shops" />
      </dl>

      {featured.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-brand-900 dark:text-brand-100">
            Well thought of
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            The best-rated teas in the catalog. No account needed to read about them.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

import { useState } from 'react'
import { Link } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import { formatMoment } from '../../lib/format'
import type { FeedActor, FeedItem, FeedReviewItem, FeedStockedItem } from '../../lib/friend'
import { formatScore } from '../review/format'
import { useFeed } from './queries'

const PAGE_SIZE = 20

/**
 * Who did the thing, as a face and a link to them.
 *
 * `actor` is nullable on a stocked item — a tin outlives the account of whoever bought it
 * — so "Somebody" is a real case rather than a defensive branch, and it gets neither a
 * link nor an avatar: there is nobody to link to, and initials for a person we cannot
 * name would be an invention.
 */
function Actor({ actor }: { actor: FeedActor | null }) {
  if (!actor) {
    return <span className="font-medium text-brand-900 dark:text-brand-100">Somebody</span>
  }

  return (
    <>
      <Avatar src={actor.avatar_url} name={actor.display_name} size="sm" />
      <Link
        to={`/users/${actor.id}`}
        className="font-medium text-brand-900 hover:underline dark:text-brand-100"
      >
        {actor.display_name}
      </Link>
    </>
  )
}

/** 12.5 → "12.5 g", 100 → "100 g". Trailing ".0" on a bag of tea reads like a lab
 *  notebook. */
function formatGrams(grams: number): string {
  return `${Number.isInteger(grams) ? grams : grams.toFixed(1)} g`
}

/**
 * A friend rated something. The tea is the link and the heading, because the tea is what
 * you would act on — you cannot do anything with the fact that Ada was drinking.
 */
function ReviewItem({ item }: { item: FeedReviewItem }) {
  return (
    <Panel as="li" testId="feed-item-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <Actor actor={item.actor} />
            <span>rated</span>
          </p>
          <h2 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            <Link to={`/teas/${item.tea.slug}`} className="hover:underline">
              {item.tea.name}
            </Link>
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Badge tone="brand">{TEA_TYPE_LABELS[item.tea.tea_type]}</Badge>
            <span>{formatMoment(item.at)}</span>
          </p>
        </div>
        <p
          data-testid={`feed-score-${item.tea.slug}`}
          className="text-2xl font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {formatScore(item.score)}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/10</span>
        </p>
      </div>

      {item.body && (
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {item.body}
        </p>
      )}
    </Panel>
  )
}

/**
 * A tin appeared on a shelf you share. The link goes to the *household*, not the tea:
 * the useful next move is "go see what else is on that shelf", and the tea page would
 * not tell you the tin exists.
 *
 * `actor` is nullable on this kind and not on a review — a tin can outlive whoever put
 * it there, and tins older than the `added_by` column never had an answer. "Somebody" is
 * the honest word for that; inventing a name, or dropping the item from the stream, both
 * hide a tin that really is on the shelf.
 */
function StockedItem({ item }: { item: FeedStockedItem }) {
  return (
    <Panel as="li" testId="feed-item-stocked">
      <p className="flex flex-wrap items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
        <Actor actor={item.actor} /> added {formatGrams(item.grams)} of{' '}
        <span className="font-medium text-brand-900 dark:text-brand-100">{item.tea.name}</span> to{' '}
        <Link
          to={`/households/${item.household.id}`}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          {item.household.name}
        </Link>
      </p>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <Badge>{TEA_TYPE_LABELS[item.tea.tea_type]}</Badge>
        <span>{formatMoment(item.at)}</span>
      </p>
    </Panel>
  )
}

/** The discriminator does the work. Two kinds, two shapes on screen — collapsing them
 *  into one row with a verb slot would make "rated 9" and "added 100 g" look like the
 *  same event, which they are not. */
/** Exported so the home page can show the first few of the same timeline
 *  without a second rendering of the same data that could drift from this one. */
export function FeedRow({ item }: { item: FeedItem }) {
  return item.kind === 'review' ? <ReviewItem item={item} /> : <StockedItem item={item} />
}

/**
 * What your friends have been drinking, and what has appeared on your shared shelves.
 *
 * Two sources with quite different privacy rules, deliberately in one stream: reviews
 * are your *friends'*, tins are your *households'*. The server merges and orders them;
 * this page does not re-sort, because "newest first" across two clocks is the server's
 * question to answer once rather than the client's to guess at per page.
 */
export function FeedPage() {
  const [page, setPage] = useState(1)
  const feed = useFeed({ page, size: PAGE_SIZE })

  const items = feed.data?.items ?? []

  return (
    <PageShell>
      <PageHeading
        title="Activity"
        subtitle="What your friends have rated, and what has landed on your shelves."
        actions={
          <Link
            to="/friends"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Friends →
          </Link>
        }
      />

      {feed.isPending && (
        <div role="status" aria-live="polite" data-testid="feed-loading" className="space-y-4">
          <span className="sr-only">Loading your feed…</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {feed.isError && <ErrorNote testId="feed-error">{describeApiError(feed.error)}</ErrorNote>}

      {!feed.isPending && !feed.isError && items.length === 0 && (
        <EmptyState title="Nothing here yet" testId="feed-empty">
          <p>
            This fills up as your friends rate teas, and as tins are added to households you
            are in. Add a few friends and it will not stay quiet for long.
          </p>
          <Link to="/friends" className="font-medium text-brand-700 dark:text-brand-300">
            Find friends
          </Link>
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul
          data-testid="feed-list"
          className={`space-y-4 ${feed.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {/* Not keyed on the actor: a stocked item's is nullable, and two anonymous
              tins added in the same second would collide on `undefined`. */}
          {items.map((item) => (
            <FeedRow key={`${item.kind}-${item.tea.id}-${item.at}`} item={item} />
          ))}
        </ul>
      )}

      <Pagination page={feed.data?.page ?? page} pages={feed.data?.pages ?? 1} onPageChange={setPage} />
    </PageShell>
  )
}

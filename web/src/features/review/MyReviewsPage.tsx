import { useState } from 'react'
import { Link } from 'react-router'

import {
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { formatDay } from '../../lib/format'
import type { MyReview } from '../../lib/review'
import { pluralise } from '../catalog/format'
import { formatScore } from './format'
import { useMyReviews } from './queries'
import { ReviewDetails } from './ReviewList'

const PAGE_SIZE = 20

/** One of your reviews, with the tea it is about. The tea is the heading and the link,
 *  because on this page the tea is what you are looking for — you already know what you
 *  thought of it. */
function MyReviewCard({ review }: { review: MyReview }) {
  return (
    <Panel as="li" testId="my-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            <Link to={`/teas/${review.tea.slug}`} className="hover:underline">
              {review.tea.name}
            </Link>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {review.brewed_at
              ? `Brewed ${formatDay(review.brewed_at)}`
              : `Rated ${formatDay(review.created_at)}`}
          </p>
        </div>
        <p
          data-testid={`my-review-score-${review.tea.slug}`}
          className="text-2xl font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {formatScore(review.score)}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/10</span>
        </p>
      </div>

      {/* The aspects and the notes, rendered by the same component as the tea page — but
          without its author line, which here would say your own name back to you. */}
      <ReviewDetails review={review} />
    </Panel>
  )
}

/**
 * Everything you have rated. Signed-in only, and behind `RequireAuth` — the endpoint is
 * "mine", so there is nothing here to show a stranger.
 */
export function MyReviewsPage() {
  const [page, setPage] = useState(1)
  const reviews = useMyReviews({ page, size: PAGE_SIZE })

  const items = reviews.data?.items ?? []

  return (
    <PageShell>
      <PageHeading
        title="Your reviews"
        subtitle={
          reviews.data ? `${pluralise(reviews.data.total, 'tea')} you have rated.` : undefined
        }
        actions={
          <Link
            to="/teas"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Browse teas →
          </Link>
        }
      />

      {reviews.isPending && (
        <div role="status" aria-live="polite" data-testid="my-reviews-loading" className="space-y-4">
          <span className="sr-only">Loading your reviews…</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {reviews.isError && (
        <ErrorNote testId="my-reviews-error">{describeApiError(reviews.error)}</ErrorNote>
      )}

      {!reviews.isPending && !reviews.isError && items.length === 0 && (
        <EmptyState title="You have not rated anything yet" testId="my-reviews-empty">
          <p>Find a tea you have drunk and give it a score — it takes one click.</p>
          <Link to="/teas" className="font-medium text-brand-700 dark:text-brand-300">
            Browse the catalog
          </Link>
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul
          data-testid="my-reviews"
          className={`space-y-4 ${reviews.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {items.map((review) => (
            <MyReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}

      <Pagination
        page={reviews.data?.page ?? page}
        pages={reviews.data?.pages ?? 1}
        onPageChange={setPage}
      />
    </PageShell>
  )
}

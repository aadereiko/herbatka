import { Link } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { Badge, ErrorNote, Pagination, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { formatDay } from '../../lib/format'
import type { Review, ReviewNotes, Subscore } from '../../lib/review'
import { SUBSCORES, SUBSCORE_LABELS } from '../../lib/review'
import { formatScore } from './format'

/** "Aroma 8 · Flavour 7" — a sentence rather than a table, because most reviews will
 *  carry one of the three and a three-column grid mostly full of blanks reads worse. */
function subscoreLine(review: ReviewNotes): string | null {
  const values: Record<Subscore, number | null> = {
    aroma: review.aroma ?? null,
    flavour: review.flavour ?? null,
    aftertaste: review.aftertaste ?? null,
  }
  const parts = SUBSCORES.map((key) => ({ key, value: values[key] }))
    .filter((entry): entry is { key: Subscore; value: number } => entry.value != null)
    .map(({ key, value }) => `${SUBSCORE_LABELS[key]} ${formatScore(value)}`)
  return parts.length === 0 ? null : parts.join(' · ')
}

/** The part of a review that is the same wherever it is read: what it scored on each
 *  aspect, and what the person said. Shared with `/reviews/mine`, which frames it
 *  differently but should not describe a cup differently. */
export function ReviewDetails({ review }: { review: ReviewNotes }) {
  const details = subscoreLine(review)

  return (
    <>
      {details && (
        <p
          data-testid={`review-subscores-${review.id}`}
          className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
        >
          {details}
        </p>
      )}
      {review.body && (
        <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {review.body}
        </p>
      )}
    </>
  )
}

/** One review. `isMine` is not a permission — the list is public and the server sends
 *  everybody's — it is a label, so you can find your own words in the list you are
 *  reading and know why there is no second copy of them. */
export function ReviewRow({ review, isMine = false }: { review: Review; isMine?: boolean }) {
  return (
    <li
      data-testid="review-row"
      className="border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Avatar
          src={review.author.avatar_url}
          name={review.author.display_name}
          size="sm"
          testId={`review-author-avatar-${review.id}`}
        />
        {/* The name is the link, not the avatar: one target rather than two adjacent ones
            going to the same place, which is a screen reader reading the person twice. */}
        <Link
          to={`/users/${review.author.id}`}
          className="font-medium text-brand-900 hover:underline dark:text-brand-100"
        >
          {review.author.display_name}
        </Link>
        {isMine && <Badge tone="brand">You</Badge>}
        <span
          data-testid={`review-score-${review.id}`}
          className="ml-auto text-lg font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {formatScore(review.score)}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/10</span>
        </span>
      </div>

      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        {review.brewed_at ? `Brewed ${formatDay(review.brewed_at)}` : formatDay(review.created_at)}
      </p>

      <ReviewDetails review={review} />
    </li>
  )
}

/**
 * Everybody's reviews of one tea, newest first — the order is the server's, and
 * re-sorting the page in the browser would only reorder the twenty rows it happened to
 * send rather than the list as a whole.
 */
export function ReviewList({
  reviews,
  total,
  page,
  pages,
  onPageChange,
  isPending,
  isPlaceholder,
  error,
  myReviewId,
}: {
  reviews: Review[]
  total: number
  page: number
  pages: number
  onPageChange: (page: number) => void
  isPending: boolean
  isPlaceholder: boolean
  error: unknown
  myReviewId: string | null
}) {
  if (isPending) {
    return (
      <div role="status" aria-live="polite" data-testid="review-list-loading" className="space-y-3">
        <span className="sr-only">Loading reviews…</span>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    )
  }

  if (error) return <ErrorNote testId="review-list-error">{describeApiError(error)}</ErrorNote>

  if (reviews.length === 0) {
    return (
      <p data-testid="review-list-empty" className="text-sm text-neutral-500 dark:text-neutral-400">
        No reviews written yet.
      </p>
    )
  }

  return (
    <>
      <ul data-testid="review-list" className={isPlaceholder ? 'opacity-60' : undefined}>
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} isMine={review.id === myReviewId} />
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        Showing {reviews.length} of {total} reviews.
      </p>
      <Pagination page={page} pages={pages} onPageChange={onPageChange} />
    </>
  )
}

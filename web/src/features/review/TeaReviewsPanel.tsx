import { useState } from 'react'
import { Link } from 'react-router'

import { Panel } from '../../components/ui/page'
import type { TeaDetail } from '../../lib/catalog'
import { useAuth } from '../auth/auth-context'
import { pluralise } from '../catalog/format'
import { useTeaReviews } from './queries'
import { RatingSummary, SubscoreAverages } from './RatingSummary'
import { ReviewForm } from './ReviewForm'
import { ReviewList } from './ReviewList'

/** Ten to a page. A tea with forty reviews is a long scroll on a phone, and the reviews
 *  sit below the brewing spec that most visitors came for. */
const PAGE_SIZE = 10

/**
 * The rating half of the tea page: the numbers, your own review, and everybody else's.
 *
 * It is a separate component from `TeaDetailPage` for one concrete reason beyond tidiness
 * — the reviews query lives in here, so it is only ever issued for a tea that loaded. A
 * hook at the top of the page would fetch reviews for a slug that just answered 404.
 */
export function TeaReviewsPanel({ tea }: { tea: TeaDetail }) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const reviews = useTeaReviews(tea.slug, { page, size: PAGE_SIZE })

  return (
    <div className="space-y-6">
      <RatingSummary
        rating={tea}
        emptyTitle="Nobody has rated this yet"
        emptyBody="Be the first to say what it is like."
        details={<SubscoreAverages tea={tea} />}
      />

      <Panel ariaLabel="Your review" testId="your-review">
        <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
          {tea.my_review ? 'Your review' : 'Rate this tea'}
        </h2>
        {user ? (
          <>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              {tea.my_review
                ? 'You have rated this one. Changing it replaces what you wrote.'
                : 'A score is enough. The rest is for when you have more to say.'}
            </p>
            <ReviewForm slug={tea.slug} mine={tea.my_review} />
          </>
        ) : (
          <p data-testid="review-signed-out" className="text-sm text-neutral-600 dark:text-neutral-400">
            <Link to="/login" className="font-medium text-brand-700 underline dark:text-brand-300">
              Sign in
            </Link>{' '}
            to rate this tea and say what it was like.
          </p>
        )}
      </Panel>

      <Panel ariaLabel="Reviews" testId="tea-reviews">
        <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
          {reviews.data ? pluralise(reviews.data.total, 'review') : 'Reviews'}
        </h2>
        <ReviewList
          reviews={reviews.data?.items ?? []}
          total={reviews.data?.total ?? 0}
          page={reviews.data?.page ?? page}
          pages={reviews.data?.pages ?? 1}
          onPageChange={setPage}
          isPending={reviews.isPending}
          isPlaceholder={reviews.isPlaceholderData}
          error={reviews.isError ? reviews.error : null}
          myReviewId={tea.my_review?.id ?? null}
        />
      </Panel>
    </div>
  )
}

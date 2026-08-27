import { useState } from 'react'
import { Link } from 'react-router'

import { Panel } from '../../components/ui/page'
import type { ShopDetail } from '../../lib/shop'
import { useAuth } from '../auth/auth-context'
import { pluralise } from '../catalog/format'
import { useShopReviews } from './queries'
import { RatingSummary } from './RatingSummary'
import { ReviewList } from './ReviewList'
import { ShopReviewForm } from './ShopReviewForm'

/** Ten to a page, as on a tea. A shop with forty reviews is a long scroll on a phone,
 *  and the reviews sit below what the shop actually stocks. */
const PAGE_SIZE = 10

/**
 * The rating half of a shop's page: the numbers, your own review, and everybody else's.
 *
 * The mirror of `TeaReviewsPanel`, down to sharing every component inside it. It lives in
 * the review feature rather than the shop one for that reason — what changes between a
 * tea and a shop here is three nouns and one endpoint, and putting the shop copy next to
 * the shop's map would have meant two panels that have to be kept looking the same.
 *
 * The reviews query lives in here rather than on the page above it, so it is only ever
 * issued for a shop that loaded — a hook at the top of `ShopDetailPage` would fetch
 * reviews for a slug that has just answered 404.
 */
export function ShopReviewsPanel({ shop }: { shop: ShopDetail }) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const reviews = useShopReviews(shop.slug, { page, size: PAGE_SIZE })

  return (
    <div className="space-y-6">
      <RatingSummary
        rating={shop}
        emptyTitle="Nobody has rated this shop yet"
        emptyBody="Be the first to say what it is like to buy from."
      />

      <Panel ariaLabel="Your review of this shop" testId="your-shop-review">
        <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
          {shop.my_review ? 'Your review' : 'Rate this shop'}
        </h2>
        {user ? (
          <>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              {shop.my_review
                ? 'You have rated this one. Changing it replaces what you wrote.'
                : 'A score is enough. The rest is for when you have more to say.'}
            </p>
            <ShopReviewForm slug={shop.slug} mine={shop.my_review} />
          </>
        ) : (
          <p
            data-testid="shop-review-signed-out"
            className="text-sm text-neutral-600 dark:text-neutral-400"
          >
            <Link to="/login" className="font-medium text-brand-700 underline dark:text-brand-300">
              Sign in
            </Link>{' '}
            to rate this shop and say what it was like.
          </p>
        )}
      </Panel>

      <Panel ariaLabel="Reviews of this shop" testId="shop-reviews">
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
          myReviewId={shop.my_review?.id ?? null}
        />
      </Panel>
    </div>
  )
}

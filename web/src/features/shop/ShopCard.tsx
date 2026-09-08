import { Link } from 'react-router'

import { EntityImage } from '../../components/ui/image'
import { Badge, PendingBadge } from '../../components/ui/page'
import type { ShopSummary } from '../../lib/shop'
import { pluralise } from '../catalog/format'
import { FavouriteStar } from '../favourite/FavouriteStar'
import { formatAverage, formatScore } from '../review/format'
import { describePlace } from './format'
import { formatDistance } from './nearby'

/**
 * One shop in the browse grid. The whole card is the link — a tap target the size of a
 * card rather than the size of a word, because this list is read on a phone.
 *
 * The star is a sibling of that link rather than a child of it, for the reason `TeaCard`
 * spells out: a button inside an anchor is invalid markup that navigates when pressed.
 */
export function ShopCard({ shop }: { shop: ShopSummary }) {
  const place = describePlace(shop)
  // Null on every ordinary browse — the server only fills it in when the request carried
  // a position — and the badge is absent rather than empty when it is.
  const distance = formatDistance(shop.distance_km)
  // `review_count > 0` rather than `!== 0`, as on a tea card: a server that has not
  // shipped these fields yet lands in the unrated branch instead of printing "NaN".
  const average = shop.average_score
  const rated = average != null && shop.review_count > 0

  return (
    <li className="relative list-none">
      <div className="absolute right-2 top-2 z-10">
        <FavouriteStar
          kind="shop"
          slug={shop.slug}
          name={shop.name}
          isFavourite={shop.is_favourite}
        />
      </div>
      <Link
        to={`/shops/${shop.slug}`}
        data-testid="shop-card"
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* Empty alt: the whole card is one link and the shop's name is its text, so a
            second announcement of the same name is repetition, not information. */}
        <EntityImage src={shop.image_url} alt="" className="h-32 w-full" testId="shop-card-image" />

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            {shop.name}
          </h3>

          {/* Absent rather than an em dash when a shop is online-only: a line that says
              nothing still costs a line of scanning. */}
          {place && (
            <p data-testid="shop-card-place" className="text-sm text-neutral-500 dark:text-neutral-400">
              {place}
            </p>
          )}

          {/* The crowd's number, and — beside it, never folded into it — yours. A grid
              where you cannot tell which shops you have already rated is a grid you rate
              the same shop in twice. */}
          {rated && (
            <p data-testid="shop-card-rating" className="text-sm text-neutral-700 dark:text-neutral-300">
              <span className="sr-only">
                Rated {formatAverage(average)} out of 10, from{' '}
                {pluralise(shop.review_count, 'review')}.
              </span>
              <span aria-hidden="true" className="font-medium tabular-nums">
                {`★ ${formatAverage(average)} · ${shop.review_count}`}
              </span>
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <Badge tone={shop.listing_count > 0 ? 'brand' : 'neutral'}>
              {pluralise(shop.listing_count, 'tea')}
            </Badge>
            {shop.my_score != null && (
              <span data-testid="shop-card-my-score">
                <Badge tone="brand">You rated {formatScore(shop.my_score)}</Badge>
              </span>
            )}
            {distance && (
              <span data-testid="shop-card-distance">
                <Badge tone="amber">{distance}</Badge>
              </span>
            )}
            {!shop.is_approved && <PendingBadge />}
          </div>
        </div>
      </Link>
    </li>
  )
}

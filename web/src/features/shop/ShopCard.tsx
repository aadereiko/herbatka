import { Link } from 'react-router'

import { EntityImage } from '../../components/ui/image'
import { Badge } from '../../components/ui/page'
import type { ShopSummary } from '../../lib/shop'
import { pluralise } from '../catalog/format'
import { describePlace } from './format'

/** One shop in the browse grid. The whole card is the link — a tap target the size of a
 *  card rather than the size of a word, because this list is read on a phone. */
export function ShopCard({ shop }: { shop: ShopSummary }) {
  const place = describePlace(shop)

  return (
    <li className="list-none">
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

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <Badge tone={shop.listing_count > 0 ? 'brand' : 'neutral'}>
              {pluralise(shop.listing_count, 'tea')}
            </Badge>
            {!shop.is_approved && <Badge tone="rose">Awaiting review</Badge>}
          </div>
        </div>
      </Link>
    </li>
  )
}

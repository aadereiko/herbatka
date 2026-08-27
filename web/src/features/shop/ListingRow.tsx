import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/page'
import type { Listing, ShopSummary } from '../../lib/shop'
import { useAuth } from '../auth/auth-context'
import { BuyForm } from './BuyForm'
import { describePlace, formatListingPrice, formatPack } from './format'

/**
 * One listing, from either end.
 *
 * The same row appears on a shop's page (where the tea is the headline and the shop is
 * assumed) and in "Where to buy" on a tea's page (where it is the other way round).
 * `lead` picks which, so the outbound link, the price formatting and the whole buy flow
 * live in one component rather than two that drift.
 */
export function ListingRow({
  listing,
  shop,
  lead,
}: {
  listing: Listing
  shop: ShopSummary
  lead: 'tea' | 'shop'
}) {
  const { user } = useAuth()
  const [buying, setBuying] = useState(false)

  const price = formatListingPrice(listing)
  const pack = formatPack(listing.pack_grams)
  const place = describePlace(shop)

  return (
    <li
      data-testid={`listing-${listing.id}`}
      className="border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-brand-900 dark:text-brand-100">
            {lead === 'tea' ? (
              <Link
                to={`/teas/${listing.tea.slug}`}
                className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {listing.tea.name}
              </Link>
            ) : (
              <Link
                to={`/shops/${shop.slug}`}
                className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {shop.name}
              </Link>
            )}
          </h3>

          {lead === 'shop' && place && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{place}</p>
          )}

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            {pack && <span data-testid={`listing-pack-${listing.id}`}>{pack}</span>}
            {/* `price_minor` is minor units and is never rendered raw. When there is no
                price the row says so — a listing showing "0.00" reads as free, which is
                a different and wrong claim from "this shop has not published a price". */}
            {price ? (
              <span
                data-testid={`listing-price-${listing.id}`}
                className="font-semibold tabular-nums"
              >
                {price}
              </span>
            ) : (
              <span
                data-testid={`listing-no-price-${listing.id}`}
                className="text-neutral-500 dark:text-neutral-400"
              >
                Price not listed
              </span>
            )}
            {!listing.is_available && (
              <span data-testid={`listing-unavailable-${listing.id}`}>
                <Badge tone="amber">Out of stock</Badge>
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {listing.product_url && (
            <a
              href={listing.product_url}
              // Somebody else's site in somebody else's tab. `noopener` is the one that
              // matters — without it the opened page gets a handle on this one through
              // `window.opener` and can navigate it wherever it likes.
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`listing-link-${listing.id}`}
              className="btn btn-md btn-secondary gap-1.5"
            >
              Buy at {shop.name}
              <span aria-hidden="true">↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}

          {/* Signed-in only: the button's entire job is to put a tin on a shelf, and a
              signed-out visitor has no shelf for it to land on. */}
          {user && !buying && (
            <Button
              variant="primary"
              testId={`buy-${listing.id}`}
              ariaLabel={`I bought ${listing.tea.name} at ${shop.name}`}
              onClick={() => setBuying(true)}
            >
              I bought this
            </Button>
          )}
        </div>
      </div>

      {user && buying && (
        <div className="mt-3 rounded-xl border border-brand-200 p-3 dark:border-neutral-800">
          <BuyForm
            shopSlug={shop.slug}
            shopName={shop.name}
            listing={listing}
            onClose={() => setBuying(false)}
          />
        </div>
      )}
    </li>
  )
}

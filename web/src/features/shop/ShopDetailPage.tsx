import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { EntityImage } from '../../components/ui/image'
import {
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { ApiError, describeApiError } from '../../lib/api'
import { pluralise } from '../catalog/format'
import { describePlace } from './format'
import { ListingRow } from './ListingRow'
import { directionsUrl, isPinned } from './nearby'
import { useShopDetail, useShopListings } from './queries'
import { ShopPointMap } from './ShopMap'

const LISTING_PAGE_SIZE = 20

export function ShopDetailPage() {
  const { slug = '' } = useParams()
  const [page, setPage] = useState(1)

  const shop = useShopDetail(slug)
  // Paged separately from the shop itself, and its page number is local rather than in
  // the URL: "page 3 of what this shop stocks" is not a link anybody sends, and the shop
  // is. Compare `/shops`, where the filters are the whole point of the address bar.
  const listings = useShopListings(slug, { page, size: LISTING_PAGE_SIZE })

  if (shop.isPending) {
    return (
      <PageShell>
        <div role="status" aria-live="polite" data-testid="shop-detail-loading" className="space-y-4">
          <span className="sr-only">Loading shop…</span>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </PageShell>
    )
  }

  if (shop.isError) {
    // A 404 is an ordinary outcome, not a failure: the public list hides unapproved
    // shops, so a stale link and a typo look identical from out here.
    const missing = shop.error instanceof ApiError && shop.error.status === 404
    return (
      <PageShell>
        {missing ? (
          <EmptyState title="We could not find that shop" testId="shop-detail-missing">
            <p>It may have closed, or it may still be waiting for review.</p>
            <Link to="/shops" className="font-medium text-brand-700 dark:text-brand-300">
              Back to all shops
            </Link>
          </EmptyState>
        ) : (
          <ErrorNote testId="shop-detail-error">{describeApiError(shop.error)}</ErrorNote>
        )}
      </PageShell>
    )
  }

  const detail = shop.data
  const place = describePlace(detail)
  const items = listings.data?.items ?? []
  // Nothing at all when there is no pin — an online-only shop is not somewhere you can
  // stand, and a grey square captioned "no location" is a hole in the page rather than
  // an answer to anything.
  const pinned = isPinned(detail)

  return (
    <PageShell>
      <PageHeading
        title={detail.name}
        subtitle={place ?? 'Online only'}
        actions={
          <Link
            to="/shops"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            ← All shops
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Panel ariaLabel="What this shop stocks">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-brand-900 dark:text-brand-100">
                What they stock
              </h2>
              <p
                role="status"
                aria-live="polite"
                data-testid="listing-count"
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                {listings.isPending
                  ? 'Loading…'
                  : pluralise(listings.data?.total ?? 0, 'tea')}
              </p>
            </div>

            {listings.isError && (
              <ErrorNote testId="listings-error">{describeApiError(listings.error)}</ErrorNote>
            )}

            {listings.isPending && (
              <div role="status" aria-live="polite" data-testid="listings-loading" className="space-y-2">
                <span className="sr-only">Loading what they stock…</span>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!listings.isPending && !listings.isError && items.length === 0 && (
              <p data-testid="listings-empty" className="text-sm text-neutral-500 dark:text-neutral-400">
                Nobody has recorded what this shop carries yet.
              </p>
            )}

            {items.length > 0 && (
              <ul data-testid="listing-list" className={listings.isPlaceholderData ? 'opacity-60' : ''}>
                {items.map((listing) => (
                  <ListingRow key={listing.id} listing={listing} shop={detail} lead="tea" />
                ))}
              </ul>
            )}

            <Pagination
              page={listings.data?.page ?? 1}
              pages={listings.data?.pages ?? 1}
              onPageChange={setPage}
            />
          </Panel>
        </div>

        <Panel ariaLabel="About this shop" className="h-fit">
          {/* A real alt here, unlike on the card: this picture is content on a page
              about the shop, not decoration inside a link that already says its name. */}
          <EntityImage
            src={detail.image_url}
            alt={`${detail.name}, outside`}
            className="mb-4 h-40 w-full rounded-xl"
            testId="shop-detail-image"
          />

          <dl className="space-y-3 text-sm">
            {detail.address && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Where
                </dt>
                <dd data-testid="shop-address" className="text-neutral-800 dark:text-neutral-200">
                  {detail.address}
                  {place ? `, ${place}` : ''}
                </dd>
              </div>
            )}

            {detail.website && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Website
                </dt>
                <dd>
                  <a
                    href={detail.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="shop-website"
                    className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {detail.website}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {pinned && (
            <div className="mt-4 space-y-2">
              <ShopPointMap
                latitude={detail.latitude}
                longitude={detail.longitude}
                name={detail.name}
              />
              {/* Out to OpenStreetMap rather than a routing engine of our own: the point
                  is to hand the coordinates to something that already knows how to get
                  somebody there, on whatever device they are holding. */}
              <a
                href={directionsUrl(detail.latitude, detail.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="shop-directions"
                className="inline-block text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
              >
                Directions
                <span className="sr-only"> to {detail.name} (opens in a new tab)</span>
              </a>
            </div>
          )}

          {detail.description && (
            <p
              data-testid="shop-description"
              className="mt-4 border-t border-brand-100 pt-3 text-sm leading-relaxed text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
            >
              {detail.description}
            </p>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}

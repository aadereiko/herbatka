import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import {
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Pagination,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { pluralise } from '../catalog/format'
import { TeaCard } from '../catalog/TeaCard'
import { ShopCard } from '../shop/ShopCard'
import { useFavouriteShops, useFavouriteTeas } from './queries'

const PAGE_SIZE = 24

/**
 * Which half you are looking at, in the URL like every other view state in this app.
 *
 * A union of two string literals rather than an enum — `erasableSyntaxOnly` bans any
 * TypeScript that emits runtime code — and anything that is not exactly `shops` reads as
 * teas, so `?tab=banana` renders a page rather than an error.
 */
export type FavouriteTab = 'teas' | 'shops'

function readTab(raw: string | null): FavouriteTab {
  return raw === 'shops' ? 'shops' : 'teas'
}

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/** What a star is *for*, said once, in the place where somebody who has never pressed
 *  one is standing. Two sentences rather than "Nothing here yet", because the empty
 *  state is the only chance this feature gets to explain itself. */
function NothingStarred({ noun, browseTo, browseLabel }: {
  noun: string
  browseTo: string
  browseLabel: string
}) {
  return (
    <EmptyState title={`No ${noun} starred yet`} testId={`favourite-${noun}-empty`}>
      <p>
        The star on a {noun.slice(0, -1)} keeps it here, so the ones you come back to are
        one click away instead of one search away. It is not a rating — star something you
        have never scored, and score something you never star.
      </p>
      <p>
        <Link to={browseTo} className="font-medium text-brand-700 dark:text-brand-300">
          {browseLabel} →
        </Link>
      </p>
    </EmptyState>
  )
}

function FavouriteTeas({ page, onPageChange }: { page: number; onPageChange: (page: number) => void }) {
  const teas = useFavouriteTeas({ page, size: PAGE_SIZE })
  const items = teas.data?.items ?? []

  if (teas.isPending) return <LoadingGrid label="Loading your teas…" testId="favourite-teas-loading" />
  if (teas.isError) {
    return <ErrorNote testId="favourite-teas-error">{describeApiError(teas.error)}</ErrorNote>
  }
  if (items.length === 0) {
    return <NothingStarred noun="teas" browseTo="/teas" browseLabel="Browse the catalog" />
  }

  return (
    <>
      <p data-testid="favourite-tea-count" className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {pluralise(teas.data?.total ?? 0, 'tea')}
      </p>
      <ul
        data-testid="favourite-teas"
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          teas.isPlaceholderData ? 'opacity-60' : ''
        }`}
      >
        {items.map((tea) => (
          <TeaCard key={tea.id} tea={tea} />
        ))}
      </ul>
      <Pagination page={teas.data?.page ?? 1} pages={teas.data?.pages ?? 1} onPageChange={onPageChange} />
    </>
  )
}

function FavouriteShops({ page, onPageChange }: { page: number; onPageChange: (page: number) => void }) {
  const shops = useFavouriteShops({ page, size: PAGE_SIZE })
  const items = shops.data?.items ?? []

  if (shops.isPending) {
    return <LoadingGrid label="Loading your shops…" testId="favourite-shops-loading" />
  }
  if (shops.isError) {
    return <ErrorNote testId="favourite-shops-error">{describeApiError(shops.error)}</ErrorNote>
  }
  if (items.length === 0) {
    return <NothingStarred noun="shops" browseTo="/shops" browseLabel="Browse the shops" />
  }

  return (
    <>
      <p data-testid="favourite-shop-count" className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {pluralise(shops.data?.total ?? 0, 'shop')}
      </p>
      <ul
        data-testid="favourite-shops"
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          shops.isPlaceholderData ? 'opacity-60' : ''
        }`}
      >
        {items.map((shop) => (
          <ShopCard key={shop.id} shop={shop} />
        ))}
      </ul>
      <Pagination page={shops.data?.page ?? 1} pages={shops.data?.pages ?? 1} onPageChange={onPageChange} />
    </>
  )
}

/**
 * Everything you have starred, in two halves.
 *
 * Tabs rather than two stacked sections, because a person with sixty starred teas would
 * otherwise have to scroll past all of them to reach their four shops — and the tab is in
 * the query string rather than in `useState` for the reason every other view state in
 * this app is: `/favourites?tab=shops` has to survive a reload and answer the back
 * button.
 *
 * Only the visible half is mounted, so opening this page makes one request rather than
 * two. The other half is one click and one request away, and most visits only ever want
 * one of them.
 */
export function FavouritesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = readTab(searchParams.get('tab'))
  const page = readPage(searchParams.get('page'))

  /** Switching tabs drops the page number: "page 3 of my teas" and "page 3 of my shops"
   *  have nothing to do with each other, and landing on an empty page 3 of a four-shop
   *  list reads as a list that has lost its contents. */
  function commit(next: { tab?: FavouriteTab; page?: number }) {
    const params = new URLSearchParams()
    const nextTab = next.tab ?? tab
    const nextPage = next.tab && next.tab !== tab ? 1 : (next.page ?? page)
    if (nextTab === 'shops') params.set('tab', 'shops')
    if (nextPage > 1) params.set('page', String(nextPage))
    setSearchParams(params)
  }

  return (
    <PageShell>
      <PageHeading
        title="Your favourites"
        subtitle="The teas and the shops you starred, kept where you can find them again."
      />

      {/* One control that reports its state, rather than two links whose only difference
          is which one happens to look darker. */}
      <div className="mb-6 flex gap-1" role="group" aria-label="Which favourites to show">
        <Button
          variant={tab === 'teas' ? 'primary' : 'secondary'}
          ariaPressed={tab === 'teas'}
          testId="favourites-tab-teas"
          onClick={() => commit({ tab: 'teas' })}
        >
          Teas
        </Button>
        <Button
          variant={tab === 'shops' ? 'primary' : 'secondary'}
          ariaPressed={tab === 'shops'}
          testId="favourites-tab-shops"
          onClick={() => commit({ tab: 'shops' })}
        >
          Shops
        </Button>
      </div>

      {tab === 'teas' ? (
        <FavouriteTeas page={page} onPageChange={(next) => commit({ page: next })} />
      ) : (
        <FavouriteShops page={page} onPageChange={(next) => commit({ page: next })} />
      )}
    </PageShell>
  )
}

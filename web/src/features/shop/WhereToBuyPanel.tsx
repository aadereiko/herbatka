import { Panel } from '../../components/ui/page'
import { ListingRow } from './ListingRow'
import { useTeaShops } from './queries'

/** Enough to answer "where can I get this?" without turning a tea page into a price
 *  comparison site. Anybody who wants the twelfth cheapest can browse /shops. */
const WHERE_TO_BUY_SIZE = 10

/**
 * "Where to buy", on a tea's own page.
 *
 * The panel is **absent** rather than empty whenever there is nothing to say — no shop
 * carries it, the request is still in flight, or the request failed. An empty bordered
 * box reading "no shops" is worse than nothing on two counts: it takes up the space
 * where the reviews are, and it states a fact ("you cannot buy this") that a failed
 * request has not actually established.
 *
 * That is also why the failure branch is silent. Every other panel in the app surfaces
 * its error, and rightly — but those are the reason you opened the page. This one is a
 * bonus on somebody else's page, and an angry red box about a sidebar is a worse
 * experience than the sidebar quietly not being there.
 */
export function WhereToBuyPanel({ teaSlug, teaName }: { teaSlug: string; teaName: string }) {
  const listings = useTeaShops(teaSlug, { page: 1, size: WHERE_TO_BUY_SIZE })

  const items = listings.data?.items ?? []
  if (items.length === 0) return null

  return (
    <Panel ariaLabel="Where to buy" testId="where-to-buy">
      <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
        Where to buy
      </h2>
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
        Shops that carry {teaName}.
      </p>
      <ul data-testid="where-to-buy-list">
        {items.map((listing) => (
          <ListingRow key={listing.id} listing={listing} shop={listing.shop} lead="shop" />
        ))}
      </ul>
    </Panel>
  )
}

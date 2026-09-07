import { Link } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { TeaCupMark } from '../../components/ui/botanical'
import { Badge, Panel } from '../../components/ui/page'
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import { formatMoment } from '../../lib/format'
import type {
  FeedActor,
  FeedBrewedItem,
  FeedItem,
  FeedReviewItem,
  FeedStockedItem,
} from '../../lib/friend'
import { formatScore } from '../review/format'

/**
 * One row of the activity timeline, in its three shapes.
 *
 * This used to live in `FeedPage.tsx` and be exported from it so the home page could show
 * the first few of the same stream. The page is gone — the home panel turned out to be
 * enough of it — and the rows outlived it, which is why they are a file of their own now
 * rather than a component exported from a screen that no longer exists.
 *
 * Nothing here fetches. The rows are handed whatever `GET /home` already returned, which
 * is the same `FeedItem` union the feed endpoint serves.
 */

/**
 * Who did the thing, as a face and a link to them.
 *
 * `actor` is nullable on a stocked item — a tin outlives the account of whoever bought it
 * — so "Somebody" is a real case rather than a defensive branch, and it gets neither a
 * link nor an avatar: there is nobody to link to, and initials for a person we cannot
 * name would be an invention.
 */
function Actor({ actor }: { actor: FeedActor | null }) {
  if (!actor) {
    return <span className="font-medium text-brand-900 dark:text-brand-100">Somebody</span>
  }

  return (
    <>
      <Avatar src={actor.avatar_url} name={actor.display_name} size="sm" />
      <Link
        to={`/users/${actor.id}`}
        className="font-medium text-brand-900 hover:underline dark:text-brand-100"
      >
        {actor.display_name}
      </Link>
    </>
  )
}

/** 12.5 → "12.5 g", 100 → "100 g". Trailing ".0" on a bag of tea reads like a lab
 *  notebook. */
function formatGrams(grams: number): string {
  return `${Number.isInteger(grams) ? grams : grams.toFixed(1)} g`
}

/**
 * A friend rated something. The tea is the link and the heading, because the tea is what
 * you would act on — you cannot do anything with the fact that Ada was drinking.
 */
function ReviewItem({ item }: { item: FeedReviewItem }) {
  return (
    <Panel as="li" testId="feed-item-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <Actor actor={item.actor} />
            <span>rated</span>
          </p>
          <h2 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            <Link to={`/teas/${item.tea.slug}`} className="hover:underline">
              {item.tea.name}
            </Link>
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Badge tone="brand">{TEA_TYPE_LABELS[item.tea.tea_type]}</Badge>
            <span>{formatMoment(item.at)}</span>
          </p>
        </div>
        <p
          data-testid={`feed-score-${item.tea.slug}`}
          className="text-2xl font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {formatScore(item.score)}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/10</span>
        </p>
      </div>

      {item.body && (
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {item.body}
        </p>
      )}
    </Panel>
  )
}

/**
 * A tin appeared on a shelf you share. The link goes to the *household*, not the tea:
 * the useful next move is "go see what else is on that shelf", and the tea page would
 * not tell you the tin exists.
 *
 * `actor` is nullable on this kind and not on a review — a tin can outlive whoever put
 * it there, and tins older than the `added_by` column never had an answer. "Somebody" is
 * the honest word for that; inventing a name, or dropping the item from the stream, both
 * hide a tin that really is on the shelf.
 */
function StockedItem({ item }: { item: FeedStockedItem }) {
  return (
    <Panel as="li" testId="feed-item-stocked">
      <p className="flex flex-wrap items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
        <Actor actor={item.actor} /> added {formatGrams(item.grams)} of{' '}
        <span className="font-medium text-brand-900 dark:text-brand-100">{item.tea.name}</span> to{' '}
        <Link
          to={`/households/${item.household.id}`}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          {item.household.name}
        </Link>
      </p>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <Badge>{TEA_TYPE_LABELS[item.tea.tea_type]}</Badge>
        <span>{formatMoment(item.at)}</span>
      </p>
    </Panel>
  )
}

/**
 * Somebody on a shelf you share made a cup.
 *
 * The quietest row in the stream, and deliberately so. A rating is an opinion worth
 * reading and a new tin is a thing you can go and use; a cup of tea is neither — it is
 * companionship. It gets one line, no heading and no card furniture, so that a household
 * that drinks six cups a day does not bury the two reviews underneath them.
 *
 * The note is the exception and the reason this row is worth having at all. "Last of the
 * tin" or "couldn't sleep" is the most human thing the whole app records, and it is
 * already sitting in the ledger.
 *
 * Like `StockedItem`, the link goes to the *household* rather than the tea: the useful
 * next move is to see what is left on that shelf.
 */
function BrewedItem({ item }: { item: FeedBrewedItem }) {
  return (
    <li
      data-testid="feed-item-brewed"
      className="flex items-start gap-3 px-1 py-3 text-sm text-neutral-600 dark:text-neutral-400"
    >
      <TeaCupMark aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-leaf-600" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1">
          <Actor actor={item.actor} /> brewed {formatGrams(item.grams)} of{' '}
          <Link
            to={`/teas/${item.tea.slug}`}
            className="font-medium text-brand-900 hover:underline dark:text-brand-100"
          >
            {item.tea.name}
          </Link>{' '}
          from{' '}
          <Link
            to={`/households/${item.household.id}`}
            className="font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            {item.household.name}
          </Link>
        </p>
        {item.note && (
          <p className="mt-0.5 text-xs italic text-neutral-600 dark:text-neutral-400">
            “{item.note}”
          </p>
        )}
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {formatMoment(item.at)}
        </p>
      </div>
    </li>
  )
}

/** The discriminator does the work. Three kinds, three shapes on screen — collapsing
 *  them into one row with a verb slot would make "rated 9", "added 100 g" and "brewed
 *  5 g" look like the same event, which they are not: the first is an opinion, the
 *  second is a thing you can go and use, and the third is neither.
 *
 *  Exported so the home page can show the first few of the same timeline without a
 *  second rendering of the same data that could drift from this one. */
export function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === 'review') return <ReviewItem item={item} />
  if (item.kind === 'stocked') return <StockedItem item={item} />
  return <BrewedItem item={item} />
}

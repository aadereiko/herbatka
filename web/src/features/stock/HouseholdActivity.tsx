import { useState } from 'react'
import { Link } from 'react-router'

import { BrewIcon } from '../../components/ui/botanical'
import { Button } from '../../components/ui/button'
import { ErrorNote, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { HouseholdEvent } from '../../lib/household'
import { STOCK_EVENT_LABELS } from '../../lib/household'
import { describeActor, formatDelta, formatMoment } from './format'
import { useHouseholdActivity } from './queries'

/**
 * What has been happening on this shelf: every cup, tin and recount, newest first.
 *
 * The sibling of the tin page's History, one level up. That answers "what happened to
 * this tin"; this answers "what has been happening in this house", which is the question
 * somebody actually opens a shared shelf to ask.
 *
 * ## Why the tea is on every row and the tin's log does not need it
 *
 * On a tin's own page the heading already says which tea it is, so its log can leave the
 * subject implicit. A shelf-wide timeline cannot: "brewed −5 g · Ada · this morning" with
 * no subject is unreadable, which is why the server sends `tea` on this shape and not on
 * the other.
 *
 * ## Why brewing gets an icon and the rest do not
 *
 * The brief for this panel was "an activity of tea drinking". Every kind is here, because
 * a timeline that hides the restocks is a timeline that cannot explain where the tea came
 * from — but the cups are what somebody came to read, so the cups are the rows that carry
 * a mark. Everything else is named in words like the rest of the app.
 */

const PAGE_SIZE = 12

function ActivityRow({ event, householdId }: { event: HouseholdEvent; householdId: string }) {
  const outward = event.delta_grams < 0
  return (
    <li className="flex items-baseline gap-2.5 border-b border-brand-100 py-2.5 last:border-0 dark:border-neutral-800">
      {event.kind === 'brew' ? (
        <BrewIcon glyph="cup" aria-hidden="true" className="size-4 shrink-0 translate-y-0.5 text-leaf-600" />
      ) : (
        <span aria-hidden="true" className="size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium text-brand-900 dark:text-brand-100">
            {describeActor(event)}
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">
            {STOCK_EVENT_LABELS[event.kind].toLowerCase()}
          </span>
          <span
            className={`font-semibold tabular-nums ${
              outward
                ? 'text-neutral-700 dark:text-neutral-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {formatDelta(event.delta_grams)}
          </span>
          <Link
            to={`/households/${householdId}/stock/${event.item_id}`}
            className="font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            {event.tea.name}
          </Link>
        </p>
        {event.note && (
          <p className="text-xs italic text-neutral-600 dark:text-neutral-400">“{event.note}”</p>
        )}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {formatMoment(event.occurred_at)}
        </p>
      </div>
    </li>
  )
}

export function HouseholdActivity({ householdId }: { householdId: string }) {
  // Grows rather than pages. A shelf's history is read as a story from the top down, and
  // a "next" button that replaces what you have just read is the wrong control for that —
  // whereas a stock *list* is a lookup, which is why that one pages.
  const [size, setSize] = useState(PAGE_SIZE)
  const activity = useHouseholdActivity(householdId, { page: 1, size })

  const events = activity.data?.items ?? []
  const total = activity.data?.total ?? 0

  return (
    <Panel ariaLabel="Shelf activity" testId="household-activity">
      <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">Activity</h2>

      {activity.isPending && (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading activity…</span>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {activity.isError && (
        <ErrorNote testId="household-activity-error">{describeApiError(activity.error)}</ErrorNote>
      )}

      {!activity.isPending && !activity.isError && events.length === 0 && (
        <p data-testid="household-activity-empty" className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing has happened on this shelf yet. Add a tin, then record a brew, and it
          shows up here.
        </p>
      )}

      {events.length > 0 && (
        <>
          <ul>
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} householdId={householdId} />
            ))}
          </ul>
          {total > events.length && (
            <div className="mt-3">
              <Button testId="household-activity-more" onClick={() => setSize((n) => n + PAGE_SIZE)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

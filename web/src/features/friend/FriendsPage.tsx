import { Link } from 'react-router'

import { PageHeading, PageShell } from '../../components/ui/page'
import { BlockedPanel } from './BlockedPanel'
import { FriendsPanel } from './FriendsPanel'
import { PeopleSearch } from './PeopleSearch'
import { RequestsPanel } from './RequestsPanel'

/**
 * Everything about who you know, on one page and in the order you need it.
 *
 * Requests first, because a request is the only thing here that is waiting on you — and
 * it is what the nav badge sent you to deal with. Then the friends you already have,
 * then the search that grows the list. Blocked last, and only if there is anybody in it.
 *
 * Behind `RequireAuth`: every endpoint under it is answered relative to the caller, so
 * there is nothing on this page that means anything to a stranger.
 */
export function FriendsPage() {
  return (
    <PageShell>
      <PageHeading
        title="Friends"
        subtitle="What your friends rate shows up in your feed, and yours in theirs."
        actions={
          <Link
            to="/feed"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Your feed →
          </Link>
        }
      />

      <div className="space-y-6">
        <RequestsPanel />
        <FriendsPanel />
        <PeopleSearch />
        <BlockedPanel />
      </div>
    </PageShell>
  )
}

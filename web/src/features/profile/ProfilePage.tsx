import { Link, useParams } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { LinkButton } from '../../components/ui/button'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageShell,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { ApiError, describeApiError } from '../../lib/api'
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import { formatDay } from '../../lib/format'
import type { ProfileReview, PublicProfile } from '../../lib/profile'
import { pluralise } from '../catalog/format'
import { formatAverage, formatScore } from '../review/format'
import { ReviewDetails } from '../review/ReviewList'
import { FriendAction } from './FriendAction'
import { hasProfileConnections } from './connections-visibility'
import { ProfileConnections } from './ProfileConnections'
import { useProfile } from './queries'
import { BrewIcon } from '../../components/ui/botanical'

/** One number and what it counts. Three of them, and the average is the one that is
 *  allowed to be absent — somebody who has rated nothing has no average, and "0.0" would
 *  read as a person who hates every tea they have ever drunk. */
function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-1 text-2xl font-semibold text-brand-900 dark:text-brand-100"
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * One of their recent reviews. The tea is the heading and the link, as on `/reviews/mine`
 * and in the feed: the tea is the thing a reader can act on, where "Ada thought about a
 * cup" is not somewhere you can go.
 *
 * The aspects and the notes come from `ReviewDetails`, the same component the tea page
 * uses, so a review does not describe a cup differently depending on which screen you
 * read it from. It carries no author line here — the whole page is the author.
 */
function ProfileReviewRow({ review }: { review: ProfileReview }) {
  return (
    <li
      data-testid="profile-review"
      className="border-b border-brand-100 py-3 last:border-0 dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            <Link to={`/teas/${review.tea.slug}`} className="hover:underline">
              {review.tea.name}
            </Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Badge tone="brand">{TEA_TYPE_LABELS[review.tea.tea_type]}</Badge>
            <span>{formatDay(review.created_at)}</span>
          </p>
        </div>
        <p
          data-testid={`profile-review-score-${review.tea.slug}`}
          className="text-xl font-semibold tabular-nums text-brand-900 dark:text-brand-100"
        >
          {formatScore(review.score)}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">/10</span>
        </p>
      </div>
      <ReviewDetails review={review} />
    </li>
  )
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const { friend_state } = profile
  // Decides the *layout*, not just whether the aside renders — see the note on the grid
  // below, and `hasProfileConnections` for why the predicate is exported rather than
  // inferred from whether the component returned anything.
  const connections = hasProfileConnections(profile)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name}
            size="lg"
            testId="profile-avatar"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-brand-900 dark:text-brand-100">
              {profile.display_name}
              {profile.pronouns && (
                <span
                  data-testid="profile-pronouns"
                  className="ml-2 text-base font-normal text-neutral-500 dark:text-neutral-400"
                >
                  ({profile.pronouns})
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {/* "Kraków, Poland", or either half on its own. Joined here rather than
                  server-side because the two are separate facts — somebody may give a
                  country and no city, or the reverse — and a pre-joined string would make
                  "which of these did they actually say" unanswerable. */}
              {(profile.city || profile.country) && (
                <span data-testid="profile-location">
                  {[profile.city, profile.country?.name].filter(Boolean).join(', ')} ·{' '}
                </span>
              )}
              <span data-testid="profile-member-since">
                Member since {formatDay(profile.member_since)}
              </span>
            </p>
            {/* Under the name, above everything else, and in the ink the headings wear.
                A status is the one thing on this page that is true *today* — the bio is a
                standing description and the counts are history — so it goes where the eye
                already is rather than into the panel below. */}
            {profile.status && (
              <p
                data-testid="profile-status"
                className="mt-2 flex items-start gap-1.5 text-sm text-brand-900 dark:text-brand-100"
              >
                <BrewIcon glyph="cup" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-leaf-600" />
                <span>{profile.status}</span>
              </p>
            )}
          </div>
        </div>

        {/* Three branches rather than two, because null and 'self' are the same absence
            of buttons for opposite reasons: nobody is signed in, or this is you. */}
        {friend_state === 'self' ? (
          <LinkButton to="/settings" variant="primary" testId="profile-edit">
            Edit your profile
          </LinkButton>
        ) : friend_state ? (
          <FriendAction profile={profile} state={friend_state} />
        ) : null}
      </div>

      {profile.bio && (
        <Panel className="mb-6">
          <p
            data-testid="profile-bio"
            className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
          >
            {profile.bio}
          </p>
        </Panel>
      )}

      {profile.favourite_tea_type && (
        <p className="mb-6 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <span>Drinks mostly</span>
          <span data-testid="profile-favourite">
            <Badge tone="brand">{TEA_TYPE_LABELS[profile.favourite_tea_type]}</Badge>
          </span>
        </p>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Reviews" value={String(profile.review_count)} testId="profile-review-count" />
        <Fact
          label="Average score"
          value={
            profile.average_score_given === null
              ? '—'
              : formatAverage(profile.average_score_given)
          }
          testId="profile-average"
        />
        {/* No household tile. household_count now means "how many you may see", so on a
            stranger's profile it would read "Households 0" about somebody who has three
            — a fact about the reader wearing the label of a fact about the person. The
            panel below shows the ones you may see, and shows nothing when there are
            none, which is the honest version of the same information. */}
      </dl>

      {/* What they have been doing is the main block; who they know is beside it.
          
          All three used to be full-width and stacked, with the two connection panels
          sharing a row *under* the reviews. Same components, same data — but a page that
          gives equal width to "what this person thinks about tea" and "which households
          they are in" is a page with no opinion about why anybody opened it.
          
          The grid collapses to one column when there is nothing to put beside the
          reviews, which is every signed-out visit and most stranger visits. Without that
          branch the reviews would sit in two thirds of the page beside a column of air. */}
      <div className={connections ? 'grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}>
        <Panel ariaLabel="Recent reviews" testId="profile-reviews">
          <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Recent reviews
          </h2>
          {profile.recent_reviews.length === 0 ? (
            <p
              data-testid="profile-reviews-empty"
              className="text-sm text-neutral-600 dark:text-neutral-400"
            >
              {friend_state === 'self'
                ? 'You have not rated anything yet.'
                : `${profile.display_name} has not rated anything yet.`}
            </p>
          ) : (
            <>
              <ul>
                {profile.recent_reviews.map((review) => (
                  <ProfileReviewRow key={review.id} review={review} />
                ))}
              </ul>
              {/* The list is the most recent handful, not the whole history — saying so is
                  cheaper than a pagination control nobody asked for on somebody else's
                  page. `review_count` above is the real total. */}
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                The most recent of {pluralise(profile.review_count, 'review')}.
              </p>
            </>
          )}
        </Panel>

        {connections && <ProfileConnections profile={profile} />}
      </div>
    </>
  )
}

/**
 * Somebody's profile, `/users/:id`.
 *
 * Public: it renders for a signed-out visitor, and the server answers the same document
 * minus `friend_state`. That is the whole reason the page is worth having — a review
 * carries a name, and a name with nowhere to click is a dead end for exactly the visitor
 * who has not signed up yet.
 *
 * There is no email anywhere on it, and none is available to put there: `PublicProfile`
 * does not carry one. On your own profile `useAuth().user.email` is one import away, and
 * putting it here would mean your own page leaks nothing while every other page shows
 * nothing — an inconsistency that survives right up until somebody screenshots their
 * profile. See `lib/profile.ts`.
 */
export function ProfilePage() {
  const { id = '' } = useParams()
  const profile = useProfile(id)

  const missing = profile.error instanceof ApiError && profile.error.status === 404

  return (
    <PageShell>
      {profile.isPending && (
        <div role="status" aria-live="polite" data-testid="profile-loading" className="space-y-4">
          <span className="sr-only">Loading this profile…</span>
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {missing && (
        <EmptyState title="No such person" testId="profile-missing">
          <p>
            This account does not exist, or it has been closed. The link may be older than
            the person.
          </p>
          <Link to="/teas" className="font-medium text-brand-700 dark:text-brand-300">
            Browse the catalog
          </Link>
        </EmptyState>
      )}

      {profile.isError && !missing && (
        <ErrorNote testId="profile-error">{describeApiError(profile.error)}</ErrorNote>
      )}

      {profile.data && <ProfileBody profile={profile.data} />}
    </PageShell>
  )
}

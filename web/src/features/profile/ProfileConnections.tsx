import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Avatar } from '../../components/ui/avatar'
import { EntityImage } from '../../components/ui/image'
import { Badge, Panel } from '../../components/ui/page'
import type { ProfileHousehold, ProfilePerson, PublicProfile } from '../../lib/profile'

type FriendState = PublicProfile['friend_state']

/**
 * Whether a panel has anything to say at all.
 *
 * Empty and absent are two different answers here, and telling them apart is most of the
 * work. The server has already applied the visibility rule before the lists reach us — see
 * `lib/profile.ts` — so an empty list on a stranger's profile does not mean "they have
 * none", it means "none that you may see", which is a fact about you rather than about
 * them and is not worth a box on their page. An empty list on your own profile or on a
 * friend's is the real answer, and saying it out loud is the point.
 *
 * Note what this does *not* do: work out what was filtered. It cannot. The browser is
 * never told what it was not allowed to see, and a second opinion computed here could
 * only ever disagree with the one that matters.
 */
function worthShowing(count: number, state: FriendState): boolean {
  return count > 0 || state === 'self' || state === 'friends'
}

/**
 * One household, at profile distance: its picture, its name, and whether you are in it.
 *
 * `shared` decides whether the name is a link, and it is the one thing on this row that
 * must not be got wrong. False means this is a household of theirs that you are not a
 * member of — you are allowed to know it exists and what it is called, and nothing else,
 * and `GET /households/{id}` will answer you 404 on purpose. Linking it anyway would put
 * a "no such household" page one click away from a link the app itself offered, which
 * reads as a bug rather than as a boundary. So the shared ones are links and the rest are
 * plain text, and that difference is asserted in the tests as an *absent* link.
 *
 * The marker is suppressed on your own profile: every household there is one you are in,
 * and a badge that appears on every row is a badge that says nothing.
 */
function HouseholdEntry({
  household,
  state,
}: {
  household: ProfileHousehold
  state: FriendState
}) {
  return (
    <li
      data-testid={`profile-household-${household.id}`}
      className="flex items-center gap-2.5 py-1.5"
    >
      {/* EntityImage, not Avatar: a household is a place, and it wears the same leaf
          fallback here as it does on /households. Initials belong to people. */}
      <EntityImage
        src={household.image_url}
        alt=""
        className="size-8 shrink-0 rounded-lg"
        testId={`profile-household-avatar-${household.id}`}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-900 dark:text-brand-100">
        {household.shared ? (
          <Link to={`/households/${household.id}`} className="hover:underline">
            {household.name}
          </Link>
        ) : (
          household.name
        )}
      </span>
      {/* Outside the link deliberately, so the link's accessible name is the household
          and not "Home, shared with you". */}
      {household.shared && state !== 'self' && <Badge tone="brand">Shared with you</Badge>}
    </li>
  )
}

/** A friend of theirs. The name is the link and the avatar is not, as on `/friends` — two
 *  adjacent targets to the same place is one stop too many for a keyboard. */
function FriendEntry({ person }: { person: ProfilePerson }) {
  return (
    <li data-testid={`profile-friend-${person.id}`} className="flex items-center gap-2.5 py-1.5">
      <Avatar
        src={person.avatar_url}
        name={person.display_name}
        size="sm"
        testId={`profile-friend-avatar-${person.id}`}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-900 dark:text-brand-100">
        <Link to={`/users/${person.id}`} className="hover:underline">
          {person.display_name}
        </Link>
      </span>
    </li>
  )
}

/** The shell both panels wear. Smaller than the reviews panel beside them on purpose:
 *  these are context for the person, not the reason anybody opened the page. */
function ConnectionPanel({
  title,
  testId,
  children,
}: {
  title: string
  testId: string
  children: ReactNode
}) {
  return (
    <Panel ariaLabel={title} testId={testId}>
      <h2 className="mb-2 text-lg font-semibold text-brand-900 dark:text-brand-100">{title}</h2>
      {children}
    </Panel>
  )
}

function EmptyNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p data-testid={testId} className="text-sm text-neutral-600 dark:text-neutral-400">
      {children}
    </p>
  )
}

/**
 * An empty panel here is only ever your own or a friend's, so it has exactly two things to
 * say: on yours, a way to fix it; on theirs, the plain fact. A stranger's empty list never
 * gets this far — `worthShowing` drops the whole panel.
 */
function HouseholdsPanel({
  households,
  state,
  name,
}: {
  households: ProfileHousehold[]
  state: FriendState
  name: string
}) {
  return (
    <ConnectionPanel title="Households" testId="profile-households">
      {households.length === 0 ? (
        <EmptyNote testId="profile-households-empty">
          {state === 'self' ? (
            <>
              You are not in a household yet — it is the shelf everybody in one shares.{' '}
              <Link to="/households" className="font-medium text-brand-700 dark:text-brand-300">
                Start or join one
              </Link>
              .
            </>
          ) : (
            `${name} is not in a household.`
          )}
        </EmptyNote>
      ) : (
        <ul>
          {households.map((household) => (
            <HouseholdEntry key={household.id} household={household} state={state} />
          ))}
        </ul>
      )}
    </ConnectionPanel>
  )
}

function FriendsPanel({
  friends,
  state,
  name,
}: {
  friends: ProfilePerson[]
  state: FriendState
  name: string
}) {
  return (
    <ConnectionPanel title="Friends" testId="profile-friends">
      {friends.length === 0 ? (
        <EmptyNote testId="profile-friends-empty">
          {state === 'self' ? (
            <>
              You have not added anyone yet.{' '}
              <Link to="/friends" className="font-medium text-brand-700 dark:text-brand-300">
                Find somebody you know
              </Link>
              .
            </>
          ) : (
            /* Not "has not added anyone": the list never contains the person reading
               it, and `worthShowing` means the only person who ever reads this line on
               somebody else's profile is a friend of theirs. Empty therefore means "you
               are the only one", and saying otherwise tells the reader something they
               can see is false. */
            `You are the only person ${name} has added.`
          )}
        </EmptyNote>
      ) : (
        <ul>
          {friends.map((person) => (
            <FriendEntry key={person.id} person={person} />
          ))}
        </ul>
      )}
    </ConnectionPanel>
  )
}

/**
 * The two panels that say who this person is connected to, or neither of them.
 *
 * Two panels rather than one list because they answer different questions and one of them
 * is actionable — a household you share is somewhere you can go, a household you do not is
 * only a name. They sit below the reviews and share a row at `sm`, which is the whole
 * statement of their importance: the reviews are why anybody opened the page.
 *
 * Both can vanish entirely, and for a signed-out visitor both always do. That is the
 * difference this component exists to get right: an empty box on a stranger's profile
 * would announce that there is something being withheld, which is one more bit than the
 * rule intends to give away.
 */
export function ProfileConnections({ profile }: { profile: PublicProfile }) {
  const { friend_state: state, households, friends } = profile

  const showHouseholds = worthShowing(households.length, state)
  const showFriends = worthShowing(friends.length, state)
  if (!showHouseholds && !showFriends) return null

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {showHouseholds && (
        <HouseholdsPanel households={households} state={state} name={profile.display_name} />
      )}
      {showFriends && (
        <FriendsPanel friends={friends} state={state} name={profile.display_name} />
      )}
    </div>
  )
}

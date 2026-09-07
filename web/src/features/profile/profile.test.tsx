import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type {
  ProfileHousehold,
  ProfilePerson,
  ProfileReview,
  PublicProfile,
} from '../../lib/profile'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'
import { ThemeProvider } from '../../components/ui/theme'

/* --------------------------------------------------------------------- fixtures */

const ada: User = {
  id: 'user-1',
  email: 'ada@herbatka.test',
  display_name: 'Ada Lovelace',
  role: 'user',
  avatar_url: null,
  pronouns: null,
  bio: 'Counting steps, mostly.',
  status: null,
  city: null,
  country: null,
  favourite_tea_type: null,
  created_at: '2026-01-01T09:00:00Z',
}

const session: Session = {
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  user: ada,
}

const jasmineReview: ProfileReview = {
  id: 'rev-1',
  tea: {
    id: 'tea-1',
    slug: 'jasmine-pearls',
    name: 'Jasmine Pearls',
    tea_type: 'green',
    image_url: null,
  },
  score: 9,
  body: 'Floral without tipping into soap.',
  created_at: '2026-08-20T10:00:00Z',
}

/** One you are in too, so it is somewhere you can actually go. */
const sharedHousehold: ProfileHousehold = {
  id: 'house-1',
  name: 'Bletchley Kitchen',
  image_url: null,
  shared: true,
}

/** One of hers that you are not in. You may know the name; the detail endpoint will 404
 *  at you, which is why nothing may render this as a link. */
const theirHousehold: ProfileHousehold = {
  id: 'house-2',
  name: 'Flat 3',
  image_url: null,
  shared: false,
}

const alan: ProfilePerson = { id: 'user-3', display_name: 'Alan Turing', avatar_url: null }

/** Somebody else, seen by a signed-in stranger. */
const grace: PublicProfile = {
  id: 'user-2',
  display_name: 'Grace Hopper',
  avatar_url: null,
  pronouns: 'she/her',
  bio: 'Compiles her own blends.',
  status: 'Working through a kilo of dan cong',
  city: 'Arlington',
  country: { code: 'US', name: 'United States of America' },
  favourite_tea_type: 'oolong',
  member_since: '2026-02-01T09:00:00Z',
  review_count: 12,
  average_score_given: 8.25,
  // Both counts are the size of what this viewer was shown, not her real totals — the
  // server has already dropped whatever the rule hides, and never says how much.
  household_count: 2,
  friend_state: 'none',
  recent_reviews: [jasmineReview],
  households: [sharedHousehold, theirHousehold],
  friends: [alan],
  friend_count: 1,
}

/** Ada's own, which is where an email would leak from if one were ever going to. */
const mine: PublicProfile = {
  ...grace,
  id: ada.id,
  display_name: ada.display_name,
  pronouns: null,
  status: null,
  city: null,
  country: null,
  bio: 'Counting steps, mostly.',
  friend_state: 'self',
  // Your own profile shows all of yours, and every one of them is one you are in.
  households: [sharedHousehold],
  household_count: 1,
  friends: [{ id: grace.id, display_name: grace.display_name, avatar_url: null }],
  friend_count: 1,
}

/** Nothing the viewer may see. Not the same document as "they have none" — from the
 *  browser the two are indistinguishable, which is exactly the point of the rule. */
const nothingVisible = { households: [], household_count: 0, friends: [], friend_count: 0 }

/* ------------------------------------------------------------------ test harness */

type Handler = () => Response

type Call = { key: string; body: string | null }

const calls: Call[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(handlers: Record<string, Handler>) {
  calls.length = 0
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://localhost')
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname.replace('/api/v1', '')}`
    calls.push({ key, body: (init?.body as string) ?? null })

    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${key}`))
    return Promise.resolve(handler())
  })
}

const countOf = (key: string) => calls.filter((call) => call.key === key).length

const bodyOf = (key: string): unknown => JSON.parse(calls.find((c) => c.key === key)?.body ?? 'null')

function renderApp(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

const COUNTRIES = [
  { code: 'IE', name: 'Ireland' },
  { code: 'PL', name: 'Poland' },
  { code: 'GB', name: 'United Kingdom' },
]

const signedIn = (overrides: Record<string, Handler> = {}) =>
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    // Fetched by the settings form's country picker. Answered here rather than in each
    // test because the form asks for it on mount, and an unmocked request rejects.
    'GET /countries': () => json(COUNTRIES),
    ...overrides,
  })

const signedOut = (overrides: Record<string, Handler> = {}) =>
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    ...overrides,
  })

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------ the profile */

test('a profile shows who they are, what they drink, and what they have rated', async () => {
  signedIn({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Grace Hopper')
  expect(screen.getByTestId('profile-pronouns')).toHaveTextContent('she/her')
  expect(screen.getByTestId('profile-location')).toHaveTextContent('Arlington')
  expect(screen.getByTestId('profile-member-since')).toHaveTextContent('Member since')
  expect(screen.getByTestId('profile-bio')).toHaveTextContent('Compiles her own blends.')
  expect(screen.getByTestId('profile-favourite')).toHaveTextContent('Oolong')

  expect(screen.getByTestId('profile-review-count')).toHaveTextContent('12')
  // One decimal, always: 8.25 is a mean of something and "8" would read as a verdict.
  expect(screen.getByTestId('profile-average')).toHaveTextContent('8.3')

  // The reviews are the reason to be on the page, and each one is a way back to the tea.
  const review = screen.getByTestId('profile-review')
  expect(within(review).getByRole('link', { name: 'Jasmine Pearls' })).toHaveAttribute(
    'href',
    '/teas/jasmine-pearls',
  )
  expect(screen.getByTestId('profile-review-score-jasmine-pearls')).toHaveTextContent('9')
  expect(review).toHaveTextContent('Floral without tipping into soap.')
})

test('an unrated person says so rather than showing an empty list', async () => {
  signedIn({
    'GET /users/user-2/profile': () =>
      json({ ...grace, recent_reviews: [], review_count: 0, average_score_given: null }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByTestId('profile-reviews-empty')).toHaveTextContent(
    'Grace Hopper has not rated anything yet.',
  )
  // Not "0.0". An unrated person is not somebody who scores every tea zero.
  expect(screen.getByTestId('profile-average')).toHaveTextContent('—')
})

test('an unknown id gets a sentence, not a broken page', async () => {
  signedIn({ 'GET /users/user-404/profile': () => json({ detail: 'User not found' }, 404) })
  renderApp('/users/user-404')

  expect(await screen.findByTestId('profile-missing')).toBeInTheDocument()
  expect(screen.queryByTestId('profile-error')).toBeNull()
})

/* -------------------------------------------------------------------- the avatar */

test('the avatar falls back to their initials when there is no picture', async () => {
  signedIn({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  // Initials, not a generic silhouette: a members list of identical grey heads is a list
  // that actively fights recognition.
  const fallback = await screen.findByTestId('profile-avatar')
  expect(fallback).toHaveTextContent('GH')
  expect(fallback.tagName).toBe('SPAN')

  cleanup()
  signedIn({
    'GET /users/user-2/profile': () => json({ ...grace, avatar_url: '/media/grace.png' }),
  })
  renderApp('/users/user-2')

  const picture = await screen.findByTestId('profile-avatar')
  expect(picture.tagName).toBe('IMG')
  expect(picture).toHaveAttribute('src', '/media/grace.png')
})

/* ------------------------------------------------ their households and their friends */

/**
 * The one that would go wrong quietly. A household with `shared: false` is one of theirs
 * that you are not in: the name is all you get, and `GET /households/{id}` answers you 404
 * by design. Wrapping every row in a `<Link>` looks identical on the page and sends
 * somebody to a "no such household" screen from a link the app offered them.
 *
 * So the assertion is an absence, not a presence — `queryByRole('link')` inside the row.
 * Checking only that "Flat 3" is on the page would pass in both worlds.
 */
test('a household you share is a link; one of theirs that you are not in is not', async () => {
  signedIn({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  const shared = await screen.findByTestId('profile-household-house-1')
  expect(within(shared).getByRole('link', { name: 'Bletchley Kitchen' })).toHaveAttribute(
    'href',
    '/households/house-1',
  )
  expect(shared).toHaveTextContent('Shared with you')

  const theirs = screen.getByTestId('profile-household-house-2')
  expect(theirs).toHaveTextContent('Flat 3')
  expect(within(theirs).queryByRole('link')).toBeNull()
  expect(screen.queryByRole('link', { name: /Flat 3/ })).toBeNull()
  // The marker is about you being in it, so the one you are not in must not carry it.
  expect(theirs).not.toHaveTextContent('Shared with you')

  // No "2 of 5" anywhere: the API does not send the total, precisely so the page cannot
  // publish the number the rule is hiding.
  expect(screen.getByTestId('profile-households')).not.toHaveTextContent(' of ')
})

test('the friends panel lists people and each one is a way to their profile', async () => {
  signedIn({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  const friend = await screen.findByTestId('profile-friend-user-3')
  expect(within(friend).getByRole('link', { name: 'Alan Turing' })).toHaveAttribute(
    'href',
    '/users/user-3',
  )
})

/**
 * Signed out both lists come back empty, and empty must render as *nothing* rather than as
 * an empty box. A box saying "Households" with nothing under it announces that something
 * is being withheld, which is one bit more than the rule means to give away — and to a
 * visitor with no account it reads as a person with no life rather than as a boundary.
 */
test('a signed-out visitor gets neither panel, not two empty ones', async () => {
  signedOut({
    'GET /users/user-2/profile': () => json({ ...grace, ...nothingVisible, friend_state: null }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Grace Hopper')
  expect(screen.queryByTestId('profile-households')).toBeNull()
  expect(screen.queryByTestId('profile-friends')).toBeNull()
  // Signed out the nav carries no Households entry either, so these headings can only
  // come from the panels.
  expect(screen.queryByRole('heading', { name: 'Households' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Friends' })).toBeNull()
})

test('a stranger with nothing in common gets neither panel', async () => {
  signedIn({
    'GET /users/user-2/profile': () => json({ ...grace, ...nothingVisible, friend_state: 'none' }),
  })
  renderApp('/users/user-2')

  // The friend action proves the page finished rendering, so the two nulls below are
  // about the panels rather than about a page that is still pending.
  expect(await screen.findByTestId('profile-add-friend')).toBeInTheDocument()
  expect(screen.queryByTestId('profile-households')).toBeNull()
  expect(screen.queryByTestId('profile-friends')).toBeNull()
})

/** Your own is the one profile where empty is worth a box, because you are the one person
 *  who can do something about it. */
test('your own empty profile invites you to start a household and to find people', async () => {
  signedIn({
    'GET /users/user-1/profile': () => json({ ...mine, ...nothingVisible }),
  })
  renderApp('/users/user-1')

  const households = await screen.findByTestId('profile-households-empty')
  expect(households).toHaveTextContent('You are not in a household yet')
  expect(within(households).getByRole('link', { name: /Start or join one/ })).toHaveAttribute(
    'href',
    '/households',
  )

  const friends = screen.getByTestId('profile-friends-empty')
  expect(friends).toHaveTextContent('You have not added anyone yet.')
  expect(within(friends).getByRole('link', { name: /Find somebody you know/ })).toHaveAttribute(
    'href',
    '/friends',
  )
})

/** A friend's empty list is the genuine article — you are shown all of theirs — so it is a
 *  fact to state, not an invitation, and not a blank panel either. */
test('a friend with no households says so rather than showing an empty box', async () => {
  signedIn({
    'GET /users/user-2/profile': () =>
      json({ ...grace, friend_state: 'friends', households: [], household_count: 0 }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByTestId('profile-households-empty')).toHaveTextContent(
    'Grace Hopper is not in a household.',
  )
  // Not the invitation — /households is somewhere you go about your own shelf.
  expect(screen.queryByRole('link', { name: /Start or join one/ })).toBeNull()
  // Her friends are all visible to a friend, so that panel is a list rather than a note.
  expect(screen.getByTestId('profile-friend-user-3')).toHaveTextContent('Alan Turing')
})

/**
 * The one empty state that is not simply "they have none". The server never puts the
 * reader in the list it sends them, and a stranger's empty panel is dropped before it
 * renders, so an empty friends panel is always a friend's, and always means their only
 * friend is you. Claiming they have added nobody would be contradicted by the fact that
 * they added the person reading it.
 */
test("a friend whose only friend is you says so, rather than claiming they have none", async () => {
  signedIn({
    'GET /users/user-2/profile': () =>
      json({ ...grace, friend_state: 'friends', friends: [], friend_count: 0 }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByTestId('profile-friends-empty')).toHaveTextContent(
    'You are the only person Grace Hopper has added.',
  )
  expect(screen.queryByTestId('profile-friends-empty')).not.toHaveTextContent('has not added')
})

/**
 * The two panels fall back differently on purpose. A person with no photo gets their
 * initials; a household gets the same leaf the rest of the app gives it. Initials
 * belong to people — "BK" is not what a kitchen looks like.
 */
test('a person with no picture falls back to initials, a household to the leaf', async () => {
  signedIn({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  const friend = await screen.findByTestId('profile-friend-avatar-user-3')
  expect(friend).toHaveTextContent('AT')
  expect(friend.tagName).toBe('SPAN')

  // EntityImage renders its placeholder under a `-placeholder` testid, the same one
  // /households and the catalog use.
  expect(screen.getByTestId('profile-household-avatar-house-1-placeholder')).toBeInTheDocument()
  expect(screen.queryByTestId('profile-household-avatar-house-1')).toBeNull()
})

/* ------------------------------------------------------------- who may do what */

test('your own profile offers editing and no friend action', async () => {
  signedIn({
    'GET /users/user-1/profile': () => json({ ...mine, recent_reviews: [], review_count: 0 }),
  })
  renderApp('/users/user-1')

  expect(await screen.findByTestId('profile-edit')).toHaveAttribute('href', '/settings')
  // 'self' and "signed out" are both no-buttons, for opposite reasons. Befriending
  // yourself is a 400 the UI should never let anybody find.
  expect(screen.queryByTestId('profile-friend-action')).toBeNull()
  expect(screen.queryByTestId('profile-add-friend')).toBeNull()
  expect(screen.getByTestId('profile-reviews-empty')).toHaveTextContent(
    'You have not rated anything yet.',
  )
})

/**
 * The page is public, which is the whole point of it — a review carries a name, and a
 * name that only becomes clickable once you have an account is a dead end for exactly
 * the visitor who has not made one.
 */
test('a profile read by a stranger offers no friend actions and asks nothing authenticated', async () => {
  signedOut({
    'GET /users/user-2/profile': () => json({ ...grace, ...nothingVisible, friend_state: null }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Grace Hopper')
  expect(screen.queryByTestId('profile-friend-action')).toBeNull()
  expect(screen.queryByTestId('profile-add-friend')).toBeNull()
  expect(screen.queryByTestId('profile-edit')).toBeNull()

  // `useFriendRequests` lives inside the friend action, so not rendering it is what stops
  // a public page firing an authenticated request for a guaranteed 401.
  expect(countOf('GET /friends/requests')).toBe(0)
})

/**
 * The absence that has to be asserted, because nothing else would ever notice it: the
 * profile is public, `PublicProfile` carries no email, and `useAuth().user.email` is one
 * import away on your own page. See `lib/profile.ts`.
 */
test('no email is rendered on a profile page, not even your own', async () => {
  signedIn({ 'GET /users/user-1/profile': () => json(mine) })
  renderApp('/users/user-1')

  await screen.findByTestId('profile-edit')

  expect(screen.queryByText(/ada@herbatka\.test/)).toBeNull()
  // Nothing that even looks like an address, so a future "signed in as …" line cannot
  // sneak one back on to the page.
  expect(document.body.textContent).not.toContain('@')
})

test('adding a friend from a profile uses the same mutation, and the state follows', async () => {
  let state: PublicProfile['friend_state'] = 'none'
  signedIn({
    'GET /users/user-2/profile': () => json({ ...grace, friend_state: state }),
    'POST /friends/requests': () => {
      state = 'outgoing'
      return json({
        id: 'req-9',
        user: { id: 'user-2', display_name: 'Grace Hopper', email: 'g@x.test', avatar_url: null },
        direction: 'outgoing',
        created_at: '2026-08-26T10:00:00Z',
      })
    },
  })
  renderApp('/users/user-2')

  fireEvent.click(await screen.findByTestId('profile-add-friend'))

  await waitFor(() => expect(countOf('POST /friends/requests')).toBe(1))
  expect(bodyOf('POST /friends/requests')).toEqual({ user_id: 'user-2' })

  // The friend mutations invalidate ['friends'], which this page is not part of. Without
  // the profile's own invalidation the button would sit on "Add friend" for ever.
  await waitFor(() => expect(screen.queryByTestId('profile-add-friend')).toBeNull())
  expect(screen.getByTestId('profile-friend-action')).toHaveTextContent('Request sent')
})

test('a friend gets the unfriend two-step rather than a bare button', async () => {
  signedIn({
    'GET /users/user-2/profile': () => json({ ...grace, friend_state: 'friends' }),
    'DELETE /friends/user-2': () => new Response(null, { status: 204 }),
  })
  renderApp('/users/user-2')

  // Unfriending is quietly destructive — nothing on screen says their side disappears
  // too — so it asks first, inline, and never through window.confirm.
  fireEvent.click(await screen.findByTestId('profile-unfriend'))
  expect(countOf('DELETE /friends/user-2')).toBe(0)

  fireEvent.click(screen.getByTestId('profile-confirm-unfriend'))
  await waitFor(() => expect(countOf('DELETE /friends/user-2')).toBe(1))
})

/* ------------------------------------------------------------------- the settings */

test('saving settings sends only what changed', async () => {
  signedIn({
    'PATCH /auth/me': () => json({ ...ada, pronouns: 'she/her' }),
  })
  renderApp('/settings')

  const form = await screen.findByTestId('settings-form')
  fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'she/her' } })
  fireEvent.submit(form)

  await waitFor(() => expect(countOf('PATCH /auth/me')).toBe(1))
  // One key. Not six fields rewritten to the values they already hold — which is what
  // makes two tabs editing different halves of one profile safe.
  expect(bodyOf('PATCH /auth/me')).toEqual({ pronouns: 'she/her' })
  expect(await screen.findByTestId('settings-note')).toHaveTextContent('Saved.')

  // And the nav caught up, because PATCH /auth/me answers with the whole user.
  expect(screen.getByTestId('account-menu')).toHaveTextContent('Ada Lovelace')

  // Submitting again with nothing touched is not a request at all.
  fireEvent.submit(form)
  expect(await screen.findByTestId('settings-note')).toHaveTextContent('Nothing to save')
  expect(countOf('PATCH /auth/me')).toBe(1)
})

test('clearing a field sends null, and an empty display name is refused before it is sent', async () => {
  signedIn({
    'PATCH /auth/me': () => json({ ...ada, bio: null }),
  })
  renderApp('/settings')

  const form = await screen.findByTestId('settings-form')

  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '   ' } })
  fireEvent.submit(form)
  expect(screen.getByTestId('display-name-error')).toHaveTextContent('Tell us what to call you.')
  expect(countOf('PATCH /auth/me')).toBe(0)

  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada Lovelace' } })
  // Emptying the box is "remove my bio", which is a different request from not
  // mentioning it — and only `null` says the first.
  fireEvent.change(screen.getByLabelText('About you'), { target: { value: '' } })
  fireEvent.submit(form)

  await waitFor(() => expect(countOf('PATCH /auth/me')).toBe(1))
  expect(bodyOf('PATCH /auth/me')).toEqual({ bio: null })
})

test('settings is behind the door', async () => {
  signedOut()
  renderApp('/settings')

  expect(await screen.findByTestId('login-page')).toBeInTheDocument()
  expect(screen.queryByTestId('settings-form')).toBeNull()
})

/* --------------------------------------------------------- status, city and country */

test('the picker offers the list the server sent, and sends back a code', async () => {
  signedIn({ 'PATCH /auth/me': () => json({ ...ada, city: 'Kraków' }) })
  renderApp('/settings')

  const form = await screen.findByTestId('settings-form')
  const country = await screen.findByLabelText('Country')
  await waitFor(() => expect(within(country).getAllByRole('option').length).toBe(4))

  // Every option the server will accept, plus a real "not saying" — without which there
  // would be no way to take a country back off once set.
  expect([...within(country).getAllByRole('option')].map((o) => o.textContent)).toEqual([
    'Not saying',
    'Ireland',
    'Poland',
    'United Kingdom',
  ])

  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Kraków' } })
  fireEvent.change(country, { target: { value: 'PL' } })
  fireEvent.submit(form)

  await waitFor(() => expect(countOf('PATCH /auth/me')).toBe(1))
  // The code, never the name. Names are presentation and change; codes do not.
  expect(bodyOf('PATCH /auth/me')).toEqual({ city: 'Kraków', country_code: 'PL' })
})

test('a status is saved on its own', async () => {
  signedIn({ 'PATCH /auth/me': () => json({ ...ada, status: 'Brewing' }) })
  renderApp('/settings')

  const form = await screen.findByTestId('settings-form')
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Brewing' } })
  fireEvent.submit(form)

  await waitFor(() => expect(countOf('PATCH /auth/me')).toBe(1))
  expect(bodyOf('PATCH /auth/me')).toEqual({ status: 'Brewing' })
})

test('clearing the country sends null rather than an empty string', async () => {
  signedIn({
    'POST /auth/refresh': () =>
      json({ ...session, user: { ...ada, country: { code: 'PL', name: 'Poland' } } }),
    'PATCH /auth/me': () => json({ ...ada, country: null }),
  })
  renderApp('/settings')

  const form = await screen.findByTestId('settings-form')
  const country = await screen.findByLabelText('Country')
  await waitFor(() => expect(within(country).getAllByRole('option').length).toBe(4))
  fireEvent.change(country, { target: { value: '' } })
  fireEvent.submit(form)

  await waitFor(() => expect(countOf('PATCH /auth/me')).toBe(1))
  expect(bodyOf('PATCH /auth/me')).toEqual({ country_code: null })
})

test('a profile reads “City, Country”, and either half stands alone', async () => {
  signedOut({ 'GET /users/user-2/profile': () => json(grace) })
  renderApp('/users/user-2')

  const place = await screen.findByTestId('profile-location')
  expect(place).toHaveTextContent('Arlington, United States of America')

  // The status sits under the name, because it is the one thing on the page that is true
  // today — the bio is a standing description and the counts are history.
  expect(screen.getByTestId('profile-status')).toHaveTextContent(
    'Working through a kilo of dan cong',
  )
})

test('a profile with a country and no city does not render a stray comma', async () => {
  signedOut({
    'GET /users/user-2/profile': () =>
      json({ ...grace, city: null, country: { code: 'IE', name: 'Ireland' } }),
  })
  renderApp('/users/user-2')

  expect(await screen.findByTestId('profile-location')).toHaveTextContent('Ireland ·')
})

test('a person who has said neither gets no place line at all', async () => {
  signedOut({
    'GET /users/user-2/profile': () => json({ ...grace, city: null, country: null }),
  })
  renderApp('/users/user-2')

  await screen.findByTestId('profile-member-since')
  expect(screen.queryByTestId('profile-location')).toBeNull()
})

test('a profile leads with what they have been drinking, then friends, then households', async () => {
  // Your own profile, so both connection panels are shown even when empty — the case
  // where all three blocks exist at once and their order is actually visible.
  signedIn({ 'GET /users/user-1/profile': () => json({ ...grace, id: ada.id, friend_state: 'self' }) })
  renderApp('/users/user-1')

  const reviews = await screen.findByTestId('profile-reviews')
  const friends = screen.getByTestId('profile-friends')
  const households = screen.getByTestId('profile-households')

  // Document order, which is what a screen reader and a phone both follow — the two-column
  // grid at `lg` is a presentation of this order, not a replacement for it.
  const order = (node: HTMLElement) =>
    reviews.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
  expect(order(friends)).toBeTruthy()
  expect(order(households)).toBeTruthy()
  expect(friends.compareDocumentPosition(households) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('with nothing to put beside them, the reviews take the whole width', async () => {
  // A stranger sees neither panel, so the two-column grid must not apply — otherwise the
  // reviews sit in two thirds of the page next to a column of air.
  signedOut({ 'GET /users/user-2/profile': () => json({ ...grace, households: [], friends: [] }) })
  renderApp('/users/user-2')

  const reviews = await screen.findByTestId('profile-reviews')
  expect(screen.queryByTestId('profile-friends')).toBeNull()
  expect(reviews.parentElement?.className).not.toContain('grid-cols-')
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { ProfileReview, PublicProfile } from '../../lib/profile'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'

/* --------------------------------------------------------------------- fixtures */

const ada: User = {
  id: 'user-1',
  email: 'ada@herbatka.test',
  display_name: 'Ada Lovelace',
  role: 'user',
  avatar_url: null,
  pronouns: null,
  bio: 'Counting steps, mostly.',
  location: null,
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

/** Somebody else, seen by a signed-in stranger. */
const grace: PublicProfile = {
  id: 'user-2',
  display_name: 'Grace Hopper',
  avatar_url: null,
  pronouns: 'she/her',
  bio: 'Compiles her own blends.',
  location: 'Arlington',
  favourite_tea_type: 'oolong',
  member_since: '2026-02-01T09:00:00Z',
  review_count: 12,
  average_score_given: 8.25,
  household_count: 2,
  friend_state: 'none',
  recent_reviews: [jasmineReview],
}

/** Ada's own, which is where an email would leak from if one were ever going to. */
const mine: PublicProfile = {
  ...grace,
  id: ada.id,
  display_name: ada.display_name,
  pronouns: null,
  location: null,
  bio: 'Counting steps, mostly.',
  friend_state: 'self',
}

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
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const signedIn = (overrides: Record<string, Handler> = {}) =>
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
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
  expect(screen.getByTestId('profile-household-count')).toHaveTextContent('2')

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
    'GET /users/user-2/profile': () => json({ ...grace, friend_state: null }),
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

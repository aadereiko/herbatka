import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { FeedItem, Friend, FriendRequest, SearchResult } from '../../lib/friend'
import type { UserRef } from '../../lib/household'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'

/* --------------------------------------------------------------------- fixtures */

const ada: User = {
  id: 'user-1',
  email: 'ada@herbatka.test',
  display_name: 'Ada Lovelace',
  role: 'user',
  avatar_url: null,
  created_at: '2026-01-01T09:00:00Z',
}

const session: Session = {
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  user: ada,
}

/** Asked to be Ada's friend, and is waiting. */
const grace: UserRef = {
  id: 'user-2',
  display_name: 'Grace Hopper',
  email: 'grace@herbatka.test',
  avatar_url: null,
}

/** Already a friend, so the friends list is never empty by accident. */
const alan: UserRef = {
  id: 'user-3',
  display_name: 'Alan Turing',
  email: 'alan@herbatka.test',
  avatar_url: null,
}

/** A stranger, for the "add somebody new" journeys. */
const katherine: UserRef = {
  id: 'user-4',
  display_name: 'Katherine Johnson',
  email: 'katherine@herbatka.test',
  avatar_url: null,
}

/** Somebody Ada has already blocked. */
const mallory: UserRef = {
  id: 'user-5',
  display_name: 'Mallory Quiet',
  email: 'mallory@herbatka.test',
  avatar_url: null,
}

const adaRef: UserRef = {
  id: ada.id,
  display_name: ada.display_name,
  email: ada.email,
  avatar_url: null,
}

const fromGrace: FriendRequest = {
  id: 'req-1',
  user: grace,
  direction: 'incoming',
  created_at: '2026-08-20T10:00:00Z',
}

const toKatherine: FriendRequest = {
  id: 'req-2',
  user: katherine,
  direction: 'outgoing',
  created_at: '2026-08-22T10:00:00Z',
}

const alanFriend: Friend = { user: alan, friends_since: '2026-05-01T12:00:00Z' }

const graceFriend: Friend = { user: grace, friends_since: '2026-08-26T09:00:00Z' }

const graceReview: FeedItem = {
  kind: 'review',
  at: '2026-08-26T09:30:00Z',
  actor: { id: grace.id, display_name: grace.display_name, avatar_url: null },
  tea: {
    id: 'tea-1',
    slug: 'jasmine-pearls',
    name: 'Jasmine Pearls',
    tea_type: 'green',
    image_url: null,
  },
  score: 9,
  body: 'Floral without tipping into soap.',
}

function pageOf<T>(items: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, page: 1, size: 20, pages: 1, ...extra }
}

/* ------------------------------------------------------------------ test harness */

type Handler = (request: { url: URL; init?: RequestInit }) => Response | Promise<Response>

type Call = { method: string; path: string; search: string; body: string | null }

const calls: Call[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const noContent = () => new Response(null, { status: 204 })

/** The `METHOD /path` router the M2–M4 suites use: query strings are ignored for routing
 *  but recorded, and an unregistered path rejects loudly rather than quietly answering
 *  something plausible. Recording is what makes "the search debounces" provable. */
function mockFetch(handlers: Record<string, Handler>) {
  calls.length = 0
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace('/api/v1', '')
    calls.push({ method, path, search: url.search, body: (init?.body as string) ?? null })

    const handler = handlers[`${method} ${path}`]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${method} ${path}`))
    return Promise.resolve(handler({ url, init }))
  })
}

const countOf = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length

const bodyOf = (method: string, path: string): unknown => {
  const call = calls.find((entry) => entry.method === method && entry.path === path)
  return JSON.parse(call?.body ?? 'null')
}

const searches = () =>
  calls.filter((call) => call.method === 'GET' && call.path === '/users/search').map((c) => c.search)

/**
 * `staleTime` is a parameter because the invalidation journeys turn it on.
 *
 * With the default 0, react-query refetches on every mount — so a test that leaves a
 * page, accepts a request and comes back sees a fresh request whether or not the
 * mutation invalidated anything, and would pass with the invalidation deleted. Pinning
 * the cache fresh makes each refetch attributable to exactly one thing.
 */
function renderApp(path: string, { staleTime = 0 } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime },
      mutations: { retry: false },
    },
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

/** Signed in as Ada: one request waiting from Grace, one sent to Katherine, Alan already
 *  a friend, nobody blocked. Individual tests override what they care about. */
function friendsPage(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends': () => json([alanFriend]),
    'GET /friends/requests': () => json([fromGrace, toKatherine]),
    'GET /friends/blocked': () => json([]),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* --------------------------------------------------------------- pending requests */

test('accepting a request moves them into the friends list, clears the badge, and reaches the feed', async () => {
  // Stateful, so every refetch can disagree with what was on screen. Frozen fixtures
  // would let this pass with all the invalidations deleted.
  let requests = [fromGrace, toKatherine]
  let friends = [alanFriend]
  let feed: FeedItem[] = []

  friendsPage({
    'GET /friends': () => json(friends),
    'GET /friends/requests': () => json(requests),
    'GET /feed': () => json(pageOf(feed)),
    'POST /friends/requests/req-1/accept': () => {
      requests = [toKatherine]
      friends = [alanFriend, graceFriend]
      feed = [graceReview]
      return json(graceFriend)
    },
  })

  // Start on the feed so it is warm *before* the accept. A fresh-forever cache means a
  // second /feed request afterwards can only be the invalidation.
  renderApp('/feed', { staleTime: Infinity })

  expect(await screen.findByTestId('feed-empty')).toBeInTheDocument()
  expect(countOf('GET', '/feed')).toBe(1)

  // The badge is the thing people scan the nav for, and it is on screen before we ever
  // open /friends — one incoming request, not two: the outgoing one does not count.
  expect(await screen.findByTestId('nav-friends-badge')).toHaveTextContent('1')

  fireEvent.click(screen.getByTestId('nav-friends'))
  const incoming = await screen.findByTestId('incoming-requests')
  expect(within(incoming).getByText('Grace Hopper')).toBeInTheDocument()
  expect(within(await screen.findByTestId('friend-list')).queryByText('Grace Hopper')).toBeNull()

  fireEvent.click(screen.getByTestId('accept-req-1'))

  await waitFor(() => expect(countOf('POST', '/friends/requests/req-1/accept')).toBe(1))

  // The friends list gained her, the pending list lost her, and both are refetches that
  // a fresh-forever cache would not have made on its own.
  await waitFor(() =>
    expect(within(screen.getByTestId('friend-list')).getByText('Grace Hopper')).toBeInTheDocument(),
  )
  await waitFor(() => expect(screen.queryByTestId('incoming-request')).toBeNull())
  expect(countOf('GET', '/friends')).toBe(2)
  expect(countOf('GET', '/friends/requests')).toBe(2)

  // The badge cleared with it. Katherine's outgoing request is still listed, which is
  // what proves the badge counts direction rather than rows.
  expect(screen.queryByTestId('nav-friends-badge')).toBeNull()
  expect(screen.getAllByTestId('outgoing-request')).toHaveLength(1)

  // And the feed: her review is only visible because she is now a friend, so the fourth
  // invalidation is the one that decides whether the stream looks broken.
  fireEvent.click(screen.getByTestId('nav-feed'))
  await waitFor(() => expect(countOf('GET', '/feed')).toBe(2))
  expect(await screen.findByTestId('feed-item-review')).toHaveTextContent('Grace Hopper')
  expect(screen.queryByTestId('feed-empty')).toBeNull()
})

test('declining removes the request without making a friend, and cancelling withdraws your own', async () => {
  let requests = [fromGrace, toKatherine]
  friendsPage({
    'GET /friends/requests': () => json(requests),
    'DELETE /friends/requests/req-1': () => {
      requests = [toKatherine]
      return noContent()
    },
    'DELETE /friends/requests/req-2': () => {
      requests = []
      return noContent()
    },
  })
  renderApp('/friends')

  await screen.findByTestId('incoming-request')

  fireEvent.click(screen.getByTestId('decline-req-1'))
  await waitFor(() => expect(screen.queryByTestId('incoming-request')).toBeNull())
  // Declining is not the same endpoint as accepting, and it makes nobody a friend.
  expect(countOf('POST', '/friends/requests/req-1/accept')).toBe(0)
  expect(within(screen.getByTestId('friend-list')).queryByText('Grace Hopper')).toBeNull()

  fireEvent.click(screen.getByTestId('cancel-req-2'))
  await waitFor(() => expect(screen.queryByTestId('outgoing-request')).toBeNull())
  expect(await screen.findByTestId('requests-empty')).toHaveTextContent('Nothing waiting')
})

/* ------------------------------------------------------------------ people search */

test('the search debounces, waits for two characters, and offers a friend no “Add friend”', async () => {
  friendsPage({
    'GET /users/search': ({ url }) => {
      const query = url.searchParams.get('q') ?? ''
      const matches: SearchResult[] = [
        { user: grace, state: 'friends' },
        { user: katherine, state: 'outgoing' },
      ]
      return json(query.startsWith('gra') ? matches : [])
    },
  })
  renderApp('/friends')

  await screen.findByTestId('people-search')
  const box = screen.getByLabelText('Search for somebody')

  // One character is below the server's own minimum, so the client does not ask at all —
  // and says why rather than showing an empty result list.
  fireEvent.change(box, { target: { value: 'g' } })
  await waitFor(() =>
    expect(screen.getByTestId('search-hint')).toHaveTextContent('2 characters at least'),
  )
  expect(searches()).toHaveLength(0)

  fireEvent.change(box, { target: { value: 'gr' } })
  fireEvent.change(box, { target: { value: 'gra' } })
  fireEvent.change(box, { target: { value: 'grac' } })

  // Three more keystrokes, still nothing on the wire, and the box stayed responsive.
  expect(searches()).toHaveLength(0)
  expect(box).toHaveValue('grac')

  await waitFor(() => expect(searches()).toHaveLength(1))
  expect(searches()[0]).toContain('q=grac')

  // Grace is already a friend. "Add friend" here would be a button whose only possible
  // outcome is a 409, so the state decides the control rather than decorating it.
  const rows = await screen.findAllByTestId('search-result')
  const graceRow = rows.find((row) => within(row).queryByText('Grace Hopper')) as HTMLElement
  expect(within(graceRow).queryByRole('button', { name: /Add .* as a friend/ })).toBeNull()
  expect(screen.getByTestId('search-state-user-2')).toHaveTextContent('Friends')

  // …and the one already asked reads as asked, not as askable again.
  expect(screen.getByTestId('search-state-user-4')).toHaveTextContent('Requested')
  expect(screen.queryByTestId('add-user-4')).toBeNull()
})

test('sending a request that 404s says exactly what every other failure says', async () => {
  const say404 = () =>
    friendsPage({
      'GET /users/search': () => json([{ user: katherine, state: 'none' } as SearchResult]),
      'POST /friends/requests': () =>
        json({ detail: 'No such user.' }, 404),
    })

  say404()
  renderApp('/friends')

  await screen.findByTestId('people-search')
  fireEvent.change(screen.getByLabelText('Search for somebody'), { target: { value: 'kath' } })

  fireEvent.click(await screen.findByTestId('add-user-4'))
  await waitFor(() => expect(countOf('POST', '/friends/requests')).toBe(1))
  expect(bodyOf('POST', '/friends/requests')).toEqual({ user_id: 'user-4' })

  const note = await screen.findByTestId('search-error-user-4')
  const blocked404 = note.textContent ?? ''
  expect(blocked404).toContain('Could not send that request')

  // The point of the whole exercise: a 404 from this endpoint means she blocked Ada, and
  // nothing on screen may hint at it — not the word, not the server's own sentence.
  expect(blocked404).not.toMatch(/block/i)
  expect(blocked404).not.toContain('No such user')

  // And the stronger property, which is the one an attacker actually probes: an ordinary
  // 409 must be *indistinguishable* from the block. A generic message shown only for
  // 404s would still be a tell.
  cleanup()
  friendsPage({
    'GET /users/search': () => json([{ user: katherine, state: 'none' } as SearchResult]),
    'POST /friends/requests': () => json({ detail: 'A request is already open.' }, 409),
  })
  renderApp('/friends')

  await screen.findByTestId('people-search')
  fireEvent.change(screen.getByLabelText('Search for somebody'), { target: { value: 'kath' } })
  fireEvent.click(await screen.findByTestId('add-user-4'))

  const conflict = await screen.findByTestId('search-error-user-4')
  expect(conflict.textContent).toBe(blocked404)
})

test('you are not offered as your own friend, and somebody you blocked is offered nothing', async () => {
  friendsPage({
    'GET /friends/blocked': () => json([mallory]),
    'GET /users/search': () =>
      json([
        { user: adaRef, state: 'none' },
        { user: mallory, state: 'blocked' },
      ] as SearchResult[]),
  })
  renderApp('/friends')

  await screen.findByTestId('people-search')
  fireEvent.change(screen.getByLabelText('Search for somebody'), { target: { value: 'a' } })
  fireEvent.change(screen.getByLabelText('Search for somebody'), { target: { value: 'al' } })

  await screen.findByTestId('search-results')

  // The server has no idea which row is you and will happily report `none`; the client
  // is the only thing standing between Ada and a 400.
  expect(screen.getByTestId('search-state-user-1')).toHaveTextContent('This is you')
  expect(screen.queryByTestId('add-user-1')).toBeNull()
  expect(screen.queryByTestId('search-block-user-1')).toBeNull()

  // Somebody already blocked gets no verb at all — least of all a second "Block", which
  // reads as the first one not having taken.
  expect(screen.queryByTestId('add-user-5')).toBeNull()
  expect(screen.queryByTestId('search-block-user-5')).toBeNull()
  expect(screen.getByTestId('search-state-user-5')).toHaveTextContent('—')

  // Unblocking has exactly one home, and it explains itself.
  expect(within(screen.getByTestId('blocked-panel')).getByTestId('unblock-user-5')).toBeVisible()
})

test('accepting from a search result finds the request id the result does not carry', async () => {
  let requests = [fromGrace, toKatherine]
  let friends = [alanFriend]
  friendsPage({
    'GET /friends': () => json(friends),
    'GET /friends/requests': () => json(requests),
    'GET /users/search': () => json([{ user: grace, state: 'incoming' } as SearchResult]),
    'POST /friends/requests/req-1/accept': () => {
      requests = [toKatherine]
      friends = [alanFriend, graceFriend]
      return json(graceFriend)
    },
  })
  renderApp('/friends')

  await screen.findByTestId('people-search')
  fireEvent.change(screen.getByLabelText('Search for somebody'), { target: { value: 'grace' } })

  // She asked first, so the useful button is Accept — not a second request crossing hers.
  const accept = await screen.findByTestId('search-accept-user-2')
  expect(screen.queryByTestId('add-user-2')).toBeNull()

  fireEvent.click(accept)
  // Addressed by the *request's* id, which `SearchResult` does not carry: it comes from
  // the pending list already loaded above.
  await waitFor(() => expect(countOf('POST', '/friends/requests/req-1/accept')).toBe(1))
  await waitFor(() =>
    expect(within(screen.getByTestId('friend-list')).getByText('Grace Hopper')).toBeInTheDocument(),
  )
})

/* ------------------------------------------------------------ unfriend and block */

test('blocking somebody takes two steps and removes them from the friends list', async () => {
  let friends = [alanFriend]
  let blocked: UserRef[] = []
  friendsPage({
    'GET /friends': () => json(friends),
    'GET /friends/blocked': () => json(blocked),
    'POST /friends/user-3/block': () => {
      friends = []
      blocked = [alan]
      return noContent()
    },
  })
  renderApp('/friends')

  await screen.findByTestId('friend-list')
  expect(screen.getByText('Alan Turing')).toBeInTheDocument()
  expect(screen.queryByTestId('blocked-panel')).toBeNull()

  fireEvent.click(screen.getByTestId('block-user-3'))

  // Step one asks; it does not block. No `window.confirm` anywhere near it.
  expect(countOf('POST', '/friends/user-3/block')).toBe(0)
  expect(screen.getByTestId('confirm-block-user-3')).toBeInTheDocument()
  // While it is asking, the other verb on the row steps out of the way.
  expect(screen.queryByTestId('unfriend-user-3')).toBeNull()

  // …and it is escapable.
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
  expect(screen.queryByTestId('confirm-block-user-3')).toBeNull()
  expect(countOf('POST', '/friends/user-3/block')).toBe(0)

  fireEvent.click(screen.getByTestId('block-user-3'))
  fireEvent.click(screen.getByTestId('confirm-block-user-3'))

  await waitFor(() => expect(countOf('POST', '/friends/user-3/block')).toBe(1))

  // Gone from the list, and findable in the one place that can undo it.
  await waitFor(() => expect(screen.queryByTestId('friend-list')).toBeNull())
  expect(screen.getByTestId('friends-empty')).toHaveTextContent('Nobody yet')
  const blockedPanel = await screen.findByTestId('blocked-panel')
  expect(within(blockedPanel).getByText('Alan Turing')).toBeInTheDocument()
})

test('unfriending is its own two-step, and DELETEs the friendship rather than blocking', async () => {
  let friends = [alanFriend]
  friendsPage({
    'GET /friends': () => json(friends),
    'DELETE /friends/user-3': () => {
      friends = []
      return noContent()
    },
  })
  renderApp('/friends')

  await screen.findByTestId('friend-list')
  fireEvent.click(screen.getByTestId('unfriend-user-3'))
  expect(countOf('DELETE', '/friends/user-3')).toBe(0)

  fireEvent.click(screen.getByTestId('confirm-unfriend-user-3'))
  await waitFor(() => expect(countOf('DELETE', '/friends/user-3')).toBe(1))

  // Unfriending is not blocking: nothing was posted to the block endpoint, and no
  // blocked section appeared.
  expect(countOf('POST', '/friends/user-3/block')).toBe(0)
  await waitFor(() => expect(screen.getByTestId('friends-empty')).toBeInTheDocument())
  expect(screen.queryByTestId('blocked-panel')).toBeNull()
})

test('unblocking puts them back among strangers, not back among friends', async () => {
  let blocked = [mallory]
  friendsPage({
    'GET /friends/blocked': () => json(blocked),
    'DELETE /friends/user-5/block': () => {
      blocked = []
      return noContent()
    },
  })
  renderApp('/friends')

  const panel = await screen.findByTestId('blocked-panel')
  fireEvent.click(within(panel).getByTestId('unblock-user-5'))

  await waitFor(() => expect(countOf('DELETE', '/friends/user-5/block')).toBe(1))
  await waitFor(() => expect(screen.queryByTestId('blocked-panel')).toBeNull())
  expect(within(screen.getByTestId('friend-list')).queryByText('Mallory Quiet')).toBeNull()
})

/* ----------------------------------------------------------------------- the nav */

test('the friends nav entry is signed-in only, and wears no badge at zero', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas': () => json(pageOf([], { size: 24 })),
    'GET /catalog/ingredients': () => json(pageOf([])),
    'GET /catalog/brands': () => json(pageOf([])),
  })
  renderApp('/teas')

  await screen.findByTestId('tea-list-empty')
  expect(screen.queryByTestId('nav-friends')).toBeNull()
  expect(screen.queryByTestId('nav-feed')).toBeNull()
  // Signed out, the authenticated endpoint is never touched — the mock would have
  // rejected loudly, but the count is the assertion that says so.
  expect(countOf('GET', '/friends/requests')).toBe(0)

  cleanup()
  friendsPage({ 'GET /friends/requests': () => json([toKatherine]) })
  renderApp('/friends')

  expect(await screen.findByTestId('nav-friends')).toHaveAttribute('href', '/friends')
  expect(screen.getByTestId('nav-feed')).toHaveAttribute('href', '/feed')
  // One outgoing request and nothing incoming: a permanent "0" is a badge people learn
  // to stop seeing, so there is none.
  await screen.findByTestId('outgoing-request')
  expect(screen.queryByTestId('nav-friends-badge')).toBeNull()
})

test('a failed unfriend leaves them on the list and says so against their row', async () => {
  friendsPage({
    'DELETE /friends/user-3': () => json({ detail: 'Try that again in a moment.' }, 503),
  })
  renderApp('/friends')

  await screen.findByTestId('friend-list')
  fireEvent.click(screen.getByTestId('unfriend-user-3'))
  fireEvent.click(screen.getByTestId('confirm-unfriend-user-3'))

  // The server's own sentence, because unlike a friend request there is nothing to leak:
  // you already know this person is your friend.
  expect(await screen.findByTestId('friend-error-user-3')).toHaveTextContent(
    'Try that again in a moment.',
  )
  expect(within(screen.getByTestId('friend-list')).getByText('Alan Turing')).toBeInTheDocument()
})

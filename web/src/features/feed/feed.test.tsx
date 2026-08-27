import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { FeedItem, FeedStockedItem } from '../../lib/friend'
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
  bio: null,
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

const jasminePearls = {
  id: 'tea-1',
  slug: 'jasmine-pearls',
  name: 'Jasmine Pearls',
  tea_type: 'green',
  image_url: null,
} as const

const sencha = {
  id: 'tea-2',
  slug: 'sencha',
  name: 'Sencha',
  tea_type: 'green',
  image_url: null,
} as const

const graceRated: FeedItem = {
  kind: 'review',
  at: '2026-08-26T09:30:00Z',
  actor: { id: 'user-2', display_name: 'Grace Hopper', avatar_url: null },
  tea: jasminePearls,
  score: 9,
  body: 'Floral without tipping into soap.',
}

const alanStocked: FeedStockedItem = {
  kind: 'stocked',
  at: '2026-08-25T18:00:00Z',
  actor: { id: 'user-3', display_name: 'Alan Turing', avatar_url: null },
  tea: sencha,
  household: { id: 'hh-1', name: 'Flat 3' },
  grams: 100,
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

/** The `METHOD /path` router the M2–M4 suites use: query strings are ignored for routing
 *  but recorded, and an unregistered path rejects loudly. */
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

const feedRequests = () =>
  calls.filter((call) => call.method === 'GET' && call.path === '/feed').map((call) => call.search)

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

/** Signed in as Ada. The nav badge asks for requests on every page, so that endpoint is
 *  part of the baseline rather than something each test remembers. */
function feed(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('the two kinds read differently and lead to different places', async () => {
  feed({ 'GET /feed': () => json(pageOf([graceRated, alanStocked])) })
  renderApp('/feed')

  const list = await screen.findByTestId('feed-list')

  // Newest first, as the server sent it — the page does not re-sort across two clocks.
  const items = within(list).getAllByRole('listitem')
  expect(items[0]).toHaveAttribute('data-testid', 'feed-item-review')
  expect(items[1]).toHaveAttribute('data-testid', 'feed-item-stocked')

  // A rating: who, what they scored it, what they said, and a link to the *tea* —
  // because the tea is the thing you can act on.
  const review = screen.getByTestId('feed-item-review')
  expect(review).toHaveTextContent('Grace Hopper')
  expect(review).toHaveTextContent('rated')
  expect(within(review).getByTestId('feed-score-jasmine-pearls')).toHaveTextContent('9')
  expect(review).toHaveTextContent('Floral without tipping into soap.')
  expect(within(review).getByRole('link', { name: 'Jasmine Pearls' })).toHaveAttribute(
    'href',
    '/teas/jasmine-pearls',
  )

  // A tin: the link goes to the *household*, not the tea. The tea page cannot tell you
  // the tin exists, and "go see what else is on that shelf" is the useful next move.
  const stocked = screen.getByTestId('feed-item-stocked')
  expect(stocked).toHaveTextContent('Alan Turing')
  expect(stocked).toHaveTextContent('added 100 g of')
  expect(stocked).toHaveTextContent('Sencha')
  expect(within(stocked).getByRole('link', { name: 'Flat 3' })).toHaveAttribute(
    'href',
    '/households/hh-1',
  )
  // The two are not interchangeable rows with a swapped verb: a stocked tin carries no
  // score, and nothing about it links to the tea page.
  expect(within(stocked).queryByTestId('feed-score-sencha')).toBeNull()
  expect(within(stocked).queryByRole('link', { name: 'Sencha' })).toBeNull()
})

test('the links actually go where they say', async () => {
  feed({
    'GET /feed': () => json(pageOf([graceRated])),
    'GET /catalog/teas/jasmine-pearls': () =>
      json({
        ...jasminePearls,
        caffeine_level: 'medium',
        brand: null,
        is_approved: true,
        primary_ingredients: [],
        average_score: 9,
        review_count: 1,
        my_score: null,
        description: null,
        origin_country: null,
        brew_temp_c: null,
        brew_seconds: null,
        grams_per_100ml: null,
        created_at: '2026-02-01T10:00:00Z',
        ingredients: [],
        my_review: null,
        average_aroma: null,
        average_flavour: null,
        average_aftertaste: null,
      }),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([], { size: 10 })),
  })
  renderApp('/feed')

  await screen.findByTestId('feed-list')
  fireEvent.click(screen.getByRole('link', { name: 'Jasmine Pearls' }))

  // Not just an href: the route resolves and the tea page renders behind it.
  expect(await screen.findByRole('heading', { level: 1, name: 'Jasmine Pearls' })).toBeVisible()
})

test('an empty feed explains itself and points at /friends', async () => {
  feed({ 'GET /feed': () => json(pageOf([])) })
  renderApp('/feed')

  const empty = await screen.findByTestId('feed-empty')
  // It says what would fill it, in terms of something the reader can go and do.
  expect(empty).toHaveTextContent('friends rate teas')
  expect(empty).toHaveTextContent('households you are in')
  expect(within(empty).getByRole('link', { name: 'Find friends' })).toHaveAttribute(
    'href',
    '/friends',
  )

  // Not a spinner and not a list, which are the two things an empty stream gets mistaken
  // for when nobody wrote this branch.
  expect(screen.queryByTestId('feed-list')).toBeNull()
  expect(screen.queryByTestId('feed-loading')).toBeNull()
  expect(screen.queryByTestId('pagination')).toBeNull()
})

test('the feed pages, asking for the page it is showing', async () => {
  feed({
    'GET /feed': ({ url }) =>
      json(
        url.searchParams.get('page') === '2'
          ? pageOf([alanStocked], { total: 2, page: 2, pages: 2 })
          : pageOf([graceRated], { total: 2, page: 1, pages: 2 }),
      ),
  })
  renderApp('/feed')

  await screen.findByTestId('feed-item-review')
  expect(feedRequests()[0]).toContain('page=1')
  expect(feedRequests()[0]).toContain('size=20')

  fireEvent.click(screen.getByTestId('page-next'))

  expect(await screen.findByTestId('feed-item-stocked')).toHaveTextContent('Alan Turing')
  expect(feedRequests().at(-1)).toContain('page=2')
  expect(screen.queryByTestId('feed-item-review')).toBeNull()
})

test('a feed that fails says so instead of pretending to be empty', async () => {
  feed({ 'GET /feed': () => json({ detail: 'The feed is having a lie down.' }, 503) })
  renderApp('/feed')

  expect(await screen.findByTestId('feed-error')).toHaveTextContent(
    'The feed is having a lie down.',
  )
  // The distinction that matters: a failure is not "you have no friends yet".
  expect(screen.queryByTestId('feed-empty')).toBeNull()
})

test('/feed is signed-in only, and the home page does not bury it', async () => {
  mockFetch({ 'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401) })
  renderApp('/feed')

  // RequireAuth sends a stranger to the sign-in page rather than to an empty stream.
  expect(await screen.findByTestId('login-page')).toBeInTheDocument()
  expect(calls.some((call) => call.path === '/feed')).toBe(false)
})

/**
 * The home page used to be a stack of link cards, and this asserted the feed sat in the
 * first of them. It is a dashboard now: the first few feed items are on the page itself,
 * with a link through to the rest. Showing beats linking, so the assertion moved with it.
 */
test('the signed-in home shows the start of the feed and links to the rest', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /home': () =>
      json({
        display_name: 'Ada Lovelace',
        household_count: 1,
        tin_count: 2,
        low_stock: [],
        friend_count: 1,
        pending_requests: 0,
        review_count: 0,
        recent_activity: [graceRated],
        unrated: [],
      }),
  })

  renderApp('/')

  const activity = await screen.findByTestId('home-activity')
  expect(within(activity).getByText(/Jasmine Pearls/)).toBeInTheDocument()
  expect(within(activity).getByRole('link', { name: /All activity/ })).toHaveAttribute(
    'href',
    '/feed',
  )
})

test('a tin measured in fractions of a gram does not read like a lab notebook', async () => {
  feed({
    'GET /feed': () =>
      json(pageOf([{ ...alanStocked, grams: 12.5 }, { ...alanStocked, at: '2026-08-24T18:00:00Z' }])),
  })
  renderApp('/feed')

  const items = await screen.findAllByTestId('feed-item-stocked')
  expect(items[0]).toHaveTextContent('added 12.5 g of')
  // …and a whole number keeps no trailing ".0".
  expect(items[1]).toHaveTextContent('added 100 g of')
})

/**
 * Regression, found by reading the shipped OpenAPI schema against the agreed contract:
 * `StockedFeedItem.actor` is `FeedActor | null`, not `FeedActor`. A tin can outlive
 * whoever put it there, and every tin older than the `added_by` column has no answer at
 * all — so this is the ordinary case for existing data, not an edge one. Rendering
 * `item.actor.display_name` unguarded takes the whole page down with a TypeError.
 */
test('a tin whose owner is unknown renders as “somebody” rather than crashing', async () => {
  feed({
    'GET /feed': () => json(pageOf([{ ...alanStocked, actor: null }])),
  })
  renderApp('/feed')

  const stocked = await screen.findByTestId('feed-item-stocked')
  expect(stocked).toHaveTextContent('Somebody added 100 g of')
  // The tin is still real and still linked — dropping it would hide something that is
  // genuinely on the shelf.
  expect(within(stocked).getByRole('link', { name: 'Flat 3' })).toHaveAttribute(
    'href',
    '/households/hh-1',
  )
  expect(screen.queryByTestId('feed-error')).toBeNull()
})

test('the feed waits for the session rather than asking as a stranger', async () => {
  let releaseRefresh: (value: Response) => void = () => {}
  const refreshPending = new Promise<Response>((resolve) => {
    releaseRefresh = resolve
  })

  mockFetch({
    'POST /auth/refresh': () => refreshPending,
    'GET /friends/requests': () => json([]),
    'GET /feed': () => json(pageOf([graceRated])),
  })
  renderApp('/feed')

  // RequireAuth renders nothing at all while the silent refresh is in flight, so the
  // request cannot go out without an Authorization header on it.
  await waitFor(() => expect(calls.some((call) => call.path === '/auth/refresh')).toBe(true))
  expect(calls.some((call) => call.path === '/feed')).toBe(false)

  releaseRefresh(json(session))

  expect(await screen.findByTestId('feed-item-review')).toBeInTheDocument()
  expect(feedRequests()).toHaveLength(1)
})

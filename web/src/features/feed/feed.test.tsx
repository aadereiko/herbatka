import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { FeedItem, FeedStockedItem } from '../../lib/friend'
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
  bio: null,
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

const adaBrewed: FeedItem = {
  kind: 'brewed',
  at: '2026-08-26T07:05:00Z',
  actor: { id: 'user-1', display_name: 'Ada Lovelace', avatar_url: null },
  tea: sencha,
  household: { id: 'hh-1', name: 'Flat 3' },
  grams: 5,
  note: 'last of the tin',
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

/** Signed in as Ada. The nav badge asks for requests on every page, so that endpoint is
 *  part of the baseline rather than something each test remembers. */
function feed(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    ...overrides,
  })
}

/**
 * The rows, through the only screen that still shows them.
 *
 * `/feed` is gone — the home page's "Lately" panel carries the head of the same timeline
 * and turned out to be as much of it as anybody read. These tests are about `FeedRow`, so
 * they now reach it the way the app does, through `GET /home`.
 */
function homeShowing(items: unknown[], overrides: Record<string, Handler> = {}) {
  return feed({
    'GET /home': () =>
      json({
        display_name: 'Ada Lovelace',
        household_count: 1,
        tin_count: 2,
        low_stock: [],
        friend_count: 1,
        pending_requests: 0,
        review_count: 0,
        recent_activity: items,
        unrated: [],
      }),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('the two kinds read differently and lead to different places', async () => {
  homeShowing([graceRated, alanStocked])
  renderApp('/')

  const list = await screen.findByTestId('home-activity')

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
  homeShowing([graceRated], {
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
  renderApp('/')

  await screen.findByTestId('home-activity')
  fireEvent.click(screen.getByRole('link', { name: 'Jasmine Pearls' }))

  // Not just an href: the route resolves and the tea page renders behind it.
  expect(await screen.findByRole('heading', { level: 1, name: 'Jasmine Pearls' })).toBeVisible()
})



/**
 * The home page used to be a stack of link cards, and this asserted the feed sat in the
 * first of them. It is a dashboard now: the first few feed items are on the page itself,
 * with a link through to the rest. Showing beats linking, so the assertion moved with it.
 */
test('the signed-in home shows the activity stream, and is the only place it lives', async () => {
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

  // No "all activity →". It pointed at a page showing a longer version of this same
  // stream, and the longer version is the part that turned out not to be needed — so
  // this panel is the whole of it, and offering a link to more would be a dead end.
  expect(within(activity).queryByRole('link', { name: /All activity/ })).toBeNull()
  expect(screen.queryByTestId('nav-feed')).toBeNull()
})

test('a tin measured in fractions of a gram does not read like a lab notebook', async () => {
  homeShowing([
    { ...alanStocked, grams: 12.5 },
    { ...alanStocked, at: '2026-08-24T18:00:00Z' },
  ])
  renderApp('/')

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
  homeShowing([{ ...alanStocked, actor: null }])
  renderApp('/')

  const stocked = await screen.findByTestId('feed-item-stocked')
  expect(stocked).toHaveTextContent('Somebody added 100 g of')
  // The tin is still real and still linked — dropping it would hide something that is
  // genuinely on the shelf.
  expect(within(stocked).getByRole('link', { name: 'Flat 3' })).toHaveAttribute(
    'href',
    '/households/hh-1',
  )
})


test('a brew reads as a quiet line, not as a card competing with the ratings', async () => {
  homeShowing([adaBrewed, graceRated])
  renderApp('/')

  const brewed = await screen.findByTestId('feed-item-brewed')
  expect(brewed).toHaveTextContent('Ada Lovelace')
  expect(brewed).toHaveTextContent('brewed 5 g of')
  expect(brewed).toHaveTextContent('Sencha')
  expect(brewed).toHaveTextContent('Flat 3')

  // The note is the reason this row is worth having. It is already in the ledger, and
  // "last of the tin" is the most human thing the app records.
  expect(brewed).toHaveTextContent('last of the tin')

  // Stored as a negative delta — it left the tin — and shown positive, because
  // "brewed −5 g" is not a sentence anybody says.
  expect(brewed).not.toHaveTextContent('−5')
})

test('a brew with no note is still a complete sentence', async () => {
  homeShowing([{ ...adaBrewed, note: null }])
  renderApp('/')

  const brewed = await screen.findByTestId('feed-item-brewed')
  expect(brewed).toHaveTextContent('brewed 5 g of')
  expect(brewed).not.toHaveTextContent('“')
})

test('a brew by a departed member says “somebody” rather than dropping the cup', async () => {
  homeShowing([{ ...adaBrewed, actor: null }])
  renderApp('/')

  // Same rule as a tin whose buyer is gone: the event happened, and inventing a name or
  // hiding it would both be worse than saying so.
  expect(await screen.findByTestId('feed-item-brewed')).toHaveTextContent('Somebody')
})

/* ------------------------------------------------------- running low, forecast-aware */

const tinRef = {
  id: 'item-1',
  tea: sencha,
  quantity_grams: 60,
  low_stock_grams: 20,
  is_low: false,
  location: null,
  opened_at: null,
  best_before: null,
  updated_at: '2026-08-26T09:00:00Z',
  shop: null,
}

function homeWith(lowStock: unknown[]) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /home': () =>
      json({
        display_name: 'Ada Lovelace',
        household_count: 1,
        tin_count: 2,
        low_stock: lowStock,
        friend_count: 1,
        pending_requests: 0,
        review_count: 0,
        recent_activity: [],
        unrated: [],
      }),
  })
}

test('a tin above its threshold still warns when the ledger says it is going fast', async () => {
  // 60 g against a 20 g threshold: the hand-set rule says nothing at all. The forecast is
  // the whole reason this tin is on the page, so the forecast is what the row shows.
  homeWith([
    {
      item: tinRef,
      household: { id: 'hh-1', name: 'Flat 3' },
      pace: { grams_per_week: 40, days_observed: 30, events_counted: 9, days_remaining: 4 },
    },
  ])
  renderApp('/')

  const low = await screen.findByTestId('home-low-stock')
  expect(within(low).getByTestId('low-forecast-item-1')).toHaveTextContent('about 4 days left')
  // And not the threshold, which the reader can already see from the grams.
  expect(low).not.toHaveTextContent('below 20 g')
})

test('a tin below its threshold with no forecast says which rule caught it', async () => {
  homeWith([
    {
      item: { ...tinRef, quantity_grams: 8, is_low: true },
      household: { id: 'hh-1', name: 'Flat 3' },
      pace: null,
    },
  ])
  renderApp('/')

  const low = await screen.findByTestId('home-low-stock')
  // `pace: null` is not a deadline. Saying "below 20 g" is the honest reason, and it
  // stops the row implying a projection nobody computed.
  expect(low).toHaveTextContent('below 20 g')
  expect(screen.queryByTestId('low-forecast-item-1')).toBeNull()
})

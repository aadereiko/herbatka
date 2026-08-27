import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page, TeaDetail, TeaSummary } from '../../lib/catalog'
import type { ShopSummary } from '../../lib/shop'
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

const jasminePearls: TeaSummary = {
  id: 'tea-1',
  slug: 'jasmine-pearls',
  name: 'Jasmine Pearls',
  tea_type: 'green',
  caffeine_level: 'medium',
  image_url: null,
  brand: { id: 'brand-1', slug: 'jing', name: 'Jing' },
  is_approved: true,
  primary_ingredients: ['Green tea', 'Jasmine'],
  average_score: null,
  review_count: 0,
  my_score: null,
  is_favourite: false,
}

const jasminePearlsDetail: TeaDetail = {
  ...jasminePearls,
  description: null,
  origin_country: null,
  brew_temp_c: 80,
  brew_seconds: 210,
  grams_per_100ml: 1.5,
  created_at: '2026-02-01T10:00:00Z',
  ingredients: [],
  my_review: null,
  average_aroma: null,
  average_flavour: null,
  average_aftertaste: null,
  my_brewing: null,
}

const kruka: ShopSummary = {
  id: 'shop-1',
  slug: 'u-kruka',
  name: 'Herbaciarnia u Kruka',
  city: 'Kraków',
  country: 'Poland',
  website: null,
  image_url: null,
  is_approved: true,
  listing_count: 2,
  latitude: null,
  longitude: null,
  distance_km: null,
  is_favourite: true,
  average_score: null,
  review_count: 0,
  my_score: null,
}

function pageOf<T>(items: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, page: 1, size: 24, pages: 1, ...extra }
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

/** 204, which is what all four favourite endpoints answer. Not `json(null)`: a body on a
 *  204 is the one thing `api()` must never try to parse. */
function noContent() {
  return new Response(null, { status: 204 })
}

/** The `METHOD /path` router the other suites use: query strings are ignored for routing
 *  but recorded, and an unregistered path rejects loudly rather than quietly answering
 *  something plausible. */
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

/**
 * `staleTime` is a parameter because the optimistic tests turn it up.
 *
 * With the default 0 react-query refetches on every mount and every invalidation, so a
 * star that only ever settled on the *refetched* value would still end up looking right —
 * and the test would pass with the whole optimistic write deleted. Pinning the cache
 * fresh makes the flip attributable to exactly one thing, which is the point of asserting
 * on it at all.
 */
function renderApp(path: string, { staleTime = 0 } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } },
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

/** Signed in as Ada, on the browse grid, with one unstarred tea in it. */
function browsing(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    'GET /catalog/teas': () => json(pageOf([jasminePearls])),
    ...overrides,
  })
}

const teaStar = () => screen.getByTestId('favourite-tea-jasmine-pearls')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------ the star itself */

test('the star fills in before the server answers, and says what pressing it will do', async () => {
  // Held open on purpose. An optimistic update that is only observable after the response
  // is not an optimistic update, and holding the PUT is the only way to tell the two
  // apart — every other arrangement passes on the refetch alone.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  browsing({
    'PUT /catalog/teas/jasmine-pearls/favourite': () => held.then(noContent),
  })
  renderApp('/teas', { staleTime: Infinity })

  await screen.findByTestId('tea-card')
  const star = teaStar()
  expect(star).toHaveAttribute('aria-pressed', 'false')
  // The name is what it will *do*, and it names the tea — twenty identical "Favourite"
  // buttons in a grid are twenty identical announcements.
  expect(star).toHaveAccessibleName('Add Jasmine Pearls to your favourites')

  fireEvent.click(star)

  // Filled in, with the request still in flight and nothing refetched.
  await waitFor(() => expect(teaStar()).toHaveAttribute('aria-pressed', 'true'))
  expect(teaStar()).toHaveAccessibleName('Remove Jasmine Pearls from your favourites')
  expect(countOf('GET', '/catalog/teas')).toBe(1)

  release()
  await waitFor(() => expect(countOf('PUT', '/catalog/teas/jasmine-pearls/favourite')).toBe(1))
  expect(teaStar()).toHaveAttribute('aria-pressed', 'true')
})

test('a starring the server refuses puts the star back where it was', async () => {
  // Held, then failed. Holding it is what makes the two halves separately observable:
  // released immediately, the optimistic write and the rollback both land between two
  // polls of `waitFor` and the test could not tell a rollback from never having written.
  let reject = () => {}
  const held = new Promise<void>((resolve) => {
    reject = resolve
  })

  browsing({
    'PUT /catalog/teas/jasmine-pearls/favourite': () => held.then(() => json({ detail: 'Nope' }, 500)),
  })
  renderApp('/teas', { staleTime: Infinity })

  await screen.findByTestId('tea-card')
  fireEvent.click(teaStar())

  // Filled in while the request is in flight…
  await waitFor(() => expect(teaStar()).toHaveAttribute('aria-pressed', 'true'))

  reject()

  // …and back where it started once the server says no. Nothing is refetched to rescue
  // it: with the cache pinned fresh and no invalidation on the error path, the only
  // thing that can restore the hollow star is the rollback itself.
  await waitFor(() => expect(teaStar()).toHaveAttribute('aria-pressed', 'false'))
  expect(teaStar()).toHaveAccessibleName('Add Jasmine Pearls to your favourites')
  expect(countOf('GET', '/catalog/teas')).toBe(1)
})

test('unstarring sends a DELETE, not a second PUT', async () => {
  browsing({
    'GET /catalog/teas': () => json(pageOf([{ ...jasminePearls, is_favourite: true }])),
    'DELETE /catalog/teas/jasmine-pearls/favourite': () => noContent(),
    'GET /favourites/teas': () => json(pageOf([])),
    'GET /favourites/shops': () => json(pageOf([])),
  })
  renderApp('/teas', { staleTime: Infinity })

  await screen.findByTestId('tea-card')
  expect(teaStar()).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(teaStar())

  await waitFor(() => expect(countOf('DELETE', '/catalog/teas/jasmine-pearls/favourite')).toBe(1))
  expect(countOf('PUT', '/catalog/teas/jasmine-pearls/favourite')).toBe(0)
  expect(teaStar()).toHaveAttribute('aria-pressed', 'false')
})

test('signed out there is no star at all — not a star that asks you to sign in', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas': () => json(pageOf([jasminePearls])),
  })
  renderApp('/teas')

  const card = await screen.findByTestId('tea-card')
  expect(card).toHaveTextContent('Jasmine Pearls')

  // Absent from the DOM, not disabled and not a prompt: a control that is visibly there
  // and refuses to work is a small lie told on every card in the grid.
  expect(screen.queryByTestId('favourite-tea-jasmine-pearls')).toBeNull()
  expect(screen.queryByRole('button', { name: /favourites/i })).toBeNull()
})

test('the star on a card is not inside the card’s link, so pressing it does not navigate', async () => {
  browsing({ 'PUT /catalog/teas/jasmine-pearls/favourite': () => noContent() })
  renderApp('/teas', { staleTime: Infinity })

  const card = await screen.findByTestId('tea-card')
  const star = teaStar()

  // The whole card is one anchor. A <button> nested inside it is invalid markup that
  // navigates instead of starring, which is exactly the bug this guards.
  expect(card.contains(star)).toBe(false)

  fireEvent.click(star)
  await waitFor(() => expect(countOf('PUT', '/catalog/teas/jasmine-pearls/favourite')).toBe(1))
  // Still on the browse grid rather than on the tea's own page.
  expect(screen.getByTestId('tea-card')).toBeInTheDocument()
})

test('starring from the tea page reaches the browse grid the reader came from', async () => {
  browsing({
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
    'PUT /catalog/teas/jasmine-pearls/favourite': () => noContent(),
    'GET /favourites/teas': () => json(pageOf([])),
    'GET /favourites/shops': () => json(pageOf([])),
  })
  const { unmount } = renderApp('/teas', { staleTime: Infinity })
  await screen.findByTestId('tea-card')
  unmount()

  // A fresh page, same client-side story: the detail page's own star writes through to
  // every cached list as well as to the tea it is on.
  renderApp('/teas/jasmine-pearls', { staleTime: Infinity })
  const star = await screen.findByTestId('favourite-tea-jasmine-pearls')
  expect(star).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(star)
  await waitFor(() =>
    expect(screen.getByTestId('favourite-tea-jasmine-pearls')).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  )
})

/* ---------------------------------------------------------------- the /favourites page */

test('/favourites shows the teas you starred and, on the other tab, the shops', async () => {
  browsing({
    'GET /favourites/teas': () => json(pageOf([{ ...jasminePearls, is_favourite: true }])),
    'GET /favourites/shops': () => json(pageOf([kruka])),
  })
  renderApp('/favourites')

  const teas = await screen.findByTestId('favourite-teas')
  expect(within(teas).getByTestId('tea-card')).toHaveTextContent('Jasmine Pearls')
  expect(screen.getByTestId('favourites-tab-teas')).toHaveAttribute('aria-pressed', 'true')
  // Only the visible half is mounted, so arriving here makes one request rather than two.
  expect(countOf('GET', '/favourites/shops')).toBe(0)

  fireEvent.click(screen.getByTestId('favourites-tab-shops'))

  const shops = await screen.findByTestId('favourite-shops')
  expect(within(shops).getByTestId('shop-card')).toHaveTextContent('Herbaciarnia u Kruka')
  expect(screen.getByTestId('favourites-tab-shops')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByTestId('favourite-teas')).toBeNull()
})

test('the chosen tab is in the URL, so a shared link opens on it', async () => {
  browsing({ 'GET /favourites/shops': () => json(pageOf([kruka])) })
  renderApp('/favourites?tab=shops')

  await screen.findByTestId('favourite-shops')
  expect(screen.getByTestId('favourites-tab-shops')).toHaveAttribute('aria-pressed', 'true')
  // The teas half was never asked for: the URL, not a default, decided what to fetch.
  expect(countOf('GET', '/favourites/teas')).toBe(0)
})

test('an empty favourites list explains what a star is for', async () => {
  browsing({
    'GET /favourites/teas': () => json(pageOf([])),
    'GET /favourites/shops': () => json(pageOf([])),
  })
  renderApp('/favourites')

  const empty = await screen.findByTestId('favourite-teas-empty')
  expect(empty).toHaveTextContent('No teas starred yet')
  // The part that earns the empty state: what the control is, and that it is not a score.
  expect(empty).toHaveTextContent('It is not a rating')
  expect(within(empty).getByRole('link', { name: /Browse the catalog/ })).toHaveAttribute(
    'href',
    '/teas',
  )

  fireEvent.click(screen.getByTestId('favourites-tab-shops'))
  expect(await screen.findByTestId('favourite-shops-empty')).toHaveTextContent(
    'No shops starred yet',
  )
})

test('/favourites is not a page for a stranger', async () => {
  mockFetch({ 'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401) })
  renderApp('/favourites')

  // Bounced to the sign-in page, and — the half worth asserting — no authenticated
  // request went out on the way.
  expect(await screen.findByRole('heading', { level: 1, name: /Sign in/i })).toBeInTheDocument()
  expect(countOf('GET', '/favourites/teas')).toBe(0)
})

test('the account menu offers your favourites only once you are signed in', async () => {
  browsing()
  renderApp('/teas')

  fireEvent.click(await screen.findByTestId('account-menu'))
  expect(screen.getByTestId('nav-favourites')).toHaveAttribute('href', '/favourites')

  cleanup()
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas': () => json(pageOf([jasminePearls])),
  })
  renderApp('/teas')

  await screen.findByTestId('tea-card')
  expect(screen.queryByTestId('nav-favourites')).toBeNull()
})

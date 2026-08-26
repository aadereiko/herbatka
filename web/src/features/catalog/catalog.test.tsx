import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Ingredient, Page, TeaDetail, TeaSummary } from '../../lib/catalog'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'

/* --------------------------------------------------------------------- fixtures */

const jasmineFlower: Ingredient = {
  id: 'ing-1',
  slug: 'jasmine',
  name: 'Jasmine',
  category: 'flower',
  is_caffeinated: false,
  description: 'Picked at night, layered with the leaf until it takes the scent.',
}

const greenLeaf: Ingredient = {
  id: 'ing-2',
  slug: 'green-tea',
  name: 'Green tea',
  category: 'leaf',
  is_caffeinated: true,
  description: null,
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
}

const jasminePearlsDetail: TeaDetail = {
  ...jasminePearls,
  description: 'Hand-rolled pearls that unfurl into a jasmine-heavy cup.',
  origin_country: 'China',
  brew_temp_c: 80,
  brew_seconds: 210,
  grams_per_100ml: 1.5,
  created_at: '2026-02-01T10:00:00Z',
  ingredients: [
    { ingredient: greenLeaf, percentage: 60, is_primary: true },
    { ingredient: jasmineFlower, percentage: 40, is_primary: false },
  ],
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

/**
 * Routes by `METHOD /path`, ignoring the query string, and records every call so a test
 * can assert on *how many* requests happened as well as what came back — which is the
 * only way to prove a debounce actually debounces. An unregistered path rejects loudly
 * rather than returning a helpful empty page and hiding a wrong URL.
 */
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

const teaRequests = () => calls.filter((call) => call.path === '/catalog/teas').map((c) => c.search)
const lastTeaRequest = () => teaRequests().at(-1) ?? ''

let currentSearch = ''

/** Mirrors the router's current query string out of the tree so a test can assert on
 *  it. Written in an effect rather than during render — reassigning module state while
 *  rendering is exactly the side effect the lint rule is there to catch. */
function LocationSpy() {
  const { search } = useLocation()
  useEffect(() => {
    currentSearch = search
  }, [search])
  return null
}

function renderApp(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationSpy />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

/** Every catalog screen is public, so the shared baseline is "no session, and the three
 *  browse endpoints answer". Individual tests override what they care about. */
function signedOutCatalog(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas': () => json(pageOf([jasminePearls])),
    'GET /catalog/ingredients': () => json(pageOf([greenLeaf, jasmineFlower])),
    'GET /catalog/brands': () => json(pageOf([{ id: 'brand-1', slug: 'jing', name: 'Jing' }])),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('a tea-type filter round-trips through the URL', async () => {
  signedOutCatalog()
  renderApp('/teas')

  await screen.findByTestId('tea-card')
  expect(teaRequests()).toEqual(['?page=1&size=24'])

  fireEvent.click(screen.getByRole('button', { name: 'Green' }))

  // Half one: the click is written to the address bar, and the request follows it.
  await waitFor(() => expect(currentSearch).toBe('?type=green'))
  await waitFor(() => expect(lastTeaRequest()).toContain('tea_type=green'))

  // Half two: that same URL, opened cold, reproduces the filtered request and the
  // filtered controls. This is the half that would fail if the state lived in useState
  // and the URL were only written to.
  cleanup()
  signedOutCatalog()
  renderApp('/teas?type=green&q=jasmine')

  await screen.findByTestId('tea-card')
  expect(lastTeaRequest()).toContain('tea_type=green')
  expect(lastTeaRequest()).toContain('q=jasmine')
  expect(screen.getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Search teas')).toHaveValue('jasmine')
})

test('an ingredient filter round-trips through the URL', async () => {
  signedOutCatalog()
  renderApp('/teas')
  await screen.findByTestId('tea-card')

  fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: 'jasmine' } })

  await waitFor(() => expect(currentSearch).toBe('?ingredient=jasmine'))
  await waitFor(() => expect(lastTeaRequest()).toContain('ingredient=jasmine'))
})

test('paging writes the page to the URL and asks for it', async () => {
  signedOutCatalog({
    'GET /catalog/teas': () => json(pageOf([jasminePearls], { total: 30, pages: 2 })),
  })
  renderApp('/teas')
  await screen.findByTestId('tea-card')

  fireEvent.click(screen.getByTestId('page-next'))

  await waitFor(() => expect(currentSearch).toBe('?page=2'))
  await waitFor(() => expect(lastTeaRequest()).toContain('page=2'))
})

test('typing runs one search rather than one per keystroke', async () => {
  signedOutCatalog()
  renderApp('/teas')
  await screen.findByTestId('tea-card')
  expect(teaRequests()).toHaveLength(1)

  const box = screen.getByLabelText('Search teas')
  fireEvent.change(box, { target: { value: 'j' } })
  fireEvent.change(box, { target: { value: 'ja' } })
  fireEvent.change(box, { target: { value: 'jas' } })

  // Three keystrokes, no request yet — and the box is still responsive meanwhile.
  expect(teaRequests()).toHaveLength(1)
  expect(box).toHaveValue('jas')

  await waitFor(() => expect(teaRequests()).toHaveLength(2))
  expect(lastTeaRequest()).toContain('q=jas')
  expect(currentSearch).toBe('?q=jas')
})

test('an empty catalog and a fruitless search say different things', async () => {
  signedOutCatalog({ 'GET /catalog/teas': () => json(pageOf([])) })
  renderApp('/teas')

  expect(await screen.findByTestId('tea-list-empty')).toHaveTextContent('The catalog is empty')
  expect(screen.queryByTestId('tea-list-no-results')).toBeNull()

  cleanup()
  signedOutCatalog({ 'GET /catalog/teas': () => json(pageOf([])) })
  renderApp('/teas?q=lapsang')

  expect(await screen.findByTestId('tea-list-no-results')).toHaveTextContent('No teas match')
  expect(screen.queryByTestId('tea-list-empty')).toBeNull()
})

test('the list shows a skeleton before the first page arrives', async () => {
  // Held open on purpose: a loading state that only exists for one frame is one nobody
  // can assert on, and one nobody would notice was missing either.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  signedOutCatalog({
    'GET /catalog/teas': () => held.then(() => json(pageOf([jasminePearls]))),
  })

  renderApp('/teas')
  expect(await screen.findByTestId('tea-list-loading')).toBeInTheDocument()
  expect(screen.getByTestId('tea-count')).toHaveTextContent('Searching…')

  release()
  expect(await screen.findByTestId('tea-card')).toBeInTheDocument()
  expect(screen.queryByTestId('tea-list-loading')).toBeNull()
})

test('the detail page lists ingredients and the brewing spec', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
  })
  renderApp('/teas/jasmine-pearls')

  expect(await screen.findByRole('heading', { level: 1, name: 'Jasmine Pearls' })).toBeVisible()

  const ingredients = screen.getByTestId('tea-ingredients')
  expect(within(ingredients).getByRole('link', { name: 'Green tea' })).toHaveAttribute(
    'href',
    '/teas?ingredient=green-tea',
  )
  expect(within(ingredients).getByText('60%')).toBeInTheDocument()
  expect(within(ingredients).getByText('40%')).toBeInTheDocument()
  // Only the leaf is marked primary, and only it should carry the badge.
  expect(within(ingredients).getAllByText('Primary')).toHaveLength(1)

  const brewing = screen.getByTestId('tea-brewing')
  expect(brewing).toHaveTextContent('80°C')
  expect(brewing).toHaveTextContent('3 min 30 s')
  expect(brewing).toHaveTextContent('1.5 g / 100 ml')
})

test('an unknown tea reads as missing rather than broken', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/lapsang': () => json({ detail: 'Tea not found' }, 404),
  })
  renderApp('/teas/lapsang')

  expect(await screen.findByTestId('tea-detail-missing')).toBeInTheDocument()
  expect(screen.queryByTestId('tea-detail-error')).toBeNull()
})

test('the ingredients page filters by category through the URL', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/ingredients': () => json(pageOf([jasmineFlower])),
  })
  renderApp('/ingredients')

  await screen.findByTestId('ingredient-list')
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'flower' } })

  await waitFor(() => expect(currentSearch).toBe('?category=flower'))
  await waitFor(() => {
    const requests = calls.filter((call) => call.path === '/catalog/ingredients')
    expect(requests.at(-1)?.search).toContain('category=flower')
  })
})

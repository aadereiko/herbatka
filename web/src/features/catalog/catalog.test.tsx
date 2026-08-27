import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { BrewingNote, Ingredient, Page, TeaDetail, TeaSummary } from '../../lib/catalog'
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
  // M4 widened both tea schemas with the rating rollup. Unrated, here, unless a test
  // says otherwise: null and 0 are what an untouched tea actually comes back as.
  average_score: null,
  review_count: 0,
  my_score: null,
  // M8 widened both tea schemas again, with the star. Unstarred here, as an untouched
  // tea is — and as every signed-out reader is told, whatever the truth.
  is_favourite: false,
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
  my_review: null,
  average_aroma: null,
  average_flavour: null,
  average_aftertaste: null,
  // M8. Null: this tea's brewing figures are the catalog's, which is what the brewing
  // assertions below are about.
  my_brewing: null,
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
    // M4 hung reviews off the bottom of this page. Registered so the request this test
    // now makes is a request the harness knows about — an unhandled one rejects loudly,
    // which is the point of the router.
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    // M6 hangs a "where to buy" panel off the same page. Registered for the same
    // reason: an unhandled request rejects loudly, which is the point of the router.
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
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

/* ----------------------------------------------- your own brewing numbers (M8) */

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

const session: Session = { access_token: 'access-1', token_type: 'bearer', expires_in: 900, user: ada }

/** Hotter and shorter than the catalog says, and silent about the leaf — the mixed case
 *  is the whole point: the fallback is per field, not per note. */
const myBrewing: BrewingNote = {
  brew_temp_c: 95,
  brew_seconds: 60,
  grams_per_100ml: null,
  note: 'Second steep is the good one.',
  updated_at: '2026-08-20T18:00:00Z',
}

/** Signed in as Ada, on one tea's page. The reviews and shops panels are registered
 *  because they hang off the same page and an unhandled request rejects loudly. */
function teaPage(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
    ...overrides,
  })
}

const countOf = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length

test('your brewing figures stand in front of the catalog’s, field by field, both labelled', async () => {
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () => json({ ...jasminePearlsDetail, my_brewing: myBrewing }),
  })
  renderApp('/teas/jasmine-pearls')

  const brewing = await screen.findByTestId('tea-brewing')
  // Yours where you gave one…
  expect(brewing).toHaveTextContent('95°C')
  expect(brewing).toHaveTextContent('1 min')
  expect(brewing).not.toHaveTextContent('80°C')
  expect(brewing).not.toHaveTextContent('3 min 30 s')
  // …and the catalog's where you did not. A note that only sets the temperature must not
  // wipe the two figures it says nothing about.
  expect(brewing).toHaveTextContent('1.5 g / 100 ml')

  // Which is which is on the page, not left to be inferred from a number changing.
  expect(brewing).toHaveTextContent('yours')
  expect(brewing).toHaveTextContent('the catalog’s')
  expect(screen.getByTestId('brewing-yours-badge')).toHaveTextContent('Your numbers')

  // The catalog's own answer stays visible rather than being replaced silently.
  const theirs = screen.getByTestId('tea-brewing-catalog')
  expect(theirs).toHaveTextContent('80°C')
  expect(theirs).toHaveTextContent('3 min 30 s')
  expect(screen.getByTestId('tea-brewing-note')).toHaveTextContent('Second steep is the good one.')
})

test('saving your own numbers sends all four keys, nulls included', async () => {
  let detail: TeaDetail = jasminePearlsDetail
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () => json(detail),
    'PUT /catalog/teas/jasmine-pearls/brewing': ({ init }) => {
      const input = JSON.parse(String(init?.body)) as BrewingNote
      const saved: BrewingNote = { ...input, updated_at: '2026-08-27T09:00:00Z' }
      detail = { ...detail, my_brewing: saved }
      return json(saved)
    },
  })
  renderApp('/teas/jasmine-pearls')

  fireEvent.click(await screen.findByTestId('toggle-brewing-form'))
  fireEvent.change(screen.getByLabelText('Water'), { target: { value: '95' } })
  fireEvent.change(screen.getByLabelText('Steep'), { target: { value: '60' } })
  fireEvent.change(screen.getByLabelText('Note (optional)'), {
    target: { value: 'Second steep is the good one.' },
  })
  fireEvent.submit(screen.getByTestId('brewing-form'))

  // Every key, every time. The empty leaf box travels as an explicit null: a PUT that
  // omitted it could not express clearing a dose you had set on an earlier save.
  await waitFor(() =>
    expect(
      JSON.parse(
        calls.find(
          (call) => call.method === 'PUT' && call.path === '/catalog/teas/jasmine-pearls/brewing',
        )?.body ?? 'null',
      ),
    ).toEqual({
      brew_temp_c: 95,
      brew_seconds: 60,
      grams_per_100ml: null,
      note: 'Second steep is the good one.',
    }),
  )

  // And the tea refetched, so the panel is showing what the server kept rather than what
  // was typed into a form that has since closed.
  await waitFor(() => expect(countOf('GET', '/catalog/teas/jasmine-pearls')).toBe(2))
  expect(await screen.findByTestId('brewing-yours-badge')).toBeInTheDocument()
  expect(screen.getByTestId('tea-brewing')).toHaveTextContent('95°C')
})

test('removing your numbers falls back to the catalog’s', async () => {
  let detail: TeaDetail = { ...jasminePearlsDetail, my_brewing: myBrewing }
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () => json(detail),
    'DELETE /catalog/teas/jasmine-pearls/brewing': () => {
      detail = { ...detail, my_brewing: null }
      return new Response(null, { status: 204 })
    },
  })
  renderApp('/teas/jasmine-pearls')

  expect(await screen.findByTestId('tea-brewing')).toHaveTextContent('95°C')

  fireEvent.click(screen.getByTestId('toggle-brewing-form'))
  // Two steps and no `window.confirm`: this is the only control on the page that can
  // throw away something you typed.
  fireEvent.click(screen.getByTestId('remove-brewing'))
  fireEvent.click(screen.getByTestId('confirm-remove-brewing'))

  await waitFor(() => expect(screen.getByTestId('tea-brewing')).toHaveTextContent('80°C'))
  const brewing = screen.getByTestId('tea-brewing')
  expect(brewing).not.toHaveTextContent('95°C')
  expect(brewing).toHaveTextContent('3 min 30 s')
  // With one source again, nothing is labelled and there is no second line to compare to.
  expect(brewing).not.toHaveTextContent('yours')
  expect(screen.queryByTestId('tea-brewing-catalog')).toBeNull()
  expect(screen.queryByTestId('brewing-yours-badge')).toBeNull()
  expect(screen.queryByTestId('tea-brewing-note')).toBeNull()
})

test('a signed-out reader gets the catalog’s figures and no way to overwrite them', async () => {
  signedOutCatalog({
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
  })
  renderApp('/teas/jasmine-pearls')

  expect(await screen.findByTestId('tea-brewing')).toHaveTextContent('80°C')
  expect(screen.queryByTestId('toggle-brewing-form')).toBeNull()
  expect(screen.queryByTestId('brewing-form')).toBeNull()
  // Nothing to label when there is only one source, signed in or not.
  expect(screen.getByTestId('tea-brewing')).not.toHaveTextContent('the catalog’s')
})

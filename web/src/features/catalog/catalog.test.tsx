import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { BrewingNote, IngredientTaste, Page, TeaDetail, TeaSummary } from '../../lib/catalog'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'

/* --------------------------------------------------------------------- fixtures */

/** Rated by two people, one of them you — so the row on the tea page has something to
 *  show in both halves of the control. */
const jasmineFlower: IngredientTaste = {
  id: 'ing-1',
  slug: 'jasmine',
  name: 'Jasmine',
  category: 'flower',
  is_caffeinated: false,
  description: 'Picked at night, layered with the leaf until it takes the scent.',
  // Null, like every seeded ingredient: there are no photographs of the vocabulary, so
  // the drawn fallback is the *normal* case and the fixtures say so. A test that wants a
  // photo spreads one on.
  image_url: null,
  my_score: 9,
  average_score: 8.5,
  rating_count: 2,
}

/** Nobody has said anything about this one, and nobody has written it up either. Null
 *  rather than 0 throughout — see `describeTaste`. */
const greenLeaf: IngredientTaste = {
  id: 'ing-2',
  slug: 'green-tea',
  name: 'Green tea',
  category: 'leaf',
  is_caffeinated: true,
  description: null,
  image_url: null,
  my_score: null,
  average_score: null,
  rating_count: 0,
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

/* ------------------------------------------------------ how much you like an ingredient */

/** The reason the control lives on the tea page and not only on /ingredients: a blend
 *  lists five things, and one of them being the clove you rated 2 is the explanation. */
test('a tea page shows your score for each of its ingredients, and the crowd’s', async () => {
  teaPage()
  renderApp('/teas/jasmine-pearls')

  const jasmine = await screen.findByTestId('ingredient-taste-jasmine')
  expect(within(jasmine).getByLabelText('How much you like Jasmine')).toHaveValue('9')
  expect(screen.getByTestId('ingredient-average-jasmine')).toHaveTextContent('8.5 from 2 people')

  // Nobody has rated green tea, so there is an empty control and no average at all —
  // "0.0" would read as universally hated rather than as never asked about.
  expect(within(screen.getByTestId('ingredient-taste-green-tea')).getByLabelText(
    'How much you like Green tea',
  )).toHaveValue('')
  expect(screen.queryByTestId('ingredient-average-green-tea')).toBeNull()
})

test('picking a score saves it and shows immediately, without waiting for the refetch', async () => {
  let saved: string | null = null
  // Held open on purpose: the assertion is about what the select shows while the PUT is
  // still in flight, which is the whole reason the control keeps a draft.
  let release = () => {}
  const inFlight = new Promise<void>((resolve) => {
    release = resolve
  })

  teaPage({
    'PUT /catalog/ingredients/green-tea/rating': async ({ init }) => {
      saved = init?.body as string
      await inFlight
      return json({ ...greenLeaf, my_score: 6, average_score: 6, rating_count: 1 })
    },
  })
  renderApp('/teas/jasmine-pearls')

  const select = await screen.findByLabelText('How much you like Green tea')
  fireEvent.change(select, { target: { value: '6' } })

  expect(select).toHaveValue('6')
  await waitFor(() => expect(saved).toBe(JSON.stringify({ score: 6 })))
  release()
})

test('clearing your score deletes the rating rather than storing a zero', async () => {
  let deleted = 0
  teaPage({
    'DELETE /catalog/ingredients/jasmine/rating': () => {
      deleted += 1
      return new Response(null, { status: 204 })
    },
  })
  renderApp('/teas/jasmine-pearls')

  const select = await screen.findByLabelText('How much you like Jasmine')
  fireEvent.change(select, { target: { value: '' } })

  await waitFor(() => expect(deleted).toBe(1))
  // Not a PUT with 0: "no opinion on jasmine" and "I dislike jasmine" are different facts.
  expect(countOf('PUT', '/catalog/ingredients/jasmine/rating')).toBe(0)
})

test('clearing a score you never gave asks the server nothing', async () => {
  teaPage()
  renderApp('/teas/jasmine-pearls')

  // Green tea starts unrated. A DELETE here would 404 and paint a red error over an idle
  // change of mind.
  const select = await screen.findByLabelText('How much you like Green tea')
  fireEvent.change(select, { target: { value: '' } })

  await waitFor(() => expect(select).toHaveValue(''))
  expect(countOf('DELETE', '/catalog/ingredients/green-tea/rating')).toBe(0)
})

test('a failed save puts the row back to what it said before', async () => {
  teaPage({
    'PUT /catalog/ingredients/jasmine/rating': () => json({ detail: 'Nope' }, 500),
  })
  renderApp('/teas/jasmine-pearls')

  const select = await screen.findByLabelText('How much you like Jasmine')
  fireEvent.change(select, { target: { value: '3' } })

  expect(await screen.findByTestId('ingredient-taste-error-jasmine')).toBeInTheDocument()
  // Back to 9. Leaving 3 on screen would claim a save that never happened.
  expect(select).toHaveValue('9')
})

test('signed out there is no control, only what other people think', async () => {
  signedOutCatalog()
  renderApp('/ingredients')

  await screen.findByTestId('ingredient-list')
  expect(screen.getByTestId('ingredient-average-jasmine')).toHaveTextContent('Liked 8.5 from 2 people')
  // An input that bounces you to a login the moment you touch it is worse than one that
  // was never offered.
  expect(screen.queryByLabelText('How much you like Jasmine')).toBeNull()
})

/** The same cold-load race that bit the tea pages: /ingredients is public, so it fetches
 *  before the silent refresh answers. Without the viewer in the query key, the anonymous
 *  reply — "you have rated nothing" — is what gets cached and shown to a signed-in user. */
test('the ingredient list waits for the session before caching who you are', async () => {
  let release: (value: Response) => void = () => {}
  const refresh = new Promise<Response>((resolve) => {
    release = resolve
  })

  mockFetch({
    'POST /auth/refresh': () => refresh,
    'GET /friends/requests': () => json([]),
    'GET /catalog/ingredients': () => json(pageOf([greenLeaf, jasmineFlower])),
  })
  renderApp('/ingredients')

  // While the refresh is outstanding, nothing has been asked of the catalog.
  await waitFor(() => expect(countOf('POST', '/auth/refresh')).toBe(1))
  expect(countOf('GET', '/catalog/ingredients')).toBe(0)

  release(json(session))
  expect(await screen.findByLabelText('How much you like Jasmine')).toHaveValue('9')
})

/**
 * A card is a third of a row wide. When the caption sat outside the control, the card had
 * three fixed-width things on one line — caption, average, select — and the select was
 * pushed out through the side. jsdom does no layout, so this cannot assert the overflow
 * itself; what it can pin down is the structure that caused it, which is the caption
 * living outside the control that has to make room for it.
 */
test('on a card the caption is part of the control, not a sibling competing for the line', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /friends/requests': () => json([]),
    'GET /catalog/ingredients': () => json(pageOf([jasmineFlower])),
  })
  renderApp('/ingredients')

  const control = await screen.findByTestId('ingredient-taste-jasmine')
  expect(within(control).getByText('How much you like it')).toBeInTheDocument()
  expect(within(control).getByLabelText('How much you like Jasmine')).toHaveValue('9')
  // And the crowd figure is not on the caption's line — it is the third thing that did
  // not fit.
  const caption = within(control).getByText('How much you like it')
  expect(caption.parentElement).not.toContainElement(screen.getByTestId('ingredient-average-jasmine'))
})

/* ------------------------------------------- what an ingredient looks like and reads as */

/**
 * The card's job, and until now the thing it usually failed at.
 *
 * All thirty-nine seeded ingredients had `description = NULL`, and the card rendered the
 * paragraph only when there was one — so /ingredients was a grid of bare names and nobody
 * could tell whether the text was missing or had never been meant to be there. It is
 * unconditional now, which is why this asserts *both* rows: the one with something to say
 * says it, and the one without says that.
 */
test('a card leads with what the ingredient tastes like, and says so when nobody has written it', async () => {
  signedOutCatalog()
  renderApp('/ingredients')

  await screen.findByTestId('ingredient-list')
  expect(screen.getByTestId('ingredient-description-jasmine')).toHaveTextContent(
    'Picked at night, layered with the leaf until it takes the scent.',
  )
  expect(screen.getByTestId('ingredient-description-green-tea')).toHaveTextContent(
    'No description yet.',
  )
})

test('an ingredient with an uploaded picture shows the picture', async () => {
  signedOutCatalog({
    'GET /catalog/ingredients': () =>
      json(pageOf([{ ...jasmineFlower, image_url: 'https://cdn.example/jasmine.png' }])),
  })
  renderApp('/ingredients')

  const picture = await screen.findByTestId('ingredient-image-jasmine')
  expect(picture).toHaveAttribute('src', 'https://cdn.example/jasmine.png')
  // And the drawing steps aside rather than sitting behind it.
  expect(screen.queryByTestId('ingredient-image-jasmine-placeholder')).toBeNull()
})

/**
 * The placeholder decision, pinned.
 *
 * There is no photograph of clove to seed and there is not going to be one, so "no
 * picture" is the permanent state of nearly every row — which makes the fallback the
 * thing worth testing, not an afterthought. Two ingredients of two different categories
 * in one render, because a component that hard-coded a single drawing (the way the shared
 * `EntityImage` leaf does) would pass a one-row version of this test perfectly.
 */
test('an ingredient with no picture gets its own category’s drawing, not a broken image', async () => {
  signedOutCatalog()
  renderApp('/ingredients')

  await screen.findByTestId('ingredient-list')

  const flower = screen.getByTestId('ingredient-image-jasmine-placeholder')
  const leaf = screen.getByTestId('ingredient-image-green-tea-placeholder')
  expect(flower).toHaveAttribute('data-category', 'flower')
  expect(leaf).toHaveAttribute('data-category', 'leaf')
  // No <img> at all: an <img> with no src is the broken-image icon we are avoiding.
  expect(screen.queryByTestId('ingredient-image-jasmine')).toBeNull()
  expect(flower.querySelector('svg')).not.toBeNull()
})

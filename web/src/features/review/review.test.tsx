import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page, TeaDetail, TeaSummary } from '../../lib/catalog'
import type { MyReview, Review } from '../../lib/review'
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
  average_score: 8.2,
  review_count: 14,
  my_score: null,
}

const jasminePearlsDetail: TeaDetail = {
  ...jasminePearls,
  description: 'Hand-rolled pearls that unfurl into a jasmine-heavy cup.',
  origin_country: 'China',
  brew_temp_c: 80,
  brew_seconds: 210,
  grams_per_100ml: 1.5,
  created_at: '2026-02-01T10:00:00Z',
  ingredients: [],
  my_review: null,
  average_aroma: 8.5,
  average_flavour: 8,
  average_aftertaste: null,
}

/** Somebody else's review, so the public list is never empty by accident. */
const grace: Review = {
  id: 'rev-1',
  author: { id: 'user-2', display_name: 'Grace Hopper', avatar_url: null },
  score: 8,
  aroma: 9,
  flavour: 8,
  aftertaste: null,
  body: 'Floral without tipping into soap.',
  brewed_at: '2026-08-02',
  created_at: '2026-08-03T09:00:00Z',
  updated_at: '2026-08-03T09:00:00Z',
}

/** Ada's own, for the pre-fill and delete journeys. */
const mine: Review = {
  id: 'rev-2',
  author: { id: ada.id, display_name: ada.display_name, avatar_url: null },
  score: 7,
  aroma: 6,
  flavour: null,
  aftertaste: 5,
  body: 'Grassier than I remembered.',
  brewed_at: '2026-08-20',
  created_at: '2026-08-21T08:00:00Z',
  updated_at: '2026-08-21T08:00:00Z',
}

const myReview: MyReview = {
  ...mine,
  tea: {
    id: jasminePearls.id,
    slug: jasminePearls.slug,
    name: jasminePearls.name,
    tea_type: 'green',
    image_url: null,
  },
}

function pageOf<T>(items: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, page: 1, size: 10, pages: 1, ...extra }
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

/** The `METHOD /path` router the M2 and M3 suites use: query strings are ignored for
 *  routing but recorded, and an unregistered path rejects loudly rather than quietly
 *  answering something plausible. */
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

/**
 * `staleTime` is a parameter because two of the tests below turn on it.
 *
 * With the default 0, react-query refetches every query on mount — so a test that leaves
 * a page, rates a tea and comes back sees a fresh request whether or not the mutation
 * invalidated anything, and would pass with the invalidation deleted. Pinning the cache
 * fresh makes the refetch attributable to exactly one thing.
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

/** Signed in as Ada, on a tea with one review by somebody else. */
function teaPage(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([grace])),
    // M6 hangs a "where to buy" panel off the same page. Registered for the same
    // reason: an unhandled request rejects loudly, which is the point of the router.
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('rating a tea PUTs what the form says and the tea detail comes back changed', async () => {
  // Stateful, so the refetch can disagree with what was on screen before it. A fixture
  // frozen at 8.2 would pass even if nothing were invalidated.
  let detail = jasminePearlsDetail
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () => json(detail),
    'PUT /catalog/teas/jasmine-pearls/review': ({ init }) => {
      const input = JSON.parse(String(init?.body)) as { score: number }
      const saved: Review = { ...mine, score: input.score, aroma: 9, flavour: null, aftertaste: null }
      detail = { ...detail, my_review: saved, my_score: input.score, average_score: 8.3, review_count: 15 }
      return json(saved)
    },
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-form')
  expect(screen.queryByTestId('your-score')).toBeNull()

  fireEvent.change(screen.getByLabelText('Your score'), { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Aroma'), { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Notes (optional)'), {
    target: { value: '  Best pot of it yet.  ' },
  })
  fireEvent.change(screen.getByLabelText('Brewed on'), { target: { value: '2026-08-24' } })
  fireEvent.submit(screen.getByTestId('review-form'))

  expect(await screen.findByTestId('review-saved')).toBeInTheDocument()

  // Every key is sent, and the two subscores left alone go as explicit nulls: a PUT that
  // omitted them could not express clearing one on a later edit.
  expect(bodyOf('PUT', '/catalog/teas/jasmine-pearls/review')).toEqual({
    score: 9,
    aroma: 9,
    flavour: null,
    aftertaste: null,
    body: 'Best pot of it yet.',
    brewed_at: '2026-08-24',
  })

  // The detail refetched, and the page is showing what came back rather than what it
  // had. Both halves matter: the request, and the number on screen.
  await waitFor(() => expect(countOf('GET', '/catalog/teas/jasmine-pearls')).toBe(2))
  expect(await screen.findByTestId('your-score')).toHaveTextContent('You rated 9')
  expect(screen.getByTestId('rating-average')).toHaveTextContent('8.3')
})

test('an existing review pre-fills the form, and the action reads as editing', async () => {
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () =>
      json({ ...jasminePearlsDetail, my_review: mine, my_score: mine.score }),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([mine, grace])),
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-form')

  expect(screen.getByLabelText('Your score')).toHaveValue('7')
  expect(screen.getByLabelText('Aroma')).toHaveValue('6')
  // Null subscores come back as the blank option, not as a stray 0.
  expect(screen.getByLabelText('Flavour')).toHaveValue('')
  expect(screen.getByLabelText('Aftertaste')).toHaveValue('5')
  expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Grassier than I remembered.')
  expect(screen.getByLabelText('Brewed on')).toHaveValue('2026-08-20')

  // It has to read as changing something that exists, not as adding a second opinion.
  expect(screen.getByRole('button', { name: 'Save changes to your review' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Post your rating' })).toBeNull()
  expect(screen.getByTestId('your-review')).toHaveTextContent('Your review')

  // And your own row in the public list is labelled rather than hidden.
  const rows = await screen.findAllByTestId('review-row')
  expect(within(rows[0]).getByText('You')).toBeInTheDocument()
  expect(within(rows[1]).queryByText('You')).toBeNull()
})

test('a signed-out visitor reads the reviews and is offered a sign-in, not a form', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/jasmine-pearls': () =>
      json({ ...jasminePearlsDetail, my_score: null, my_review: null }),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([grace])),
  })
  renderApp('/teas/jasmine-pearls')

  // The reviews themselves are public and fully readable.
  const list = await screen.findByTestId('review-list')
  expect(within(list).getByText('Grace Hopper')).toBeInTheDocument()
  expect(within(list).getByText('Floral without tipping into soap.')).toBeInTheDocument()
  expect(screen.getByTestId('rating-average')).toHaveTextContent('8.2')

  // The form is absent, not disabled, and there is a way in.
  expect(screen.queryByTestId('review-form')).toBeNull()
  expect(screen.queryByLabelText('Your score')).toBeNull()
  expect(screen.queryByTestId('your-score')).toBeNull()
  const prompt = screen.getByTestId('review-signed-out')
  expect(prompt).toHaveTextContent('Sign in')
  // Scoped: the nav carries a "Sign in" of its own, and the one that matters here is
  // the one sitting where the form would have been.
  expect(within(prompt).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
})

test('your own score is shown apart from the average, not folded into it', async () => {
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () =>
      json({ ...jasminePearlsDetail, my_review: mine, my_score: 9 }),
  })
  renderApp('/teas/jasmine-pearls')

  const yours = await screen.findByTestId('your-score')
  expect(yours).toHaveTextContent('You rated 9')

  // The crowd's number is the crowd's number: 8.2 from 14 people, with your 9 nowhere
  // inside that block. Two facts, two places on the page.
  const average = screen.getByTestId('rating-average')
  expect(average).toHaveTextContent('8.2')
  expect(average).toHaveTextContent('from 14 reviews')
  expect(average).not.toHaveTextContent('You rated')
  expect(within(average).queryByTestId('your-score')).toBeNull()

  // The per-aspect averages, and only the ones that have any.
  expect(screen.getByTestId('average-aroma')).toHaveTextContent('8.5')
  expect(screen.getByTestId('average-flavour')).toHaveTextContent('8.0')
  expect(screen.queryByTestId('average-aftertaste')).toBeNull()
})

test('a tea nobody has rated invites a first rating rather than reading zero', async () => {
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () =>
      json({
        ...jasminePearlsDetail,
        average_score: null,
        review_count: 0,
        my_score: null,
        my_review: null,
        average_aroma: null,
        average_flavour: null,
      }),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
  })
  renderApp('/teas/jasmine-pearls')

  const empty = await screen.findByTestId('rating-empty')
  expect(empty).toHaveTextContent('Nobody has rated this yet')

  // The thing this test exists for: no "0", no "0.0", nowhere in the summary. Note the
  // substring trap — "out of 10" contains a zero, which is why that line is not rendered
  // in this branch at all.
  expect(screen.getByTestId('rating-summary')).not.toHaveTextContent('0')
  expect(screen.queryByTestId('rating-average')).toBeNull()
  expect(screen.queryByTestId('review-count')).toBeNull()
  expect(await screen.findByTestId('review-list-empty')).toHaveTextContent(
    'No reviews written yet',
  )

  // Signed in, so the invitation is actionable.
  expect(screen.getByTestId('review-form')).toBeInTheDocument()
})

test('deleting your review takes two steps and refreshes what the page claims', async () => {
  let detail: TeaDetail = { ...jasminePearlsDetail, my_review: mine, my_score: mine.score }
  let reviews = [mine, grace]
  teaPage({
    'GET /catalog/teas/jasmine-pearls': () => json(detail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf(reviews)),
    'DELETE /catalog/teas/jasmine-pearls/review': () => {
      detail = { ...jasminePearlsDetail, my_review: null, my_score: null }
      reviews = [grace]
      return new Response(null, { status: 204 })
    },
  })
  renderApp('/teas/jasmine-pearls')

  fireEvent.click(await screen.findByTestId('delete-review'))

  // Step one asks; it does not delete. No `window.confirm` anywhere near it.
  expect(countOf('DELETE', '/catalog/teas/jasmine-pearls/review')).toBe(0)
  expect(screen.getByTestId('confirm-delete-review')).toBeInTheDocument()

  // …and it is escapable.
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
  expect(screen.queryByTestId('confirm-delete-review')).toBeNull()
  expect(countOf('DELETE', '/catalog/teas/jasmine-pearls/review')).toBe(0)

  fireEvent.click(screen.getByTestId('delete-review'))
  fireEvent.click(screen.getByTestId('confirm-delete-review'))

  await waitFor(() => expect(countOf('DELETE', '/catalog/teas/jasmine-pearls/review')).toBe(1))

  // Both invalidations, seen from the outside: the detail and this tea's reviews are
  // mounted, so each one refetching is a request that would not otherwise happen.
  await waitFor(() => expect(countOf('GET', '/catalog/teas/jasmine-pearls')).toBe(2))
  await waitFor(() => expect(countOf('GET', '/catalog/teas/jasmine-pearls/reviews')).toBe(2))

  // And the page agrees: your badge is gone, your row is gone, the form is empty again.
  await waitFor(() => expect(screen.queryByTestId('your-score')).toBeNull())
  expect(screen.getAllByTestId('review-row')).toHaveLength(1)
  expect(screen.getByLabelText('Your score')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Post your rating' })).toBeInTheDocument()
})

test('a rating reaches the catalog list and your own list, not just the page you rated on', async () => {
  // The cache is pinned fresh for the whole journey. Without that, every one of these
  // navigations refetches on mount anyway and the test would pass with all four
  // invalidations deleted — which is the exact trap this test exists to close.
  let detail = jasminePearlsDetail
  let card = jasminePearls
  let mineList: MyReview[] = []

  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /reviews/mine': () => json(pageOf(mineList)),
    'GET /catalog/teas': () => json(pageOf([card], { size: 24 })),
    'GET /catalog/ingredients': () => json(pageOf([])),
    'GET /catalog/brands': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls': () => json(detail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([grace])),
    'PUT /catalog/teas/jasmine-pearls/review': () => {
      const saved: Review = { ...mine, score: 10 }
      detail = { ...detail, my_review: saved, my_score: 10, average_score: 8.3, review_count: 15 }
      card = { ...card, my_score: 10, average_score: 8.3, review_count: 15 }
      mineList = [{ ...myReview, score: 10 }]
      return json(saved)
    },
  })

  renderApp('/reviews/mine', { staleTime: Infinity })

  // Warm all three caches: your (empty) list, the catalog grid, then the tea itself.
  expect(await screen.findByTestId('my-reviews-empty')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Browse the catalog' }))

  await screen.findByTestId('tea-card')
  expect(screen.getByTestId('tea-card-rating')).toHaveTextContent('★ 8.2 · 14')
  expect(screen.queryByTestId('tea-card-my-score')).toBeNull()
  expect(countOf('GET', '/catalog/teas')).toBe(1)
  expect(countOf('GET', '/reviews/mine')).toBe(1)

  fireEvent.click(screen.getByTestId('tea-card'))
  await screen.findByTestId('review-form')

  fireEvent.change(screen.getByLabelText('Your score'), { target: { value: '10' } })
  fireEvent.submit(screen.getByTestId('review-form'))
  await screen.findByTestId('review-saved')

  // Back to the grid: it is a fresh-forever cache, so a second request here can only be
  // the invalidation. The card now carries the new average and your badge.
  fireEvent.click(screen.getByRole('link', { name: '← All teas' }))
  await waitFor(() => expect(countOf('GET', '/catalog/teas')).toBe(2))
  await waitFor(() =>
    expect(screen.getByTestId('tea-card-rating')).toHaveTextContent('★ 8.3 · 15'),
  )
  expect(screen.getByTestId('tea-card-my-score')).toHaveTextContent('You rated 10')

  // Same again for /reviews/mine, which was cached empty before the rating existed.
  fireEvent.click(screen.getByTestId('nav-my-reviews'))
  await waitFor(() => expect(countOf('GET', '/reviews/mine')).toBe(2))
  const rated = await screen.findByTestId('my-review')
  expect(within(rated).getByRole('link', { name: 'Jasmine Pearls' })).toHaveAttribute(
    'href',
    '/teas/jasmine-pearls',
  )
  expect(screen.getByTestId('my-review-score-jasmine-pearls')).toHaveTextContent('10')
  expect(screen.queryByTestId('my-reviews-empty')).toBeNull()
})

test('a card for a tea nobody has rated says so rather than showing a zero', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas': () =>
      json(pageOf([{ ...jasminePearls, average_score: null, review_count: 0, my_score: null }])),
    'GET /catalog/ingredients': () => json(pageOf([])),
    'GET /catalog/brands': () => json(pageOf([])),
  })
  renderApp('/teas')

  const card = await screen.findByTestId('tea-card')
  expect(within(card).getByTestId('tea-card-unrated')).toHaveTextContent('Not rated yet')
  expect(within(card).queryByTestId('tea-card-rating')).toBeNull()
  expect(within(card).queryByTestId('tea-card-my-score')).toBeNull()
  // The grid is where a "0" would do the most damage: a wall of them reads as a wall of
  // bad tea. The card's own text carries no digit at all.
  expect(card).not.toHaveTextContent('0')
})

test('the reviews list pages, and the tea page asks for the page it is showing', async () => {
  const second: Review = { ...grace, id: 'rev-3', author: { ...grace.author, display_name: 'Alan Turing' } }
  teaPage({
    'GET /catalog/teas/jasmine-pearls/reviews': ({ url }) =>
      json(
        url.searchParams.get('page') === '2'
          ? pageOf([second], { total: 2, page: 2, pages: 2 })
          : pageOf([grace], { total: 2, page: 1, pages: 2 }),
      ),
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-list')
  expect(screen.getByText('Grace Hopper')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('page-next'))

  expect(await screen.findByText('Alan Turing')).toBeInTheDocument()
  const paged = calls.filter(
    (call) => call.method === 'GET' && call.path === '/catalog/teas/jasmine-pearls/reviews',
  )
  expect(paged[0].search).toContain('page=1')
  expect(paged[0].search).toContain('size=10')
  expect(paged.at(-1)?.search).toContain('page=2')
})

test('the form refuses to post without a score, and says so on the field', async () => {
  teaPage()
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-form')
  fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Nice.' } })
  fireEvent.submit(screen.getByTestId('review-form'))

  expect(screen.getByTestId('review-score-error')).toHaveTextContent('score from 1 to 10')
  expect(countOf('PUT', '/catalog/teas/jasmine-pearls/review')).toBe(0)
})

test('a rejected rating keeps the form and shows the server’s own sentence', async () => {
  teaPage({
    'PUT /catalog/teas/jasmine-pearls/review': () =>
      json({ detail: 'You cannot review a tea you suggested.' }, 409),
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-form')
  fireEvent.change(screen.getByLabelText('Your score'), { target: { value: '6' } })
  fireEvent.submit(screen.getByTestId('review-form'))

  expect(await screen.findByTestId('review-error')).toHaveTextContent(
    'You cannot review a tea you suggested.',
  )
  // What you typed is still there, and nothing pretended to succeed.
  expect(screen.getByLabelText('Your score')).toHaveValue('6')
  expect(screen.queryByTestId('review-saved')).toBeNull()
})

test('the nav offers your reviews only once you are signed in', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearlsDetail),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([grace])),
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByTestId('review-list')
  expect(screen.queryByTestId('nav-my-reviews')).toBeNull()

  cleanup()
  teaPage()
  renderApp('/teas/jasmine-pearls')

  expect(await screen.findByTestId('nav-my-reviews')).toHaveAttribute('href', '/reviews/mine')
})

/**
 * Regression: a public page must not fetch before auth settles.
 *
 * `/teas/:slug` is not behind RequireAuth, so on a cold load it renders and fetches
 * immediately — while AuthProvider's silent refresh is still in flight. The anonymous
 * response (my_score: null) then got cached under a key a signed-in visitor reads, and
 * the rating form stayed empty for someone who had already rated the tea. Found in the
 * browser, not by a test: every test here had a token before the first render.
 */
test('a cold load waits for the silent refresh before asking for the tea', async () => {
  let releaseRefresh: (value: Response) => void = () => {}
  const refreshPending = new Promise<Response>((resolve) => {
    releaseRefresh = resolve
  })

  mockFetch({
    'POST /auth/refresh': () => refreshPending,
    'GET /catalog/teas/jasmine-pearls': () =>
      json({ ...jasminePearlsDetail, my_score: 7, my_review: mine }),
    'GET /catalog/teas/jasmine-pearls/reviews': () =>
      json({ items: [grace, mine], total: 2, page: 1, size: 10, pages: 1 }),
  })

  renderApp('/teas/jasmine-pearls')

  // The tea request must not have gone out yet: it would carry no Authorization header.
  await waitFor(() => expect(countOf('POST', '/auth/refresh')).toBe(1))
  expect(countOf('GET', '/catalog/teas/jasmine-pearls')).toBe(0)

  releaseRefresh(json(session))

  expect(await screen.findByText(/You rated 7/i)).toBeInTheDocument()
  expect(countOf('GET', '/catalog/teas/jasmine-pearls')).toBe(1)
})

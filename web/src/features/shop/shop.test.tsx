import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page, TeaDetail } from '../../lib/catalog'
import type { HouseholdSummary, StockItemDetail } from '../../lib/household'
import type { Listing, ListingWithShop, ShopDetail, ShopReview, ShopSummary } from '../../lib/shop'
import { MAX_IMAGE_BYTES } from '../../lib/upload'
import { clearAccessToken } from '../../lib/token'
import { MemoryRouter } from 'react-router'
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

const grace: User = { ...ada, id: 'user-2', display_name: 'Grace Hopper', role: 'admin' }

function sessionFor(user: User): Session {
  return { access_token: 'access-1', token_type: 'bearer', expires_in: 900, user }
}

/**
 * jsdom has no layout and no canvas, so a Leaflet map cannot be instantiated in it at
 * all. Every Leaflet import in the app lives in `./ShopMap` for exactly this reason —
 * one mock covers the browse map, the shop's own map and the admin pin editor, and the
 * suites that never think about maps do not have to grow one each.
 *
 * The M6 tests in this file are not about maps; they only need the module to be inert.
 * `map.test.tsx` mocks it with stubs that report their props.
 */
vi.mock('./ShopMap', () => ({
  ShopMap: () => <div data-testid="shop-map" />,
  ShopPointMap: () => <div data-testid="shop-point-map" />,
  ShopPinPicker: () => <div data-testid="shop-pin-picker" />,
}))

const kruka: ShopSummary = {
  id: 'shop-1',
  slug: 'u-kruka',
  name: 'Herbaciarnia u Kruka',
  city: 'Kraków',
  country: 'Poland',
  website: 'https://kruka.example',
  image_url: null,
  is_approved: true,
  listing_count: 2,
  latitude: 50.0625,
  longitude: 19.937,
  // Null unless the request carried a position, which none of the M6 tests do.
  distance_km: null,
  // M8 widened both shop schemas the way M4 widened the tea ones: the star, and the
  // same three rating numbers a tea carries. Unstarred and unrated unless a test says
  // otherwise — null and 0 are what an untouched shop actually comes back as.
  is_favourite: false,
  average_score: null,
  review_count: 0,
  my_score: null,
}

const krukaDetail: ShopDetail = {
  ...kruka,
  description: 'A room the size of a kitchen with four hundred tins in it.',
  address: 'ul. Sławkowska 12',
  created_at: '2026-04-01T09:00:00Z',
  my_review: null,
}

const senchaTea = {
  id: 'tea-1',
  slug: 'sencha',
  name: 'Sencha',
  tea_type: 'green' as const,
  image_url: null,
}

/** 450 minor units of PLN. The whole point of the fixture: it must never reach a screen
 *  as "450", and it must reach one as 4.50. */
const pricedListing: Listing = {
  id: 'listing-1',
  tea: senchaTea,
  pack_grams: 50,
  price_minor: 450,
  currency: 'PLN',
  product_url: 'https://kruka.example/sencha',
  is_available: true,
}

/** The other half of the price story: a shop that lists a tea without publishing what it
 *  costs. Rendering 0 for this is the bug the test guards. */
const unpricedListing: Listing = {
  id: 'listing-2',
  tea: { ...senchaTea, id: 'tea-2', slug: 'dan-cong', name: 'Dan Cong', tea_type: 'oolong' },
  pack_grams: null,
  price_minor: null,
  currency: null,
  product_url: null,
  is_available: true,
}

const krukaSencha: ListingWithShop = { ...pricedListing, shop: kruka }

const jasminePearls: TeaDetail = {
  id: 'tea-9',
  slug: 'jasmine-pearls',
  name: 'Jasmine Pearls',
  tea_type: 'green',
  caffeine_level: 'medium',
  image_url: null,
  brand: null,
  is_approved: true,
  primary_ingredients: [],
  average_score: null,
  review_count: 0,
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
  is_favourite: false,
  my_brewing: null,
}

const home: HouseholdSummary = {
  id: 'hh-1',
  name: 'Home',
  image_url: null,
  role: 'owner',
  member_count: 2,
  stock_item_count: 4,
  low_stock_count: 0,
  created_at: '2026-03-01T08:00:00Z',
}

const boughtTin: StockItemDetail = {
  id: 'item-7',
  tea: senchaTea,
  quantity_grams: 50,
  low_stock_grams: 20,
  is_low: false,
  location: null,
  opened_at: null,
  best_before: null,
  updated_at: '2026-08-26T10:00:00Z',
  notes: null,
  purchased_at: '2026-08-26',
  price_paid_minor: 450,
  currency: 'PLN',
  recent_events: [],
  shop: { id: kruka.id, slug: kruka.slug, name: kruka.name },
}

function pageOf<T>(items: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, page: 1, size: 24, pages: 1, ...extra }
}

/* ------------------------------------------------------------------ test harness */

type Handler = (request: { url: URL; init?: RequestInit }) => Response | Promise<Response>

type Call = { method: string; path: string; search: string; body: BodyInit | null }

const calls: Call[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Routes by `METHOD /path`, ignoring the query string, and records every call so a test
 * can assert on *how many* requests happened as well as what came back. An unregistered
 * path rejects loudly rather than answering something plausible.
 *
 * `body` is kept as the raw `BodyInit` rather than a string, because M6 is the first
 * milestone to send a `FormData` — and the upload tests need to know both that one went
 * out and, elsewhere, that one did not.
 */
function mockFetch(handlers: Record<string, Handler>) {
  calls.length = 0
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace('/api/v1', '')
    calls.push({ method, path, search: url.search, body: init?.body ?? null })

    const handler = handlers[`${method} ${path}`]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${method} ${path}`))
    return Promise.resolve(handler({ url, init }))
  })
}

const bodyOf = (method: string, path: string): unknown => {
  const call = calls.find((entry) => entry.method === method && entry.path === path)
  return JSON.parse(typeof call?.body === 'string' ? call.body : 'null')
}

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

/** Signed in as Ada, standing in front of one shop with two listings. */
function shopPage(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(sessionFor(ada)),
    'GET /friends/requests': () => json([]),
    'GET /shops/u-kruka': () => json(krukaDetail),
    'GET /shops/u-kruka/listings': () => json(pageOf([pricedListing, unpricedListing])),
    // M8 hangs a ratings panel off the bottom of this page. Registered so the request
    // it makes is one the harness knows about — an unhandled one rejects loudly, which
    // is the point of the router.
    'GET /shops/u-kruka/reviews': () => json(pageOf([])),
    'GET /households': () => json([home]),
    ...overrides,
  })
}

/**
 * A `File` of a stated size without allocating one. `size` is a read-only accessor on
 * `File`, so the 6 MB case is defined rather than actually held in memory — the check
 * under test reads the number and nothing else.
 */
function fileOf(name: string, type: string, size: number): File {
  const file = new File(['tea'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------ browsing */

test('the browse grid shows each shop with where it is and how much it carries', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops': () => json(pageOf([kruka])),
  })
  renderApp('/shops')

  const list = await screen.findByTestId('shop-list')
  const card = within(list).getByTestId('shop-card')
  expect(card).toHaveTextContent('Herbaciarnia u Kruka')
  expect(within(card).getByTestId('shop-card-place')).toHaveTextContent('Kraków, Poland')
  expect(card).toHaveTextContent('2 teas')
  expect(card).toHaveAttribute('href', '/shops/u-kruka')

  // No picture on this one, so the shared leaf stands in — and it is hidden from the
  // accessibility tree, because "leaf" is not a fact about this shop.
  expect(within(card).getByTestId('shop-card-image-placeholder')).toHaveAttribute(
    'aria-hidden',
    'true',
  )

  // Public: it renders for somebody with no session at all, and does not need one.
  expect(screen.queryByTestId('toggle-suggest-shop')).toBeNull()
})

test('the city filter lives in the URL and is sent to the API', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops': () => json(pageOf([kruka])),
  })
  renderApp('/shops?city=Krak%C3%B3w')

  await screen.findByTestId('shop-list')
  const request = calls.find((call) => call.path === '/shops')
  expect(request?.search).toContain('city=Krak')
  // A shared link arrives with its filter already in the box.
  expect(screen.getByLabelText('City')).toHaveValue('Kraków')
})

/* ------------------------------------------------------------------- prices */

test('a price in minor units renders in major units, and no price says so', async () => {
  shopPage()
  renderApp('/shops/u-kruka')

  const priced = await screen.findByTestId('listing-listing-1')
  // 450 minor units of PLN is 4.50 — never "450", and never "4.5".
  expect(within(priced).getByTestId('listing-price-listing-1')).toHaveTextContent('4.50')
  expect(priced).not.toHaveTextContent('450')
  expect(within(priced).getByTestId('listing-pack-listing-1')).toHaveTextContent('50 g')

  // And the tea nobody has priced says so rather than reading as free.
  const unpriced = screen.getByTestId('listing-listing-2')
  expect(within(unpriced).getByTestId('listing-no-price-listing-2')).toHaveTextContent(
    'Price not listed',
  )
  expect(unpriced).not.toHaveTextContent('0.00')
  expect(screen.queryByTestId('listing-price-listing-2')).toBeNull()
})

test('the outbound link opens in a new tab and cannot reach back through window.opener', async () => {
  shopPage()
  renderApp('/shops/u-kruka')

  const link = await screen.findByTestId('listing-link-listing-1')
  expect(link).toHaveAttribute('href', 'https://kruka.example/sencha')
  expect(link).toHaveAttribute('target', '_blank')
  // `noopener` is the load-bearing half: without it the opened page gets a handle on
  // this one and can navigate it wherever it likes.
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link).toHaveTextContent('Buy at Herbaciarnia u Kruka')

  // The listing with no product page offers no link at all, rather than a dead one.
  expect(screen.queryByTestId('listing-link-listing-2')).toBeNull()
})

/* ------------------------------------------------------------------ buying */

test('buying posts the household, the grams and the price in minor units', async () => {
  shopPage({ 'POST /shops/u-kruka/listings/listing-1/buy': () => json(boughtTin, 201) })
  renderApp('/shops/u-kruka')

  fireEvent.click(await screen.findByTestId('buy-listing-1'))
  // The picker waits on `GET /households`, so the form does not exist on the same tick.
  await screen.findByTestId('buy-form')

  // The listing's own pack size and price are already in the boxes: the common case is
  // "I bought exactly what it says", and retyping it is a step for nobody.
  expect(screen.getByLabelText('How much?')).toHaveValue(50)
  expect(screen.getByLabelText('What did you pay?')).toHaveValue('4.50')

  fireEvent.change(screen.getByLabelText('What did you pay?'), { target: { value: '5.20' } })
  fireEvent.change(screen.getByLabelText('When?'), { target: { value: '2026-08-20' } })
  fireEvent.submit(screen.getByTestId('buy-form'))

  await screen.findByTestId('buy-success')

  expect(bodyOf('POST', '/shops/u-kruka/listings/listing-1/buy')).toEqual({
    household_id: 'hh-1',
    grams: 50,
    // 5.20 typed, 520 sent. The form speaks major units and the wire speaks minor.
    price_paid_minor: 520,
    currency: 'PLN',
    purchased_at: '2026-08-20',
  })
})

test('a purchase invalidates the household stock, the summary and the tin', async () => {
  // Stateful, so a refetch can disagree with what was cached before it. A frozen fixture
  // would pass even if nothing were invalidated.
  let shelfFetches = 0
  let householdFetches = 0

  shopPage({
    'POST /shops/u-kruka/listings/listing-1/buy': () => json(boughtTin, 201),
    'GET /households/hh-1/stock': () => {
      shelfFetches += 1
      return json(pageOf([]))
    },
    'GET /households': () => {
      householdFetches += 1
      return json([home])
    },
  })

  renderApp('/shops/u-kruka')
  fireEvent.click(await screen.findByTestId('buy-listing-1'))

  // The household list is fetched once to populate the picker.
  await waitFor(() => expect(householdFetches).toBe(1))

  fireEvent.submit(await screen.findByTestId('buy-form'))
  await screen.findByTestId('buy-success')

  // The summary goes stale the moment a tin lands: `stock_item_count` is printed on the
  // /households cards one screen away.
  await waitFor(() => expect(householdFetches).toBe(2))

  // The confirmation links straight at the tin the server just created, and the shelf is
  // refetched when somebody follows it.
  const link = screen.getByTestId('buy-success-tin-link')
  expect(link).toHaveAttribute('href', '/households/hh-1/stock/item-7')
  expect(screen.getByTestId('buy-success')).toHaveTextContent('50 g of Sencha')
  expect(screen.getByTestId('buy-success')).toHaveTextContent('at Home')

  // The shelf itself was never on screen, so it was invalidated rather than refetched —
  // which is the correct behaviour and is why this asserts it stayed at zero rather than
  // pretending a background fetch happened.
  expect(shelfFetches).toBe(0)
})

test('belonging to no household explains itself instead of showing an empty picker', async () => {
  shopPage({ 'GET /households': () => json([]) })
  renderApp('/shops/u-kruka')

  fireEvent.click(await screen.findByTestId('buy-listing-1'))

  const explanation = await screen.findByTestId('buy-no-households')
  expect(explanation).toHaveTextContent('You need a household first')
  expect(within(explanation).getByRole('link', { name: /household/i })).toHaveAttribute(
    'href',
    '/households',
  )

  // Emphatically not a select with nothing in it, and not a submit button that could
  // only ever 422.
  expect(screen.queryByTestId('buy-form')).toBeNull()
  expect(screen.queryByLabelText('Onto whose shelf?')).toBeNull()
})

test('a signed-out visitor gets the outbound link but no buy button', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops/u-kruka': () => json(krukaDetail),
    'GET /shops/u-kruka/listings': () => json(pageOf([pricedListing])),
  })
  renderApp('/shops/u-kruka')

  expect(await screen.findByTestId('listing-link-listing-1')).toBeInTheDocument()
  expect(screen.queryByTestId('buy-listing-1')).toBeNull()
  // And nothing asked for households, which would be a guaranteed 401.
  expect(calls.some((call) => call.path === '/households')).toBe(false)
})

/* -------------------------------------------------------------- where to buy */

test('the where-to-buy panel is absent, not empty, when no shop carries the tea', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearls),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([])),
  })
  renderApp('/teas/jasmine-pearls')

  await screen.findByRole('heading', { level: 1, name: 'Jasmine Pearls' })
  // The request happened — this is not passing because the panel never asked.
  await waitFor(() =>
    expect(calls.some((call) => call.path === '/catalog/teas/jasmine-pearls/shops')).toBe(true),
  )
  expect(screen.queryByTestId('where-to-buy')).toBeNull()
  expect(screen.queryByText(/where to buy/i)).toBeNull()
})

test('the where-to-buy panel lists the shops that carry the tea, with prices', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /catalog/teas/jasmine-pearls': () => json(jasminePearls),
    'GET /catalog/teas/jasmine-pearls/reviews': () => json(pageOf([])),
    'GET /catalog/teas/jasmine-pearls/shops': () => json(pageOf([krukaSencha])),
  })
  renderApp('/teas/jasmine-pearls')

  const panel = await screen.findByTestId('where-to-buy')
  // Read from the tea, the *shop* is the headline — the tea is the page you are on.
  expect(within(panel).getByRole('link', { name: 'Herbaciarnia u Kruka' })).toHaveAttribute(
    'href',
    '/shops/u-kruka',
  )
  expect(panel).toHaveTextContent('Kraków, Poland')
  expect(within(panel).getByTestId('listing-price-listing-1')).toHaveTextContent('4.50')
})

/* ----------------------------------------------------------------- suggesting */

test('a signed-in visitor can suggest a shop and is told it is queued', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(ada)),
    'GET /friends/requests': () => json([]),
    'GET /shops': () => json(pageOf([])),
    'POST /shops': () =>
      json({ ...krukaDetail, name: 'Czajnik', slug: 'czajnik', is_approved: false }, 201),
  })
  renderApp('/shops')

  fireEvent.click(await screen.findByTestId('toggle-suggest-shop'))
  // Scoped to the form: the filter panel above it has a "City" box of its own, and
  // grabbing the wrong one would type a suggestion into a search.
  const form = screen.getByTestId('suggest-shop-form')
  fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Czajnik' } })
  fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Warsaw' } })
  fireEvent.submit(form)

  expect(await screen.findByTestId('suggest-shop-success')).toHaveTextContent('queued for review')

  // Blank optional fields are omitted rather than sent as empty strings, and the
  // suggestion body carries no picture — that endpoint does not take one.
  expect(bodyOf('POST', '/shops')).toEqual({ name: 'Czajnik', city: 'Warsaw' })
})

/* -------------------------------------------------------------------- admin */

test('an admin approves a queued shop', async () => {
  let approved = false
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': ({ url }) => {
      const wantApproved = url.searchParams.get('approved') === 'true'
      if (wantApproved) return json(pageOf(approved ? [kruka] : []))
      return json(pageOf(approved ? [] : [{ ...kruka, is_approved: false }]))
    },
    'POST /admin/shops/shop-1/approve': () => {
      approved = true
      return json(krukaDetail)
    },
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('approve-shop-shop-1'))

  expect(await screen.findByTestId('shop-queue-notice')).toHaveTextContent('is now listed')
  // The queue empties and the shop turns up in the listed half, which only happens if
  // both cached parameter combinations were invalidated by the shared prefix.
  expect(await screen.findByTestId('shop-queue-empty')).toBeInTheDocument()
  expect(await screen.findByTestId('shop-live-list')).toHaveTextContent('Herbaciarnia u Kruka')
})

test('a non-admin cannot reach the shop queue, and no admin request is made', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(ada)),
    'GET /friends/requests': () => json([]),
  })
  renderApp('/admin/shops')

  expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument()
  expect(calls.some((call) => call.path.startsWith('/admin'))).toBe(false)
})

/* ------------------------------------------------------------------- uploads */

test('an oversized image is refused before any request goes out', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': () => json(pageOf([])),
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  const input = screen.getByTestId('admin-shop-image-input')

  fireEvent.change(input, {
    target: { files: [fileOf('huge.png', 'image/png', MAX_IMAGE_BYTES + 1)] },
  })

  expect(await screen.findByTestId('admin-shop-image-error')).toHaveTextContent('too large')
  expect(screen.getByTestId('admin-shop-image-error')).toHaveTextContent('5 MB')

  // The point of the client-side check: forty megabytes never left the phone.
  expect(calls.some((call) => call.path === '/uploads/image')).toBe(false)
  expect(screen.queryByTestId('admin-shop-image-preview')).toBeNull()
})

test('a file that is not an image is refused for being the wrong kind, not the wrong size', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': () => json(pageOf([])),
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  fireEvent.change(screen.getByTestId('admin-shop-image-input'), {
    target: { files: [fileOf('notes.pdf', 'application/pdf', 1024)] },
  })

  const error = await screen.findByTestId('admin-shop-image-error')
  expect(error).toHaveTextContent('JPEG, PNG or WebP')
  expect(error).not.toHaveTextContent('too large')
  expect(calls.some((call) => call.path === '/uploads/image')).toBe(false)
})

test('a 415 from the server says what kind of file is wanted', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': () => json(pageOf([])),
    // The client typed this one as a PNG and the server disagreed — a renamed file, or
    // one the browser guessed wrong about.
    'POST /uploads/image': () => json({ detail: 'Unsupported Media Type' }, 415),
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  fireEvent.change(screen.getByTestId('admin-shop-image-input'), {
    target: { files: [fileOf('liar.png', 'image/png', 2048)] },
  })

  // Our sentence, not FastAPI's "Unsupported Media Type", which names the status code
  // rather than the problem.
  const error = await screen.findByTestId('admin-shop-image-error')
  expect(error).toHaveTextContent('not a JPEG, PNG or WebP image')
  expect(error).not.toHaveTextContent('Unsupported Media Type')
})

test('an accepted image is uploaded as multipart and previewed', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': () => json(pageOf([])),
    'POST /uploads/image': () => json({ url: 'https://cdn.example/kruka.png' }, 201),
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  fireEvent.change(screen.getByTestId('admin-shop-image-input'), {
    target: { files: [fileOf('kruka.png', 'image/png', 2048)] },
  })

  const preview = await screen.findByTestId('admin-shop-image-preview')
  expect(preview).toHaveAttribute('src', 'https://cdn.example/kruka.png')

  const sent = calls.find((call) => call.path === '/uploads/image')?.body
  // Multipart, with the field name the contract asks for — and emphatically not JSON.
  expect(sent).toBeInstanceOf(FormData)
  const form = sent as FormData
  const file = form.get('file')
  expect(file).toBeInstanceOf(File)
  expect((file as File).name).toBe('kruka.png')

  // Clearing it goes back to the placeholder, and to `null` rather than `''` — only null
  // means "remove the picture" in a PATCH.
  fireEvent.click(screen.getByTestId('admin-shop-image-clear'))
  expect(await screen.findByTestId('admin-shop-image-placeholder')).toBeInTheDocument()
})

test('the upload sends no JSON content type, so the browser can write the boundary', async () => {
  let contentType: string | null = 'never set'
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': () => json(pageOf([])),
    'POST /uploads/image': ({ init }) => {
      contentType = new Headers(init?.headers).get('Content-Type')
      return json({ url: 'https://cdn.example/kruka.png' }, 201)
    },
  })
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  fireEvent.change(screen.getByTestId('admin-shop-image-input'), {
    target: { files: [fileOf('kruka.png', 'image/png', 2048)] },
  })

  await screen.findByTestId('admin-shop-image-preview')
  // `multipart/form-data` is unparseable without the `boundary=` parameter, and only
  // fetch can supply it — so we must not set the header at all.
  expect(contentType).toBeNull()
})

/* --------------------------------------------------------------- rating a shop (M8) */

/** Somebody else's, so the public list is never empty by accident. */
const graceReview: ShopReview = {
  id: 'srev-1',
  author: { id: grace.id, display_name: grace.display_name, avatar_url: null },
  score: 8,
  body: 'Four hundred tins and somebody behind the counter who knows all of them.',
  created_at: '2026-08-03T09:00:00Z',
  updated_at: '2026-08-03T09:00:00Z',
}

/** Ada's own, for the pre-fill and the "apart from the average" journey. */
const myReview: ShopReview = {
  id: 'srev-2',
  author: { id: ada.id, display_name: ada.display_name, avatar_url: null },
  score: 7,
  body: null,
  created_at: '2026-08-21T08:00:00Z',
  updated_at: '2026-08-21T08:00:00Z',
}

const countOf = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length

test('rating a shop PUTs what the form says, and the average comes back changed', async () => {
  // Stateful, so the refetch can disagree with what was on screen before it. A fixture
  // frozen at 8.0 would pass even if nothing were invalidated.
  let detail: ShopDetail = { ...krukaDetail, average_score: 8, review_count: 1 }
  shopPage({
    'GET /shops/u-kruka': () => json(detail),
    'GET /shops/u-kruka/reviews': () => json(pageOf([graceReview])),
    'PUT /shops/u-kruka/review': ({ init }) => {
      const input = JSON.parse(String(init?.body)) as { score: number; body: string | null }
      const saved: ShopReview = { ...myReview, score: input.score, body: input.body }
      detail = {
        ...detail,
        my_review: saved,
        my_score: input.score,
        average_score: 8.5,
        review_count: 2,
      }
      return json(saved)
    },
  })
  renderApp('/shops/u-kruka')

  await screen.findByTestId('shop-review-form')
  expect(screen.queryByTestId('your-score')).toBeNull()

  fireEvent.change(screen.getByLabelText('Your score'), { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Notes (optional)'), {
    target: { value: '  Worth the tram ride.  ' },
  })
  fireEvent.submit(screen.getByTestId('shop-review-form'))

  expect(await screen.findByTestId('shop-review-saved')).toBeInTheDocument()

  // Two fields and no more: a shop has no aroma and no brew date, and sending either
  // would be inventing a contract the server did not agree to. The note is trimmed.
  expect(bodyOf('PUT', '/shops/u-kruka/review')).toEqual({
    score: 9,
    body: 'Worth the tram ride.',
  })

  // The detail refetched, and the page is showing what came back rather than what it
  // had. Both halves matter: the request, and the number on screen.
  await waitFor(() => expect(countOf('GET', '/shops/u-kruka')).toBe(2))
  expect(await screen.findByTestId('your-score')).toHaveTextContent('You rated 9')
  expect(screen.getByTestId('rating-average')).toHaveTextContent('8.5')
})

test('your own score for a shop is shown apart from the average, not folded into it', async () => {
  shopPage({
    'GET /shops/u-kruka': () =>
      json({
        ...krukaDetail,
        average_score: 8.2,
        review_count: 14,
        my_score: 9,
        my_review: myReview,
      }),
    'GET /shops/u-kruka/reviews': () => json(pageOf([myReview, graceReview])),
  })
  renderApp('/shops/u-kruka')

  const yours = await screen.findByTestId('your-score')
  expect(yours).toHaveTextContent('You rated 9')

  // The crowd's number is the crowd's number: 8.2 from 14 people, with your 9 nowhere
  // inside that block. Two facts, two places on the page.
  const average = screen.getByTestId('rating-average')
  expect(average).toHaveTextContent('8.2')
  expect(average).toHaveTextContent('from 14 reviews')
  expect(average).not.toHaveTextContent('You rated')
  expect(within(average).queryByTestId('your-score')).toBeNull()

  // Having one turns the form into an edit of it, pre-filled, with a way to remove it.
  expect(screen.getByLabelText('Your score')).toHaveValue('7')
  expect(screen.getByRole('button', { name: 'Save changes to your review' })).toBeInTheDocument()
  expect(screen.getByTestId('delete-shop-review')).toBeInTheDocument()
})

test('a shop nobody has rated invites a first rating rather than reading zero', async () => {
  shopPage({ 'GET /shops/u-kruka/reviews': () => json(pageOf([])) })
  renderApp('/shops/u-kruka')

  const empty = await screen.findByTestId('rating-empty')
  expect(empty).toHaveTextContent('Nobody has rated this shop yet')
  expect(screen.queryByTestId('rating-average')).toBeNull()
  // Nowhere on the panel does an unrated shop read as a shop that scored zero.
  expect(screen.getByTestId('rating-summary')).not.toHaveTextContent('0.0')
  expect(await screen.findByTestId('review-list-empty')).toHaveTextContent(
    'No reviews written yet',
  )
})

test('a signed-out visitor reads a shop’s reviews and is offered a sign-in, not a form', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops/u-kruka': () => json({ ...krukaDetail, average_score: 8.2, review_count: 14 }),
    'GET /shops/u-kruka/listings': () => json(pageOf([])),
    'GET /shops/u-kruka/reviews': () => json(pageOf([graceReview])),
  })
  renderApp('/shops/u-kruka')

  // The reviews themselves are public and fully readable.
  const list = await screen.findByTestId('review-list')
  expect(within(list).getByText('Grace Hopper')).toBeInTheDocument()
  expect(within(list).getByText(/four hundred tins/i)).toBeInTheDocument()
  expect(screen.getByTestId('rating-average')).toHaveTextContent('8.2')
  // The shared row renders a shop review without inventing the tea-only half of one.
  expect(screen.queryByTestId(`review-subscores-${graceReview.id}`)).toBeNull()

  // The form is absent, not disabled, and there is a way in.
  expect(screen.queryByTestId('shop-review-form')).toBeNull()
  expect(screen.queryByLabelText('Your score')).toBeNull()
  expect(screen.queryByTestId('your-score')).toBeNull()
  const prompt = screen.getByTestId('shop-review-signed-out')
  // Scoped: the nav carries a "Sign in" of its own, and the one that matters here is
  // the one sitting where the form would have been.
  expect(within(prompt).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
})

test('a shop’s star is on its page for a member and absent for a stranger', async () => {
  shopPage({ 'PUT /shops/u-kruka/favourite': () => new Response(null, { status: 204 }) })
  renderApp('/shops/u-kruka')

  const star = await screen.findByTestId('favourite-shop-u-kruka')
  expect(star).toHaveAttribute('aria-pressed', 'false')
  expect(star).toHaveAccessibleName('Add Herbaciarnia u Kruka to your favourites')

  fireEvent.click(star)
  await waitFor(() =>
    expect(screen.getByTestId('favourite-shop-u-kruka')).toHaveAttribute('aria-pressed', 'true'),
  )

  cleanup()
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops/u-kruka': () => json(krukaDetail),
    'GET /shops/u-kruka/listings': () => json(pageOf([])),
    'GET /shops/u-kruka/reviews': () => json(pageOf([])),
  })
  renderApp('/shops/u-kruka')

  await screen.findByRole('heading', { level: 1, name: 'Herbaciarnia u Kruka' })
  expect(screen.queryByTestId('favourite-shop-u-kruka')).toBeNull()
})

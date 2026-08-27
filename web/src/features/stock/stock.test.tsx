import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page, TeaSummary } from '../../lib/catalog'
import type {
  HouseholdDetail,
  StockEvent,
  StockItem,
  StockItemDetail,
} from '../../lib/household'
import type { ListingWithShop, ShopSummary } from '../../lib/shop'
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

const household: HouseholdDetail = {
  id: 'hh-1',
  name: 'Home',
  // M6 widened the household schemas with a picture.
  image_url: null,
  role: 'owner',
  member_count: 1,
  stock_item_count: 2,
  low_stock_count: 1,
  created_at: '2026-03-01T08:00:00Z',
  members: [
    {
      user: { id: ada.id, display_name: ada.display_name, email: ada.email, avatar_url: null },
      role: 'owner',
      joined_at: '2026-03-01T08:00:00Z',
    },
  ],
}

const sencha: StockItem = {
  id: 'item-1',
  tea: { id: 'tea-1', slug: 'sencha', name: 'Sencha', tea_type: 'green', image_url: null },
  quantity_grams: 120,
  low_stock_grams: 20,
  is_low: false,
  location: 'kitchen shelf',
  opened_at: '2026-08-01',
  best_before: '2027-03-01',
  updated_at: '2026-08-20T07:00:00Z',
  // M6: a tin bought through a shop's listing remembers which shop.
  shop: { id: 'shop-1', slug: 'u-kruka', name: 'Herbaciarnia u Kruka' },
}

const lastOolong: StockItem = {
  id: 'item-2',
  tea: { id: 'tea-2', slug: 'dan-cong', name: 'Dan Cong', tea_type: 'oolong', image_url: null },
  quantity_grams: 6,
  low_stock_grams: 20,
  is_low: true,
  location: null,
  opened_at: null,
  best_before: null,
  updated_at: '2026-08-24T07:00:00Z',
  // And a tin typed in by hand does not. Null is the ordinary case, not a gap.
  shop: null,
}

const brewEvent: StockEvent = {
  id: 'ev-1',
  kind: 'brew',
  delta_grams: -5,
  note: 'morning pot',
  occurred_at: '2026-08-25T07:10:00Z',
  actor: { id: ada.id, display_name: ada.display_name },
}

const senchaDetail: StockItemDetail = {
  ...sencha,
  notes: 'From the good shop on the corner.',
  purchased_at: '2026-07-20',
  price_paid_minor: 1250,
  currency: 'GBP',
  recent_events: [brewEvent],
}

const senchaTea: TeaSummary = {
  id: 'tea-1',
  slug: 'sencha',
  name: 'Sencha',
  tea_type: 'green',
  caffeine_level: 'medium',
  image_url: null,
  brand: null,
  is_approved: true,
  primary_ingredients: ['Green tea'],
  average_score: null,
  review_count: 0,
  my_score: null,
  is_favourite: false,
}

/** M8: the tin form gained an optional shop, so this suite needs something for its
 *  picker to find. */
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
  is_favourite: false,
  average_score: null,
  review_count: 0,
  my_score: null,
}

/** A second shop, so "Sold at" is a list rather than a row that could be anything. */
const postal: ShopSummary = {
  ...kruka,
  id: 'shop-2',
  slug: 'postal-tea',
  name: 'Postal Tea',
  city: null,
  country: 'United Kingdom',
  listing_count: 1,
}

/**
 * The tin form's shop shortlist is the catalog's own "where to buy" answer, so the suite
 * needs listings and not only shops.
 *
 * These two are the two cases that matter, and they are different cases. Kruka publishes
 * a pack size *and* a price, which is the whole prefill; Postal publishes a pack size and
 * no price at all, which is common, is not an error, and is what stops the form's
 * disclosure springing open on every tap.
 */
const krukaSencha: ListingWithShop = {
  id: 'listing-1',
  tea: sencha.tea,
  pack_grams: 50,
  price_minor: 450,
  currency: 'PLN',
  product_url: null,
  is_available: true,
  shop: kruka,
}

const postalSencha: ListingWithShop = {
  id: 'listing-2',
  tea: sencha.tea,
  pack_grams: 100,
  price_minor: null,
  currency: null,
  product_url: null,
  is_available: true,
  shop: postal,
}

/** A second tea and a listing for it, so "these are the shops for *this* tea" is a claim
 *  that can be caught being wrong. */
const danCongTea: TeaSummary = {
  ...senchaTea,
  id: 'tea-2',
  slug: 'dan-cong',
  name: 'Dan Cong',
  tea_type: 'oolong',
}

const postalDanCong: ListingWithShop = {
  id: 'listing-3',
  tea: lastOolong.tea,
  pack_grams: 25,
  price_minor: 1800,
  currency: 'PLN',
  product_url: null,
  is_available: true,
  shop: postal,
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

const stockRequests = () =>
  calls.filter((call) => call.method === 'GET' && call.path === '/households/hh-1/stock')

const lastStockRequest = () => stockRequests().at(-1)?.search ?? ''

const bodyOf = (method: string, path: string): unknown => {
  const call = calls.find((entry) => entry.method === method && entry.path === path)
  return JSON.parse(call?.body ?? 'null')
}

let currentPath = ''

function LocationSpy() {
  const location = useLocation()
  useEffect(() => {
    currentPath = `${location.pathname}${location.search}`
  }, [location])
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

/** Signed in, in a household of one, with two tins on the shelf. */
function shelf(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /households': () => json([household]),
    'GET /households/hh-1': () => json(household),
    'GET /households/hh-1/invites': () => json([]),
    'GET /households/hh-1/stock': () => json(pageOf([sencha, lastOolong])),
    // The add-tin form asks two questions of the shop half of the API the moment it is
    // opened — "which shops are there" and, once a tea is picked, "which of them sell
    // this" — so both are answered here rather than in every test that happens to open
    // it. Empty by default: a test that wants a shortlist says so.
    'GET /shops': () => json(pageOf([kruka], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () => json(pageOf([], { size: 6 })),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('the shelf shows what is left, where it lives, and flags what is running low', async () => {
  shelf()
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(screen.getAllByTestId('stock-tin')).toHaveLength(2)

  expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('120 g')
  expect(screen.getByTestId('stock-count')).toHaveTextContent('2 tins')

  const tins = screen.getAllByTestId('stock-tin')
  expect(within(tins[0]).getByText(/kitchen shelf/)).toBeInTheDocument()

  // Low stock is a badge and a colour, not a colour alone.
  expect(screen.getByTestId('tin-low-item-2')).toHaveTextContent('Running low')
  expect(screen.queryByTestId('tin-low-item-1')).toBeNull()

  // M6: a tin bought through a shop's listing says where it came from, and one typed in
  // by hand says nothing rather than an em dash.
  expect(screen.getByTestId('tin-shop-item-1')).toHaveTextContent('from Herbaciarnia u Kruka')
  expect(screen.queryByTestId('tin-shop-item-2')).toBeNull()
})

test('one tap brews 5 g: it posts a brew event and the number moves', async () => {
  // A stateful shelf, so the refetch after the mutation can disagree with the optimistic
  // guess if we got it wrong. A fixture frozen at 120 g would pass either way.
  let remaining = 120
  shelf({
    'GET /households/hh-1/stock': () => json(pageOf([{ ...sencha, quantity_grams: remaining }, lastOolong])),
    'POST /households/hh-1/stock/item-1/events': ({ init }) => {
      const { grams } = JSON.parse(String(init?.body)) as { grams: number }
      remaining -= grams
      return json({ ...senchaDetail, quantity_grams: remaining })
    },
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('120 g')

  fireEvent.click(screen.getByTestId('brew-item-1-5'))

  // No form, no dialog, no page change — one tap and the shelf reads 5 g lighter.
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('115 g'))
  expect(bodyOf('POST', '/households/hh-1/stock/item-1/events')).toEqual({
    kind: 'brew',
    grams: 5,
  })
  expect(currentPath).toBe('/households/hh-1')
})

test('the number moves before the server answers, and settles on what it says', async () => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  shelf({
    'POST /households/hh-1/stock/item-1/events': () =>
      held.then(() => json({ ...senchaDetail, quantity_grams: 118 })),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('brew-item-1-2'))

  // The optimism, asserted while the request is still in flight. This is the whole
  // feature: 120 − 2 shows up without waiting for a round trip.
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('118 g'))

  release()
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('118 g'))
})

test('a 409 on brew shows the server’s message and puts the grams back', async () => {
  /**
   * Both round trips are held open, and that is what gives this test teeth.
   *
   * The refetch that follows a failed mutation would restore 6 g all by itself, so a
   * version of this test that simply waited for "6 g" would pass with no rollback code at
   * all. Holding the refetch means the only thing that can have put the number back while
   * it is still in flight is the rollback.
   */
  let releasePost = () => {}
  const postHeld = new Promise<void>((resolve) => {
    releasePost = resolve
  })
  let releaseRefetch = () => {}
  const refetchHeld = new Promise<void>((resolve) => {
    releaseRefetch = resolve
  })
  let stockCalls = 0

  shelf({
    'GET /households/hh-1/stock': () => {
      stockCalls += 1
      if (stockCalls === 1) return json(pageOf([sencha, lastOolong]))
      return refetchHeld.then(() => json(pageOf([sencha, lastOolong])))
    },
    // The tin holds 6 g; brewing 8 g of it cannot work, and the server says what is left.
    'POST /households/hh-1/stock/item-2/events': () =>
      postHeld.then(() => json({ detail: 'Only 6 g of Dan Cong left — you asked to brew 8 g.' }, 409)),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(screen.getByTestId('tin-grams-item-2')).toHaveTextContent('6 g')

  fireEvent.click(screen.getByTestId('brew-item-2-8'))

  // Optimism first, and it has to be visible or "it went back to 6 g" proves nothing:
  // 6 − 8 is clamped at zero rather than shown as −2 g.
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-2')).toHaveTextContent('0 g'))

  releasePost()

  expect(await screen.findByTestId('tin-error-item-2')).toHaveTextContent(
    'Only 6 g of Dan Cong left — you asked to brew 8 g.',
  )
  // Back to exactly what it was, while the refetch that would also have fixed it is still
  // hanging. This is the rollback and nothing else.
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-2')).toHaveTextContent('6 g'))
  expect(stockCalls).toBe(2)

  // And the refusal is attached to that tin, not smeared across the shelf.
  expect(screen.queryByTestId('tin-error-item-1')).toBeNull()
  expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('120 g')

  releaseRefetch()
  await waitFor(() => expect(screen.getByTestId('tin-grams-item-2')).toHaveTextContent('6 g'))
})

test('the custom amount brews what was typed', async () => {
  let remaining = 120
  shelf({
    'GET /households/hh-1/stock': () => json(pageOf([{ ...sencha, quantity_grams: remaining }, lastOolong])),
    'POST /households/hh-1/stock/item-1/events': ({ init }) => {
      const { grams } = JSON.parse(String(init?.body)) as { grams: number }
      remaining -= grams
      return json({ ...senchaDetail, quantity_grams: remaining })
    },
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.change(screen.getByLabelText('Custom amount for Sencha'), { target: { value: '3.5' } })
  fireEvent.click(screen.getByTestId('brew-custom-submit-item-1'))

  await waitFor(() => expect(screen.getByTestId('tin-grams-item-1')).toHaveTextContent('116.5 g'))
  expect(bodyOf('POST', '/households/hh-1/stock/item-1/events')).toEqual({
    kind: 'brew',
    grams: 3.5,
  })
})

test('a brew refreshes the household summary, because the low-stock count moves', async () => {
  let detailCalls = 0
  shelf({
    'GET /households/hh-1': () => {
      detailCalls += 1
      return json(household)
    },
    'POST /households/hh-1/stock/item-1/events': () => json({ ...senchaDetail, quantity_grams: 115 }),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(detailCalls).toBe(1)

  fireEvent.click(screen.getByTestId('brew-item-1-5'))

  // Without the household invalidation, "2 tins running low" on /households sits stale
  // until a manual reload.
  await waitFor(() => expect(detailCalls).toBeGreaterThan(1))
})

test('the ?low=1 filter round-trips through the URL', async () => {
  shelf()
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(lastStockRequest()).toBe('?page=1&size=20')
  expect(screen.getByTestId('low-filter')).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(screen.getByTestId('low-filter'))

  // Half one: the tap is written to the address bar, and the request follows it.
  await waitFor(() => expect(currentPath).toBe('/households/hh-1?low=1'))
  await waitFor(() => expect(lastStockRequest()).toContain('low_only=true'))

  // Half two: that link, opened cold, reproduces both the request and the pressed
  // control. This is the half that fails if the state lives in useState and the URL is
  // only written to — which is what makes "here's what we're out of" shareable.
  cleanup()
  shelf({ 'GET /households/hh-1/stock': () => json(pageOf([lastOolong])) })
  renderApp('/households/hh-1?low=1')

  await screen.findByTestId('stock-list')
  expect(lastStockRequest()).toContain('low_only=true')
  expect(screen.getByTestId('low-filter')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByTestId('stock-tin')).toHaveLength(1)
})

test('searching the shelf debounces into one request and lands in the URL', async () => {
  shelf()
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  expect(stockRequests()).toHaveLength(1)

  const box = screen.getByLabelText('Search the shelf')
  fireEvent.change(box, { target: { value: 's' } })
  fireEvent.change(box, { target: { value: 'se' } })
  fireEvent.change(box, { target: { value: 'sen' } })

  // Three keystrokes, no request yet, and the box stayed responsive throughout.
  expect(stockRequests()).toHaveLength(1)
  expect(box).toHaveValue('sen')

  await waitFor(() => expect(stockRequests()).toHaveLength(2))
  expect(lastStockRequest()).toContain('q=sen')
  expect(currentPath).toBe('/households/hh-1?q=sen')
})

test('“nothing is running low” is a different sentence from “the shelf is empty”', async () => {
  shelf({ 'GET /households/hh-1/stock': () => json(pageOf([])) })
  renderApp('/households/hh-1')

  expect(await screen.findByTestId('stock-empty')).toHaveTextContent('The shelf is empty')
  expect(screen.queryByTestId('stock-no-results')).toBeNull()

  cleanup()
  shelf({ 'GET /households/hh-1/stock': () => json(pageOf([])) })
  renderApp('/households/hh-1?low=1')

  const none = await screen.findByTestId('stock-no-results')
  expect(none).toHaveTextContent('Nothing is running low — which is the answer you wanted.')
  expect(screen.queryByTestId('stock-empty')).toBeNull()
})

test('adding a tin searches the catalog rather than loading all of it', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'POST /households/hh-1/stock': () => json(senchaDetail, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))

  // A search box and a short result list — never a <select> of the whole catalog.
  await screen.findByTestId('tea-picker-results')
  expect(calls.find((call) => call.path === '/catalog/teas')?.search).toContain('size=8')
  expect(screen.queryByLabelText('Tea')).toBeNull()

  fireEvent.click(screen.getByTestId('tea-result-tea-1'))
  expect(screen.getByTestId('tea-picked')).toHaveTextContent('Sencha')

  fireEvent.change(screen.getByLabelText('How much is in it?'), { target: { value: '80' } })
  fireEvent.submit(screen.getByTestId('add-tin-form'))

  expect(await screen.findByTestId('stock-notice')).toHaveTextContent('Added “Sencha” to the shelf.')
  // Only what was filled in — no `location: ''` for the server to interpret.
  expect(bodyOf('POST', '/households/hh-1/stock')).toEqual({ tea_id: 'tea-1', quantity_grams: 80 })
})

test('the tea search debounces, and refuses to submit without a tea', async () => {
  shelf({ 'GET /catalog/teas': () => json(pageOf([senchaTea])) })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  await screen.findByTestId('tea-picker-results')

  const catalogCalls = () => calls.filter((call) => call.path === '/catalog/teas').length
  expect(catalogCalls()).toBe(1)

  const box = screen.getByLabelText('Which tea?')
  fireEvent.change(box, { target: { value: 'd' } })
  fireEvent.change(box, { target: { value: 'da' } })
  expect(catalogCalls()).toBe(1)
  await waitFor(() => expect(catalogCalls()).toBe(2))

  // Nothing picked, so nothing is posted and the form says which fields are missing.
  fireEvent.submit(screen.getByTestId('add-tin-form'))
  expect(screen.getByTestId('add-tin-tea-search-error')).toHaveTextContent(
    'Pick which tea this tin holds.',
  )
  expect(screen.getByTestId('add-tin-quantity-error')).toHaveTextContent('How many grams are in it?')
  expect(calls.some((call) => call.method === 'POST' && call.path === '/households/hh-1/stock')).toBe(
    false,
  )
})

/* --------------------------------------------------------------- the tin detail page */

test('the tin page shows its history and the money, and links back to the shelf', async () => {
  shelf({ 'GET /households/hh-1/stock/item-1': () => json(senchaDetail) })
  renderApp('/households/hh-1/stock/item-1')

  expect(await screen.findByRole('heading', { level: 1, name: 'Sencha' })).toBeVisible()
  expect(screen.getByTestId('tin-quantity')).toHaveTextContent('120 g')

  const detail = screen.getByTestId('tin-detail')
  expect(detail).toHaveTextContent('kitchen shelf')
  expect(detail).toHaveTextContent('£12.50')

  const events = screen.getByTestId('tin-events')
  expect(within(events).getByText('Brewed')).toBeInTheDocument()
  // Signed, and signed the way the server sent it — the client never guesses a direction.
  expect(screen.getByTestId('event-delta-ev-1')).toHaveTextContent('−5 g')
  expect(events).toHaveTextContent('Ada Lovelace')
  expect(events).toHaveTextContent('morning pot')

  expect(screen.getByRole('link', { name: '← The shelf' })).toHaveAttribute(
    'href',
    '/households/hh-1',
  )
})

test('the recount posts an absolute total, not a difference', async () => {
  shelf({
    'GET /households/hh-1/stock/item-1': () => json(senchaDetail),
    'POST /households/hh-1/stock/item-1/adjust': () => json({ ...senchaDetail, quantity_grams: 42 }),
  })
  renderApp('/households/hh-1/stock/item-1')

  await screen.findByTestId('adjust-form')
  fireEvent.change(screen.getByLabelText('Actually there now'), { target: { value: '42' } })
  fireEvent.change(screen.getByLabelText('Note (optional)', { selector: '#adjust-note' }), {
    target: { value: 'weighed it' },
  })
  fireEvent.submit(screen.getByTestId('adjust-form'))

  expect(await screen.findByTestId('tin-notice')).toHaveTextContent('Recounted to 42 g.')
  expect(bodyOf('POST', '/households/hh-1/stock/item-1/adjust')).toEqual({
    quantity_grams: 42,
    note: 'weighed it',
  })
})

test('a discard bigger than the tin is refused with the server’s sentence', async () => {
  shelf({
    'GET /households/hh-1/stock/item-1': () => json(senchaDetail),
    'POST /households/hh-1/stock/item-1/events': () =>
      json({ detail: 'Only 120 g of Sencha left.' }, 409),
  })
  renderApp('/households/hh-1/stock/item-1')

  await screen.findByTestId('event-form')
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'discard' } })
  fireEvent.change(screen.getByLabelText('How much?'), { target: { value: '500' } })
  fireEvent.submit(screen.getByTestId('event-form'))

  expect(await screen.findByTestId('event-error')).toHaveTextContent('Only 120 g of Sencha left.')
  expect(bodyOf('POST', '/households/hh-1/stock/item-1/events')).toEqual({
    kind: 'discard',
    grams: 500,
  })
  // Unchanged: the tin still reads what it read.
  expect(screen.getByTestId('tin-quantity')).toHaveTextContent('120 g')
})

test('the metadata form patches only what changed, and cannot touch the quantity', async () => {
  shelf({
    'GET /households/hh-1/stock/item-1': () => json(senchaDetail),
    'PATCH /households/hh-1/stock/item-1': () =>
      json({ ...senchaDetail, location: 'the good cupboard' }),
  })
  renderApp('/households/hh-1/stock/item-1')

  fireEvent.click(await screen.findByTestId('start-edit-tin'))
  fireEvent.change(screen.getByLabelText('Where is it kept?'), {
    target: { value: 'the good cupboard' },
  })
  fireEvent.submit(screen.getByTestId('edit-tin-form'))

  await waitFor(() =>
    expect(calls.some((call) => call.method === 'PATCH')).toBe(true),
  )
  // Location changed; the four untouched fields are absent rather than resent, and there
  // is no quantity_grams at all — grams only move through an event.
  expect(bodyOf('PATCH', '/households/hh-1/stock/item-1')).toEqual({
    location: 'the good cupboard',
  })
  expect(screen.queryByLabelText('How much is in it?')).toBeNull()
})

test('a 404 on a tin reads as “not found or not yours”, with no retry', async () => {
  shelf({
    'GET /households/hh-1/stock/item-9': () => json({ detail: 'Stock item not found' }, 404),
  })
  renderApp('/households/hh-1/stock/item-9')

  const missing = await screen.findByTestId('tin-missing')
  expect(missing).toHaveTextContent('Not found, or not yours')
  expect(screen.queryByTestId('tin-error')).toBeNull()
  expect(screen.queryByTestId('adjust-form')).toBeNull()
})

test('the tin form sends the shop when one is picked, and no key at all when not', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /shops': () => json(pageOf([kruka], { size: 8 })),
    'POST /households/hh-1/stock': () => json({ ...senchaDetail, shop: kruka }, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))
  fireEvent.change(screen.getByLabelText('How much is in it?'), { target: { value: '80' } })

  // A search box and a short result list — never a <select> of every shop there is.
  await screen.findByTestId('shop-picker-results')
  expect(calls.find((call) => call.path === '/shops')?.search).toContain('size=8')

  fireEvent.click(screen.getByTestId('shop-result-shop-1'))
  expect(screen.getByTestId('shop-picked')).toHaveTextContent('Herbaciarnia u Kruka')

  fireEvent.submit(screen.getByTestId('add-tin-form'))

  await screen.findByTestId('stock-notice')
  // A search result is a shop and nothing more — no listing, so nothing was prefilled and
  // the 80 g typed above is exactly what gets posted.
  expect(bodyOf('POST', '/households/hh-1/stock')).toEqual({
    tea_id: 'tea-1',
    quantity_grams: 80,
    shop_id: 'shop-1',
  })

  // The other half: a tin nobody said anything about sends no `shop_id` at all rather
  // than a null, which is a different statement for the server to store.
  cleanup()
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /shops': () => json(pageOf([kruka], { size: 8 })),
    'POST /households/hh-1/stock': () => json(senchaDetail, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))
  fireEvent.change(screen.getByLabelText('How much is in it?'), { target: { value: '80' } })
  // Looked at and left alone — the picker is on screen throughout — so this is "I did not
  // say" rather than "I was never asked".
  await screen.findByTestId('shop-picker-results')
  fireEvent.submit(screen.getByTestId('add-tin-form'))

  await screen.findByTestId('stock-notice')
  const body = bodyOf('POST', '/households/hh-1/stock') as Record<string, unknown>
  expect('shop_id' in body).toBe(false)
  expect(body).toEqual({ tea_id: 'tea-1', quantity_grams: 80 })
})

/* ------------------------------------------ where the tin came from, on the way in */

test('the shop is a question the form asks, not one hidden behind “More details”', async () => {
  shelf({ 'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })) })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))

  // The complaint this answers: in a household a tea comes from the shop, so the form
  // asks where it came from without anybody having to go looking for the question.
  expect(screen.getByLabelText('Where did it come from?')).toBeInTheDocument()
  expect(screen.queryByTestId('add-tin-details')).toBeNull()

  // Expected, not demanded: the hint says what a blank means instead of nagging.
  expect(screen.getByText(/Leave it blank for a gift/)).toBeInTheDocument()
})

test('picking a tea puts the shops that sell it one tap away, above the search box', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () =>
      json(pageOf([krukaSencha, postalSencha], { size: 6 })),
    'POST /households/hh-1/stock': () => json({ ...senchaDetail, shop: kruka }, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))

  // Nothing to be sold at until there is something to sell, and no request for it either.
  expect(screen.queryByTestId('shop-picker-sold-at')).toBeNull()
  expect(calls.some((call) => call.path === '/catalog/teas/sencha/shops')).toBe(false)

  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))

  const sold = await screen.findByTestId('shop-picker-sold-at')
  expect(sold).toHaveTextContent('Sold at')
  expect(sold).toHaveTextContent('Herbaciarnia u Kruka')
  expect(sold).toHaveTextContent('Postal Tea')
  // Each row says which pack and what it costs, so the shortlist answers "which one?"
  // and not merely "who?".
  expect(within(sold).getByTestId('shop-listing-listing-1')).toHaveTextContent('50 g')
  expect(within(sold).getByTestId('shop-listing-listing-1')).toHaveTextContent('4.50')
  expect(calls.find((call) => call.path === '/catalog/teas/sencha/shops')?.search).toContain(
    'size=6',
  )

  // And the search box is still underneath it, now narrowed to "somewhere else". Our
  // catalog knowing two shops that sell this is not the same as it knowing the one this
  // particular tin came from.
  expect(screen.getByLabelText('Somewhere else')).toBeInTheDocument()
  // The question is asked once, above both answers to it, rather than by the field —
  // otherwise "Sold at" announces itself before anything has asked where the tin is from.
  const form = screen.getByTestId('add-tin-form')
  expect(within(form).getByText('Where did it come from?')).toBeInTheDocument()
  const order = within(form).getAllByText(/Where did it come from\?|Sold at|Somewhere else/)
  expect(order.map((node) => node.textContent)).toEqual([
    'Where did it come from?',
    'Sold at',
    'Somewhere else',
  ])

  fireEvent.click(screen.getByTestId('shop-listing-listing-1'))
  expect(screen.getByTestId('shop-picked')).toHaveTextContent('Herbaciarnia u Kruka')

  fireEvent.submit(screen.getByTestId('add-tin-form'))
  await screen.findByTestId('stock-notice')
  expect(bodyOf('POST', '/households/hh-1/stock')).toMatchObject({ shop_id: 'shop-1' })
})

test('a tapped listing fills the empty fields with what the shop published', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () => json(pageOf([krukaSencha], { size: 6 })),
    'POST /households/hh-1/stock': () => json({ ...senchaDetail, shop: kruka }, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))
  fireEvent.click(await screen.findByTestId('shop-listing-listing-1'))

  // The pack size is a field you are already looking at, so it simply fills in.
  expect(screen.getByLabelText('How much is in it?')).toHaveValue(50)

  // The price and the currency are not: they live behind "More details". A number
  // attached to your tin that you cannot see is a number you cannot correct, and this one
  // is a claim about money copied off a shelf edge rather than off your receipt — so the
  // drawer it landed in opens itself rather than keeping the secret.
  expect(screen.getByTestId('add-tin-details')).toBeInTheDocument()
  expect(screen.getByLabelText('Price paid')).toHaveValue('4.50')
  expect(screen.getByLabelText('Currency')).toHaveValue('PLN')

  fireEvent.submit(screen.getByTestId('add-tin-form'))
  await screen.findByTestId('stock-notice')
  // 4.50 goes back over the wire as 450 minor units, the way every other price does.
  expect(bodyOf('POST', '/households/hh-1/stock')).toEqual({
    tea_id: 'tea-1',
    quantity_grams: 50,
    price_paid_minor: 450,
    currency: 'PLN',
    shop_id: 'shop-1',
  })
})

test('a listing fills the blanks and overwrites nothing that was already answered', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () => json(pageOf([krukaSencha], { size: 6 })),
    'POST /households/hh-1/stock': () => json({ ...senchaDetail, shop: kruka }, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))

  // Answered before the shop was tapped, and both answers disagree with the listing on
  // purpose: 80 g because it was decanted into a jar, 9.99 because that is what the
  // receipt says. The shop's 50 g at 4.50 is what it advertises, not what happened.
  fireEvent.change(screen.getByLabelText('How much is in it?'), { target: { value: '80' } })
  fireEvent.click(screen.getByTestId('toggle-tin-details'))
  fireEvent.change(screen.getByLabelText('Price paid'), { target: { value: '9.99' } })

  fireEvent.click(await screen.findByTestId('shop-listing-listing-1'))

  expect(screen.getByLabelText('How much is in it?')).toHaveValue(80)
  expect(screen.getByLabelText('Price paid')).toHaveValue('9.99')
  // The one field nobody had answered is the one field that gets filled.
  expect(screen.getByLabelText('Currency')).toHaveValue('PLN')

  fireEvent.submit(screen.getByTestId('add-tin-form'))
  await screen.findByTestId('stock-notice')
  expect(bodyOf('POST', '/households/hh-1/stock')).toEqual({
    tea_id: 'tea-1',
    quantity_grams: 80,
    price_paid_minor: 999,
    currency: 'PLN',
    shop_id: 'shop-1',
  })
})

test('a listing with no published price leaves the disclosure shut', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () => json(pageOf([postalSencha], { size: 6 })),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))

  const row = await screen.findByTestId('shop-listing-listing-2')
  expect(row).toHaveTextContent('100 g')
  // A shop that has not published a price says nothing, rather than "0.00" — which reads
  // as free, which is a different and wrong claim.
  expect(row).not.toHaveTextContent('0.00')

  fireEvent.click(row)

  expect(screen.getByLabelText('How much is in it?')).toHaveValue(100)
  // The disclosure opens for a prefill nobody could otherwise see. This tap prefilled
  // nothing hidden, so there is nothing hidden to show, so it stays where it was: the
  // rule is "never fill in a field behind a door without opening the door", not "open the
  // door on every tap".
  expect(screen.queryByTestId('add-tin-details')).toBeNull()
})

test('with no tea picked there is no shortlist, and the search box still finds a shop', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea], { size: 8 })),
    'GET /shops': ({ url }) =>
      json(pageOf(url.searchParams.get('q') === 'kru' ? [kruka] : [], { size: 8 })),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))

  // No tea, so nothing is known to be sold anywhere — and an empty box headed "Sold at"
  // would be asserting that nobody sells it, which is not what "we did not ask" means.
  await screen.findByTestId('shop-picker-empty')
  expect(screen.queryByTestId('shop-picker-sold-at')).toBeNull()
  expect(calls.some((call) => call.path === '/catalog/teas/sencha/shops')).toBe(false)

  // The search is the fallback that has to keep working, because it is the only way to
  // name a shop our catalog has never heard sell this tea.
  fireEvent.change(screen.getByLabelText('Where did it come from?'), { target: { value: 'kru' } })
  fireEvent.click(await screen.findByTestId('shop-result-shop-1'))
  expect(screen.getByTestId('shop-picked')).toHaveTextContent('Herbaciarnia u Kruka')
})

test('changing the tea drops the old tea’s shops instead of leaving them one tap away', async () => {
  shelf({
    'GET /catalog/teas': () => json(pageOf([senchaTea, danCongTea], { size: 8 })),
    'GET /catalog/teas/sencha/shops': () => json(pageOf([krukaSencha], { size: 6 })),
    'GET /catalog/teas/dan-cong/shops': () => json(pageOf([postalDanCong], { size: 6 })),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('stock-list')
  fireEvent.click(screen.getByTestId('toggle-add-tin'))
  fireEvent.click(await screen.findByTestId('tea-result-tea-1'))
  expect(await screen.findByTestId('shop-picker-sold-at')).toHaveTextContent('Herbaciarnia u Kruka')

  // Wrong tin. Clearing the tea clears the claim about who sells it, immediately…
  fireEvent.click(screen.getByTestId('tea-picker-clear'))
  expect(screen.queryByTestId('shop-picker-sold-at')).toBeNull()

  // …and picking a different tea does not put the old answer back while the new one is in
  // flight. `useTeaShops` keeps previous data, which is right for the tea page it was
  // written for and would be wrong here: Kruka would sit under "Sold at" for a tea Kruka
  // does not stock, one tap from being recorded against it.
  fireEvent.click(screen.getByTestId('tea-result-tea-2'))
  expect(screen.queryByTestId('shop-picker-sold-at')).toBeNull()

  const sold = await screen.findByTestId('shop-picker-sold-at')
  expect(sold).toHaveTextContent('Postal Tea')
  expect(sold).not.toHaveTextContent('Herbaciarnia u Kruka')
})

test('a tin that came from a shop says where, on the tin’s own page', async () => {
  shelf({ 'GET /households/hh-1/stock/item-1': () => json(senchaDetail) })
  renderApp('/households/hh-1/stock/item-1')

  const where = await screen.findByTestId('tin-shop')
  expect(where).toHaveTextContent('Bought at')
  // A link, because "buy another one" is the reason anybody looks at where a tin came from.
  expect(within(where).getByRole('link', { name: 'Herbaciarnia u Kruka' })).toHaveAttribute(
    'href',
    '/shops/u-kruka',
  )
})

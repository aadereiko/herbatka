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

const household: HouseholdDetail = {
  id: 'hh-1',
  name: 'Home',
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import { ThemeProvider } from '../../components/ui/theme'
import type { Session, User } from '../../lib/api'
import type { HouseholdConsumption, HouseholdDetail, StockPace } from '../../lib/household'
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
  status: null,
  city: null,
  country: null,
  favourite_tea_type: null,
  created_at: '2026-01-01T09:00:00Z',
}

const session: Session = { access_token: 'a', token_type: 'bearer', expires_in: 900, user: ada }

const household: HouseholdDetail = {
  id: 'hh-1',
  name: 'Flat 3B',
  image_url: null,
  role: 'owner',
  member_count: 2,
  stock_item_count: 2,
  low_stock_count: 0,
  created_at: '2026-03-01T08:00:00Z',
  members: [],
}

const senchaRef = {
  id: 'tea-1',
  slug: 'sencha',
  name: 'Sencha',
  tea_type: 'green' as const,
  image_url: null,
}
const hojichaRef = {
  id: 'tea-2',
  slug: 'hojicha',
  name: 'Hojicha',
  tea_type: 'green' as const,
  image_url: null,
}

const pace: StockPace = {
  grams_per_week: 14,
  days_observed: 28,
  events_counted: 8,
  days_remaining: 5,
}

const summary: HouseholdConsumption = {
  window_days: 84,
  grams_out: 220,
  grams_per_week: 18.3,
  drinkers: [
    { user: { id: 'user-1', display_name: 'Ada Lovelace' }, grams: 140, brews: 28 },
    { user: null, grams: 40, brews: 8 },
  ],
  teas: [
    { tea: senchaRef, grams: 150, brews: 30 },
    { tea: hojichaRef, grams: 30, brews: 6 },
  ],
  running_out: [
    {
      item: {
        id: 'item-1',
        tea: senchaRef,
        quantity_grams: 10,
        low_stock_grams: 20,
        is_low: true,
        location: null,
        opened_at: null,
        best_before: null,
        updated_at: '2026-08-20T09:00:00Z',
        shop: null,
      },
      pace,
    },
  ],
}

/* ---------------------------------------------------------------------- harness */

type Handler = () => Response

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function mockFetch(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(raw, 'http://localhost').pathname.replace('/api/v1', '')
    const method = (init?.method ?? 'GET').toUpperCase()
    const handler = handlers[`${method} ${path}`]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${method} ${path}`))
    return Promise.resolve(handler())
  })
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

const shelf = (consumption: HouseholdConsumption) =>
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /households/hh-1': () => json(household),
    'GET /households/hh-1/consumption': () => json(consumption),
  })

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
  cleanup()
})

/* ------------------------------------------------------------------------ tests */

test('the shelf reports what it gets through, and over how long', async () => {
  shelf(summary)
  renderAt('/households/hh-1/consumption')

  const headline = await screen.findByTestId('consumption-headline')
  expect(headline).toHaveTextContent('18.3 g a week')
  // The window is stated in the same breath as the rate. "18 g a week" measured over
  // twelve weeks and over one are different claims.
  expect(headline).toHaveTextContent('220 g left the shelf over 12 weeks')
})

test('who drinks what is ranked, and an unnamed drinker is not invented', async () => {
  shelf(summary)
  renderAt('/households/hh-1/consumption')

  const drinkers = await screen.findByTestId('consumption-drinkers')
  const rows = within(drinkers).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Ada Lovelace')
  expect(rows[0]).toHaveTextContent('140 g · 28 cups')
  // `stock_event.user_id` is ON DELETE SET NULL, so a departed member's brews stay in the
  // ledger with nobody's name on them. "Somebody" is the honest word for that.
  expect(rows[1]).toHaveTextContent('Somebody')
})

test('the forecast names the tin and how long it has', async () => {
  shelf(summary)
  renderAt('/households/hh-1/consumption')

  const forecast = await screen.findByTestId('consumption-forecast')
  expect(forecast).toHaveTextContent('Sencha')
  expect(forecast).toHaveTextContent('about 5 days left')
  expect(forecast).toHaveTextContent('14 g a week')
})

test('a shelf nobody has drunk from says so instead of showing zeroes', async () => {
  shelf({ ...summary, grams_out: 0, grams_per_week: 0, drinkers: [], teas: [], running_out: [] })
  renderAt('/households/hh-1/consumption')

  expect(await screen.findByTestId('consumption-empty')).toBeInTheDocument()
  // A row of 0 g figures would read as a household that has stopped drinking tea, rather
  // than as one that has not recorded any.
  expect(screen.queryByTestId('consumption-headline')).toBeNull()
})

test('tins without enough history are absent from the forecast, and it explains why', async () => {
  shelf({ ...summary, running_out: [] })
  renderAt('/households/hh-1/consumption')

  const forecast = await screen.findByTestId('consumption-forecast')
  expect(forecast).toHaveTextContent(/enough recorded history/i)
})

/* --------------------------------------------------------------- shelf activity */

const brewEvent = {
  id: 'ev-1',
  kind: 'brew' as const,
  delta_grams: -6,
  note: 'first of the morning',
  occurred_at: '2026-08-28T07:10:00Z',
  actor: { id: 'user-1', display_name: 'Ada Lovelace' },
  tea: senchaRef,
  item_id: 'item-1',
}

const purchaseEvent = {
  ...brewEvent,
  id: 'ev-2',
  kind: 'purchase' as const,
  delta_grams: 100,
  note: null,
  occurred_at: '2026-08-20T12:00:00Z',
}

const shelfWith = (events: unknown[], total = events.length) =>
  mockFetch({
    'POST /auth/refresh': () => json(session),
    'GET /households/hh-1': () => json(household),
    'GET /households/hh-1/invites': () => json([]),
    'GET /households/hh-1/stock': () => json({ items: [], total: 0, page: 1, size: 24, pages: 1 }),
    'GET /households/hh-1/stock/activity': () =>
      json({ items: events, total, page: 1, size: 12, pages: 1 }),
  })

test('the shelf timeline names the tea on every row, which a tin’s own log need not', async () => {
  shelfWith([brewEvent, purchaseEvent])
  renderAt('/households/hh-1')

  const activity = await screen.findByTestId('household-activity')
  // `findAll`, not `getAll`: the panel renders immediately with a skeleton in it, so
  // `findByTestId` above resolves while the query is still in flight. Waiting on the
  // rows is waiting on the thing the test is actually about.
  const rows = await within(activity).findAllByRole('listitem')

  // "brewed −6 g" with no subject is unreadable on a shelf-wide timeline, which is why
  // the server sends `tea` on this shape and not on the per-tin one.
  expect(rows[0]).toHaveTextContent('Ada Lovelace')
  expect(rows[0]).toHaveTextContent('brewed')
  expect(rows[0]).toHaveTextContent('−6 g')
  expect(rows[0]).toHaveTextContent('Sencha')
  expect(rows[0]).toHaveTextContent('first of the morning')

  // Every kind is here: a timeline that hid the restocks could not explain where the tea
  // came from.
  expect(rows[1]).toHaveTextContent('bought')
  expect(rows[1]).toHaveTextContent('+100 g')
})

test('a shelf nothing has happened on says so, and offers no “show more”', async () => {
  shelfWith([], 0)
  renderAt('/households/hh-1')

  expect(await screen.findByTestId('household-activity-empty')).toBeInTheDocument()
  expect(screen.queryByTestId('household-activity-more')).toBeNull()
})

test('a longer history offers to grow rather than to page', async () => {
  // A shelf's history is read top-down as a story; a "next" button that replaces what you
  // just read is the wrong control. The stock *list* pages, because that is a lookup.
  shelfWith([brewEvent], 40)
  renderAt('/households/hh-1')

  expect(await screen.findByTestId('household-activity-more')).toBeInTheDocument()
})

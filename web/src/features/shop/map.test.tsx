import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { ShopDetail, ShopSummary } from '../../lib/shop'
import { clearAccessToken } from '../../lib/token'
import { AuthProvider } from '../auth/AuthProvider'
import type { NearPosition, PinnedShop } from './nearby'
import { NEAR_STORAGE_KEY } from './nearby'

/**
 * The map, "shops near me", and the admin's pin editor.
 *
 * Separate from `shop.test.tsx` because everything here needs three things that suite
 * does not: a `ShopMap` mock that *reports its props* rather than being inert, a
 * geolocation prompt that can be answered either way, and a `localStorage` that exists.
 */

/* ------------------------------------------------------------------- the map mock */

/**
 * jsdom has no layout and no canvas, so Leaflet cannot be instantiated in it — it
 * measures a container that is permanently 0×0 and gives up. Every Leaflet import in the
 * app is funnelled through `./ShopMap` precisely so that one mock covers all three maps.
 *
 * These stubs are not inert. Each one publishes what it was handed, because the
 * interesting questions here are exactly "which shops reached the map" and "was the
 * reader's own position handed to it" — questions a `<div />` cannot answer. The picker
 * grows a button so the one thing a real map does that nothing else can, telling the
 * form where somebody clicked, is reachable from a test.
 */
vi.mock('./ShopMap', () => ({
  ShopMap: ({ shops, you }: { shops: PinnedShop[]; you: NearPosition | null }) => (
    <div
      data-testid="shop-map"
      data-pins={shops.map((shop) => shop.slug).join(' ')}
      data-you={you ? `${you.lat},${you.lng}` : ''}
    />
  ),
  ShopPointMap: ({ latitude, longitude }: { latitude: number; longitude: number }) => (
    <div data-testid="shop-point-map" data-at={`${latitude},${longitude}`} />
  ),
  ShopPinPicker: ({
    latitude,
    longitude,
    onPick,
  }: {
    latitude: number | null
    longitude: number | null
    onPick: (position: NearPosition) => void
  }) => (
    <div data-testid="shop-pin-picker" data-at={`${latitude ?? ''},${longitude ?? ''}`}>
      <button
        type="button"
        data-testid="pin-picker-click"
        onClick={() => onPick({ lat: 51.1093, lng: 17.0386 })}
      >
        pretend to click Wrocław
      </button>
    </div>
  ),
}))

/* --------------------------------------------------------------------- fixtures */

const ada: User = {
  id: 'user-1',
  email: 'ada@herbatka.test',
  display_name: 'Ada Lovelace',
  role: 'user',
  avatar_url: null,
  created_at: '2026-01-01T09:00:00Z',
}

const grace: User = { ...ada, id: 'user-2', display_name: 'Grace Hopper', role: 'admin' }

function sessionFor(user: User): Session {
  return { access_token: 'access-1', token_type: 'bearer', expires_in: 900, user }
}

/** Pinned, in Kraków. */
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
  distance_km: null,
}

/** Pinned, in Warsaw — far enough away that a distance from Kraków is a different
 *  number, and in metres versus kilometres it is a different *sentence*. */
const czajnik: ShopSummary = {
  ...kruka,
  id: 'shop-2',
  slug: 'czajnik',
  name: 'Czajnik',
  city: 'Warszawa',
  website: null,
  listing_count: 0,
  latitude: 52.2297,
  longitude: 21.0122,
}

/** Online only, so there is nothing to draw. The whole point of this fixture is that it
 *  must not vanish quietly from a map view. */
const poczta: ShopSummary = {
  ...kruka,
  id: 'shop-3',
  slug: 'poczta-herbaty',
  name: 'Poczta Herbaty',
  city: null,
  website: null,
  listing_count: 1,
  latitude: null,
  longitude: null,
}

const krukaDetail: ShopDetail = {
  ...kruka,
  description: 'A room the size of a kitchen with four hundred tins in it.',
  address: 'ul. Sławkowska 12',
  created_at: '2026-04-01T09:00:00Z',
}

const pocztaDetail: ShopDetail = {
  ...poczta,
  description: 'A postal-only shop with no front door.',
  address: null,
  created_at: '2026-04-02T09:00:00Z',
}

/** What the server would answer for each shop, given a reader in central Kraków. Fixed
 *  rather than computed: the number the card prints has to come from the server, and a
 *  haversine in the test would only prove the test can do arithmetic. */
const DISTANCES: Record<string, number> = { 'shop-1': 0.42, 'shop-2': 2.4 }

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

/** The same `METHOD /path` router the other suites use: it records every call so a test
 *  can assert on how many requests happened, and an unregistered path rejects loudly
 *  rather than answering something plausible. */
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

const shopCalls = () => calls.filter((call) => call.path === '/shops')

const lastShopSearch = () => shopCalls().at(-1)?.search ?? ''

/**
 * The `/shops` the app actually talks to, in miniature.
 *
 * With a position it answers nearest-first, fills in `distance_km`, and — the part that
 * matters — drops every shop nobody has pinned, exactly as the real endpoint does.
 * Without one it answers the ordinary list with no distances at all. Answering
 * *differently* is what makes "the request carried the position" assertions bite: a page
 * that stopped sending `near_lat` would silently get the plain list back, and the
 * distances would disappear from the cards.
 */
function shopsHandler(all: ShopSummary[] = [kruka, czajnik, poczta]): Handler {
  return ({ url }) => {
    const lat = url.searchParams.get('near_lat')
    const lng = url.searchParams.get('near_lng')
    if (lat === null || lng === null) return json(pageOf(all))

    const near = all
      .filter((shop) => shop.latitude !== null && shop.longitude !== null)
      .map((shop) => ({ ...shop, distance_km: DISTANCES[shop.id] ?? 9.9 }))
      .sort((left, right) => (left.distance_km ?? 0) - (right.distance_km ?? 0))
    return json(pageOf(near))
  }
}

/** Signed out, browsing shops. Nothing on this page needs an account. */
function browsing(shops: ShopSummary[] = [kruka, czajnik, poczta]) {
  return mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops': shopsHandler(shops),
  })
}

/** Signed in as an admin, on the shop queue, with one listed shop to edit. */
function administering(overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /friends/requests': () => json([]),
    'GET /admin/shops': ({ url }) =>
      json(pageOf(url.searchParams.get('approved') === 'true' ? [kruka] : [])),
    'GET /shops/u-kruka': () => json(krukaDetail),
    'GET /shops/u-kruka/listings': () => json(pageOf([])),
    ...overrides,
  })
}

/** The address bar, on screen, so a test can read what the app put there. The URL *is*
 *  the state for both the view and the position, so most of this file asserts on it. */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="current-url">{`${location.pathname}${location.search}`}</span>
}

/** Decoded, because `writeShopFilters` hands `URLSearchParams` a `50.06,19.93` that
 *  comes back out as `50.06%2C19.93`, and asserting on the escape is asserting on
 *  `URLSearchParams` rather than on us. */
const currentUrl = () => decodeURIComponent(screen.getByTestId('current-url').textContent ?? '')

function renderApp(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

/* ------------------------------------------------------------------ storage stub */

/**
 * A `localStorage` that works, because this environment does not have one.
 *
 * Under Node 26 the `localStorage` global is Node's own experimental web storage, which
 * is `undefined` unless the process was started with `--localstorage-file`, and it
 * shadows the one jsdom would otherwise provide. Every read in `nearby.ts` is wrapped in
 * a try/catch, so without this stub the whole feature would quietly behave as though
 * nothing were ever remembered — and "a stored position is reused" would pass by
 * accident in one direction and be untestable in the other.
 *
 * The `Map` is handed back so tests can seed and inspect storage directly rather than
 * through the reader they are testing.
 */
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')

function installStorage(): Map<string, string> {
  const data = new Map<string, string>()
  const storage: Storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  return data
}

/** A private window, or "block all site data": reading the *accessor* throws, before
 *  `getItem` is ever reached. */
function breakStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
}

/* -------------------------------------------------------------- geolocation stub */

/** How many times the app asked the browser where we are. The count is the assertion
 *  that stops "a remembered position is reused" from passing on a page that asks for
 *  permission all over again and merely happens to end up in the same place. */
let permissionPrompts = 0

function grantPosition(position: NearPosition) {
  stubGeolocation((onSuccess) => {
    onSuccess({
      coords: {
        latitude: position.lat,
        longitude: position.lng,
        accuracy: 30,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition)
  })
}

/** `1` is `PERMISSION_DENIED`, `2` `POSITION_UNAVAILABLE`, `3` `TIMEOUT`. */
function refusePosition(code = 1) {
  stubGeolocation((_onSuccess, onError) => {
    onError?.({
      code,
      message: 'User denied Geolocation',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError)
  })
}

function stubGeolocation(answer: (onSuccess: PositionCallback, onError?: PositionErrorCallback) => void) {
  const geolocation: Geolocation = {
    getCurrentPosition: (onSuccess, onError) => {
      permissionPrompts += 1
      answer(onSuccess, onError ?? undefined)
    },
    watchPosition: () => 0,
    clearWatch: () => {},
  }
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation })
}

/* ----------------------------------------------------------------------- lifecycle */

let store: Map<string, string>

beforeEach(() => {
  store = installStorage()
  permissionPrompts = 0
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearAccessToken()
  Reflect.deleteProperty(navigator, 'geolocation')
  Reflect.deleteProperty(window, 'localStorage')
  if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage)
})

/* ------------------------------------------------------------------ shops near me */

test('sharing your location puts it in the URL, in storage, and on the request', async () => {
  browsing()
  grantPosition({ lat: 50.0647, lng: 19.945 })
  renderApp('/shops')

  await screen.findByTestId('shop-list')
  // Nothing was asked before the button was pressed: arriving at /shops must not throw a
  // permission prompt at somebody who only wanted to read a list.
  expect(permissionPrompts).toBe(0)
  expect(lastShopSearch()).not.toContain('near_lat')

  fireEvent.click(screen.getByTestId('locate-me'))

  await waitFor(() => expect(currentUrl()).toContain('near=50.0647,19.945'))
  expect(permissionPrompts).toBe(1)

  // Both halves, and as numbers the server can read.
  await waitFor(() => expect(lastShopSearch()).toContain('near_lat=50.0647'))
  expect(lastShopSearch()).toContain('near_lng=19.945')

  // Remembered for next time — and stored as one value, so half a position cannot be
  // read back out of it.
  expect(store.get(NEAR_STORAGE_KEY)).toBe('50.0647,19.945')

  // And the page says out loud what sorting by distance did to the list.
  const banner = await screen.findByTestId('nearby-banner')
  expect(banner).toHaveTextContent('Closest to you first')
  expect(banner).toHaveTextContent('Shops nobody has pinned on a map are not in this list')
})

test('refusing the prompt explains itself and leaves the ordinary list working', async () => {
  browsing()
  refusePosition(1)
  renderApp('/shops')

  await screen.findByTestId('shop-list')
  fireEvent.click(screen.getByTestId('locate-me'))

  const note = await screen.findByTestId('locate-me-error')
  expect(note).toHaveTextContent('You did not share your location')
  // The sentence has to end somewhere useful. A refusal is an answer, not a failure.
  expect(note).toHaveTextContent('here is every shop instead')

  // Not an error region: nothing failed, and dressing a permission answer as a failure
  // is how a working page reads as broken.
  expect(screen.queryByTestId('shop-list-error')).toBeNull()

  // The list is still there, still complete, and still every shop — including the one
  // with no pin, which a nearby search would have dropped.
  const cards = within(screen.getByTestId('shop-list')).getAllByTestId('shop-card')
  expect(cards).toHaveLength(3)
  expect(screen.getByTestId('shop-list')).toHaveTextContent('Poczta Herbaty')

  // Nothing went into the URL, nothing was remembered, and no request pretended to know
  // where we are.
  expect(currentUrl()).not.toContain('near')
  expect(store.has(NEAR_STORAGE_KEY)).toBe(false)
  expect(lastShopSearch()).not.toContain('near_lat')
  expect(screen.queryByTestId('nearby-banner')).toBeNull()
})

test('a device that cannot place itself says something different from a refusal', async () => {
  browsing()
  refusePosition(2)
  renderApp('/shops')

  await screen.findByTestId('shop-list')
  fireEvent.click(screen.getByTestId('locate-me'))

  const note = await screen.findByTestId('locate-me-error')
  // "You did not share" is a lie when the answer was yes and the fix failed.
  expect(note).toHaveTextContent('Your device could not work out where it is')
  expect(note).not.toHaveTextContent('did not share')
})

test('a remembered position is used on arrival without asking permission again', async () => {
  store.set(NEAR_STORAGE_KEY, '50.0619,19.9368')
  browsing()
  // Stubbed but never expected to fire: the count below is the whole test.
  grantPosition({ lat: 1, lng: 1 })
  renderApp('/shops')

  await waitFor(() => expect(currentUrl()).toContain('near=50.0619,19.9368'))
  await waitFor(() => expect(lastShopSearch()).toContain('near_lat=50.0619'))
  expect(lastShopSearch()).toContain('near_lng=19.9368')
  await screen.findByTestId('nearby-banner')

  // The point of remembering it: the second visit does not re-open the prompt. Without
  // this assertion the test would pass just as happily on a page that asked every time.
  expect(permissionPrompts).toBe(0)
})

test('rubbish in storage is ignored rather than believed', async () => {
  // `Number('')` is 0, so a lenient reader would park the reader in the Atlantic off
  // Ghana and make it look like a working feature.
  store.set(NEAR_STORAGE_KEY, ',')
  browsing()
  renderApp('/shops')

  await screen.findByTestId('shop-list')
  expect(currentUrl()).not.toContain('near')
  expect(lastShopSearch()).not.toContain('near_lat')
  expect(screen.queryByTestId('nearby-banner')).toBeNull()
})

test('half a position in a hand-edited URL is ignored rather than half-sent', async () => {
  browsing()
  renderApp('/shops?near=50.0619')

  await screen.findByTestId('shop-list')
  // Supplying one of `near_lat`/`near_lng` is a 422 from the server, so a truncated or
  // hand-edited URL has to fall back to the ordinary list rather than ask for one.
  expect(lastShopSearch()).not.toContain('near_l')
  expect(screen.queryByTestId('nearby-banner')).toBeNull()
  expect(within(screen.getByTestId('shop-list')).getAllByTestId('shop-card')).toHaveLength(3)
})

test('“Show all shops” drops the position from the URL and forgets it', async () => {
  store.set(NEAR_STORAGE_KEY, '50.0619,19.9368')
  browsing()
  renderApp('/shops?near=50.0619,19.9368')

  await screen.findByTestId('nearby-banner')
  fireEvent.click(screen.getByTestId('clear-nearby'))

  await waitFor(() => expect(currentUrl()).not.toContain('near'))
  expect(screen.queryByTestId('nearby-banner')).toBeNull()

  // Both halves. Leaving it in storage would put it straight back on the next visit,
  // which reads as a setting that will not turn off.
  expect(store.has(NEAR_STORAGE_KEY)).toBe(false)

  // And the list that comes back is the whole list again, unpinned shops included.
  await waitFor(() => expect(lastShopSearch()).not.toContain('near_lat'))
  await waitFor(() =>
    expect(within(screen.getByTestId('shop-list')).getAllByTestId('shop-card')).toHaveLength(3),
  )
})

test('a browser that refuses storage outright still browses and still locates', async () => {
  breakStorage()
  browsing()
  grantPosition({ lat: 50.0647, lng: 19.945 })
  renderApp('/shops')

  // Reading the accessor throws on mount, where the remembered position would be read.
  // The page has to come up anyway.
  const list = await screen.findByTestId('shop-list')
  expect(within(list).getAllByTestId('shop-card')).toHaveLength(3)

  // And the write throws too, which must not cost the reader the thing they just asked
  // for: the position is in the URL, which is what the query reads.
  fireEvent.click(screen.getByTestId('locate-me'))
  await waitFor(() => expect(currentUrl()).toContain('near=50.0647,19.945'))
  await waitFor(() => expect(lastShopSearch()).toContain('near_lat=50.0647'))
  expect(await screen.findByTestId('nearby-banner')).toBeInTheDocument()
})

/* ------------------------------------------------------------------ list and map */

test('?view=map round-trips through the URL without refetching the list', async () => {
  browsing([kruka, czajnik])
  renderApp('/shops?view=map')

  // Arriving on a shared link opens on the map, and the toggle reports which of the two
  // it is rather than leaving a screen reader to infer it from the label.
  await screen.findByTestId('shop-map')
  expect(screen.queryByTestId('shop-list')).toBeNull()
  expect(screen.getByTestId('shop-view-map')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('shop-view-list')).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(screen.getByTestId('shop-view-list'))
  await screen.findByTestId('shop-list')
  // The default is omitted rather than written out, so the plain browse stays /shops.
  expect(currentUrl()).toBe('/shops')
  expect(screen.queryByTestId('shop-map')).toBeNull()

  fireEvent.click(screen.getByTestId('shop-view-map'))
  await screen.findByTestId('shop-map')
  expect(currentUrl()).toBe('/shops?view=map')

  // Which way the same shops are drawn is nothing the server needs to know. Putting
  // `view` in the query key would refetch an identical list on every flip.
  expect(shopCalls()).toHaveLength(1)
  expect(lastShopSearch()).not.toContain('view')
})

test('the map view counts the shops it cannot draw instead of dropping them silently', async () => {
  browsing()
  renderApp('/shops?view=map')

  const map = await screen.findByTestId('shop-map')
  // Only the two that can be drawn reach the map...
  expect(map).toHaveAttribute('data-pins', 'u-kruka czajnik')

  // ...and the third is named rather than lost. "3 shops" over a map with two pins on it
  // is a bug report waiting to happen.
  const note = screen.getByTestId('shop-map-hidden')
  expect(note).toHaveTextContent('1 shop on this page has no pin yet')

  // And there is a way to actually see it, which is what stops the map being a dead end.
  fireEvent.click(screen.getByTestId('shop-map-hidden-to-list'))
  const list = await screen.findByTestId('shop-list')
  expect(within(list).getAllByTestId('shop-card')).toHaveLength(3)
  expect(list).toHaveTextContent('Poczta Herbaty')
})

test('a map with every shop on it says nothing about hidden ones', async () => {
  browsing([kruka, czajnik])
  renderApp('/shops?view=map')

  await screen.findByTestId('shop-map')
  expect(screen.queryByTestId('shop-map-hidden')).toBeNull()
})

test('the map is handed the reader’s own position when there is one', async () => {
  browsing()
  renderApp('/shops?view=map&near=50.0619,19.9368')

  const map = await screen.findByTestId('shop-map')
  expect(map).toHaveAttribute('data-you', '50.0619,19.9368')
  // The server dropped the unpinned shop from a nearby search, so there is nothing to
  // apologise for on this one.
  expect(map).toHaveAttribute('data-pins', 'u-kruka czajnik')
  expect(screen.queryByTestId('shop-map-hidden')).toBeNull()
})

/* --------------------------------------------------------------------- distances */

test('a distance from the server reads as words, not as a decimal', async () => {
  browsing()
  renderApp('/shops?near=50.0619,19.9368')

  const list = await screen.findByTestId('shop-list')
  const cards = within(list).getAllByTestId('shop-card')
  // Nearest first, as the server sorted them.
  expect(within(cards[0]).getByTestId('shop-card-distance')).toHaveTextContent('420 m away')
  expect(within(cards[1]).getByTestId('shop-card-distance')).toHaveTextContent('2.4 km away')

  // Under a kilometre it switches to metres: "0.4 km away" is a number somebody has to
  // convert in their head before deciding whether to walk.
  expect(cards[0]).not.toHaveTextContent('0.42')
})

test('an ordinary browse carries no distance at all, not a zero', async () => {
  browsing()
  renderApp('/shops')

  const list = await screen.findByTestId('shop-list')
  expect(within(list).getAllByTestId('shop-card')).toHaveLength(3)
  // Null in, nothing out — the badge is absent rather than empty, because "— away" on
  // every card in an ordinary browse is a line of noise on every card.
  expect(within(list).queryAllByTestId('shop-card-distance')).toHaveLength(0)
  expect(list).not.toHaveTextContent('away')
  expect(list).not.toHaveTextContent('0 m')
})

/* ------------------------------------------------------------------ one shop's map */

test('a pinned shop gets a small map and a way to be walked to', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops/u-kruka': () => json(krukaDetail),
    'GET /shops/u-kruka/listings': () => json(pageOf([])),
  })
  renderApp('/shops/u-kruka')

  expect(await screen.findByTestId('shop-point-map')).toHaveAttribute('data-at', '50.0625,19.937')

  const directions = screen.getByTestId('shop-directions')
  // Both halves of the OpenStreetMap link matter: `mlat`/`mlon` drop the marker and the
  // fragment sets the view, and the fragment alone shows the area with nothing in it.
  expect(directions).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/?mlat=50.0625&mlon=19.937#map=17/50.0625/19.937',
  )
  expect(directions).toHaveAttribute('rel', 'noopener noreferrer')
})

test('an online-only shop gets no map and no directions to nowhere', async () => {
  mockFetch({
    'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    'GET /shops/poczta-herbaty': () => json(pocztaDetail),
    'GET /shops/poczta-herbaty/listings': () => json(pageOf([])),
  })
  renderApp('/shops/poczta-herbaty')

  await screen.findByRole('heading', { level: 1, name: 'Poczta Herbaty' })
  expect(screen.queryByTestId('shop-point-map')).toBeNull()
  expect(screen.queryByTestId('shop-directions')).toBeNull()
})

/* ------------------------------------------------------------- the admin pin editor */

/** Open the editor on the one listed shop and hand back its pin fieldset. */
async function openPinEditor() {
  fireEvent.click(await screen.findByTestId('edit-shop-shop-1'))
  return await screen.findByTestId('edit-shop-shop-1-pin')
}

test('the pin editor opens on the shop’s own pin and follows the map', async () => {
  administering()
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  // Prefilled from the shop as saved, and the map is showing the same point — one pin,
  // not a map and a pair of boxes that can drift apart.
  expect(within(pin).getByLabelText('Latitude')).toHaveValue(50.0625)
  expect(within(pin).getByLabelText('Longitude')).toHaveValue(19.937)
  expect(within(pin).getByTestId('shop-pin-picker')).toHaveAttribute('data-at', '50.0625,19.937')

  // Clicking the map is one of the three ways to move it, and the boxes follow.
  fireEvent.click(within(pin).getByTestId('pin-picker-click'))
  expect(within(pin).getByLabelText('Latitude')).toHaveValue(51.1093)
  expect(within(pin).getByLabelText('Longitude')).toHaveValue(17.0386)
  expect(within(pin).getByTestId('shop-pin-picker')).toHaveAttribute('data-at', '51.1093,17.0386')
})

test('half a pin is refused before it can be saved', async () => {
  administering({ 'PATCH /admin/shops/shop-1': () => json(krukaDetail) })
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  fireEvent.change(within(pin).getByLabelText('Longitude'), { target: { value: '' } })
  fireEvent.submit(screen.getByTestId('edit-shop-shop-1-form'))

  // A shop with a latitude and no longitude is not a place: the server takes it and it
  // never appears on a map again, silently.
  expect(await screen.findByText('Give a longitude too, or clear the pin.')).toBeInTheDocument()
  expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
})

test('a shop that has not been saved yet cannot have its address looked up', async () => {
  administering()
  renderApp('/admin/shops')

  fireEvent.click(await screen.findByTestId('toggle-create-shop'))
  // The endpoint is addressed by shop id, so the create form says what to do instead of
  // offering a button that could only ever 404.
  expect(screen.getByTestId('admin-shop-geocode-unavailable')).toHaveTextContent(
    'Save the shop first',
  )
  expect(screen.queryByTestId('admin-shop-geocode')).toBeNull()
})

test('“Find from address” moves the pin, and asks the server to use the saved address', async () => {
  administering({
    'POST /admin/shops/shop-1/geocode': () =>
      json({ ...krukaDetail, latitude: 52.2297, longitude: 21.0122 }),
  })
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  fireEvent.click(within(pin).getByTestId('edit-shop-shop-1-geocode'))

  await screen.findByTestId('edit-shop-shop-1-geocode-success')
  expect(within(pin).getByLabelText('Latitude')).toHaveValue(52.2297)
  expect(within(pin).getByLabelText('Longitude')).toHaveValue(21.0122)

  // No body: it geocodes the address the shop *has*, not the one sitting unsaved in the
  // form. The hint under the button says so, and this is the half that has to be true.
  const request = calls.find((call) => call.path === '/admin/shops/shop-1/geocode')
  expect(request?.method).toBe('POST')
  expect(request?.body).toBeNull()
})

test('an address nobody can find says to drop the pin by hand', async () => {
  administering({
    'POST /admin/shops/shop-1/geocode': () =>
      json({ detail: 'We could not find that address. Drop the pin on the map instead.' }, 422),
  })
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  fireEvent.click(within(pin).getByTestId('edit-shop-shop-1-geocode'))

  const error = await screen.findByTestId('edit-shop-shop-1-geocode-error')
  expect(error).toHaveTextContent('could not find that address')
  expect(error).toHaveTextContent('drop the pin yourself')
  // A 422 is the address's fault and will fail identically on a retry, so it must not
  // invite one.
  expect(error).not.toHaveTextContent('Try again in a minute')

  // And the pin that was there is still there: a failed lookup must not clear it.
  expect(within(pin).getByLabelText('Latitude')).toHaveValue(50.0625)
  expect(screen.queryByTestId('edit-shop-shop-1-geocode-success')).toBeNull()
})

test('a lookup service that is down says to try again, not that the address is wrong', async () => {
  administering({
    'POST /admin/shops/shop-1/geocode': () =>
      json({ detail: 'Address lookup is unavailable right now. Drop the pin on the map instead.' }, 503),
  })
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  fireEvent.click(within(pin).getByTestId('edit-shop-shop-1-geocode'))

  const error = await screen.findByTestId('edit-shop-shop-1-geocode-error')
  expect(error).toHaveTextContent('not answering just now')
  expect(error).toHaveTextContent('Try again in a minute')
  // The distinction is the whole point: collapsing the two into "Geocoding failed" makes
  // the fixable one look permanent and the temporary one look fixable.
  expect(error).not.toHaveTextContent('could not find that address')
})

test('saving an edited pin sends both halves, and clearing it sends two nulls', async () => {
  const patches: unknown[] = []
  administering({
    'PATCH /admin/shops/shop-1': ({ init }) => {
      patches.push(JSON.parse(String(init?.body)))
      return json(krukaDetail)
    },
  })
  renderApp('/admin/shops')

  const pin = await openPinEditor()
  fireEvent.click(within(pin).getByTestId('pin-picker-click'))
  fireEvent.submit(screen.getByTestId('edit-shop-shop-1-form'))

  await waitFor(() => expect(patches).toHaveLength(1))
  expect(patches[0]).toMatchObject({ latitude: 51.1093, longitude: 17.0386 })

  // Reopen and take the pin off the map entirely. `null` rather than an omitted key is
  // what actually removes it — omitting would leave the wrong pin where it was.
  const reopened = await openPinEditor()
  fireEvent.click(within(reopened).getByTestId('edit-shop-shop-1-clear-pin'))
  fireEvent.submit(screen.getByTestId('edit-shop-shop-1-form'))

  await waitFor(() => expect(patches).toHaveLength(2))
  expect(patches[1]).toMatchObject({ latitude: null, longitude: null })
})

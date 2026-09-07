import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AuthProvider } from '../../features/auth/AuthProvider'
import type { Session, User } from '../../lib/api'
import { clearAccessToken } from '../../lib/token'
import { PageShell } from './page'
import { ThemeProvider } from '../../components/ui/theme'

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

const admin: User = { ...ada, id: 'user-9', display_name: 'Grace Hopper', role: 'admin' }

const sessionFor = (user: User): Session => ({
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  user,
})

/* ------------------------------------------------------------------ test harness */

type Handler = () => Response

const calls: string[] = []

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
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname.replace('/api/v1', '')}`
    calls.push(key)
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${key}`))
    return Promise.resolve(handler())
  })
}

/**
 * The nav, and nothing else.
 *
 * Real routes so navigation genuinely happens, but stand-in pages rather than the app's,
 * because a menu that closes on navigation should be provable without also mocking the
 * catalog. The bar itself is the real `PageShell` one.
 */
function renderNav(path = '/teas') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const page = (name: string) => <PageShell>
    <p>{name}</p>
  </PageShell>

  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/teas" element={page('Teas page')} />
              <Route path="/settings" element={page('Settings page')} />
              <Route path="*" element={page('Somewhere else')} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

const signedIn = (user: User = ada) =>
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(user)),
    'GET /friends/requests': () => json([]),
    // Both badge queries fire on every signed-in page, including the public catalog
    // ones. Registered here so an unrelated nav test cannot fail on a request it was
    // never about.
    'GET /households/invitations': () => json([]),
  })

const signedOut = () =>
  mockFetch({ 'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401) })

/** Open a menu and hand back its trigger, having waited for the session to settle. */
async function openMenu(testId: string): Promise<HTMLElement> {
  const trigger = await screen.findByTestId(testId)
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  return trigger
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------ the account menu */

test('the account menu opens on click, closes on Escape, and hands focus back to the trigger', async () => {
  signedIn()
  renderNav()

  const trigger = await screen.findByTestId('account-menu')
  const panel = screen.getByTestId('account-menu-items')

  // Closed is closed: not merely invisible, but out of the accessibility tree, which is
  // what `hidden` buys over a CSS class.
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(panel).not.toBeVisible()
  expect(screen.queryByRole('menu')).toBeNull()

  fireEvent.click(trigger)

  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(panel).toBeVisible()
  expect(screen.getByTestId('nav-settings')).toHaveAttribute('href', '/settings')
  // Opening moves focus into the menu. Without this a keyboard user opens a menu they
  // cannot reach: focus is still on the button and the items are `tabIndex={-1}`.
  expect(document.activeElement).toBe(screen.getByTestId('nav-profile'))

  fireEvent.keyDown(screen.getByTestId('nav-profile'), { key: 'Escape' })

  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(panel).not.toBeVisible()
  // The half everybody forgets. Closing without this leaves focus on a hidden element
  // and the browser drops it to <body>.
  expect(document.activeElement).toBe(trigger)
})

test('a click anywhere outside closes the account menu', async () => {
  signedIn()
  renderNav()

  const trigger = await openMenu('account-menu')
  expect(screen.getByTestId('account-menu-items')).toBeVisible()

  // The click that opened it must not also close it, so the handler asks whether the
  // target is inside the menu rather than merely whether a click happened.
  fireEvent.click(document.body)

  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('account-menu-items')).not.toBeVisible()
})

test('focus leaving the menu closes it', async () => {
  signedIn()
  renderNav()

  await openMenu('account-menu')
  const outside = screen.getByRole('link', { name: /Herbatka/ })

  fireEvent.blur(screen.getByTestId('nav-profile'), { relatedTarget: outside })

  expect(screen.getByTestId('account-menu')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('account-menu-items')).not.toBeVisible()
})

test('the arrow keys walk the menu and Home/End jump to its ends', async () => {
  signedIn()
  renderNav()

  await openMenu('account-menu')

  const profile = screen.getByTestId('nav-profile')
  const reviews = screen.getByTestId('nav-my-reviews')
  const favourites = screen.getByTestId('nav-favourites')
  const settings = screen.getByTestId('nav-settings')
  const signOut = screen.getByTestId('sign-out')

  expect(document.activeElement).toBe(profile)

  fireEvent.keyDown(profile, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(reviews)

  fireEvent.keyDown(reviews, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(favourites)

  fireEvent.keyDown(favourites, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(settings)

  fireEvent.keyDown(settings, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(favourites)

  fireEvent.keyDown(favourites, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(reviews)

  fireEvent.keyDown(reviews, { key: 'End' })
  expect(document.activeElement).toBe(signOut)

  // Wrapping, so holding one arrow key never dead-ends at an edge.
  fireEvent.keyDown(signOut, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(profile)

  fireEvent.keyDown(profile, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(signOut)

  fireEvent.keyDown(signOut, { key: 'Home' })
  expect(document.activeElement).toBe(profile)
})

test('ArrowDown opens a closed menu from the keyboard alone', async () => {
  signedIn()
  renderNav()

  const trigger = await screen.findByTestId('account-menu')
  trigger.focus()

  fireEvent.keyDown(trigger, { key: 'ArrowDown' })

  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(document.activeElement).toBe(screen.getByTestId('nav-profile'))
})

test('choosing an item navigates and leaves no menu hanging over the new page', async () => {
  signedIn()
  renderNav()

  await openMenu('account-menu')
  fireEvent.click(screen.getByTestId('nav-settings'))

  expect(await screen.findByText('Settings page')).toBeInTheDocument()
  expect(screen.getByTestId('account-menu')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('account-menu-items')).not.toBeVisible()
})

/* ------------------------------------------------------------------ what is in them */

test('the Catalog menu holds exactly Teas, Ingredients and Shops', async () => {
  signedIn()
  renderNav()

  await openMenu('nav-catalog')
  const items = within(screen.getByTestId('catalog-menu')).getAllByRole('menuitem')

  expect(items.map((item) => item.textContent)).toEqual(['Teas', 'Ingredients', 'Shops'])
  expect(items.map((item) => item.getAttribute('href'))).toEqual([
    '/teas',
    '/ingredients',
    '/shops',
  ])
  // The three that moved into it are no longer sitting in the bar as well.
  expect(screen.getByTestId('nav-teas').closest('[role="menu"]')).not.toBeNull()
})

test('Admin is in the account menu only for an admin', async () => {
  signedIn(ada)
  renderNav()

  await openMenu('account-menu')
  expect(screen.queryByTestId('nav-admin')).toBeNull()

  cleanup()
  signedIn(admin)
  renderNav()

  await openMenu('account-menu')
  expect(screen.getByTestId('nav-admin')).toHaveAttribute('href', '/admin')
})

test('the account trigger wears their avatar, falling back to initials', async () => {
  signedIn()
  renderNav()

  expect(await screen.findByTestId('nav-account-avatar')).toHaveTextContent('AL')

  cleanup()
  signedIn({ ...ada, avatar_url: '/media/ada.png' })
  renderNav()

  expect(await screen.findByTestId('nav-account-avatar')).toHaveAttribute('src', '/media/ada.png')
})

/* ---------------------------------------------------------------------- signed out */

test('signed out there is no account menu, and Sign in is on the bar', async () => {
  signedOut()
  renderNav()

  expect(await screen.findByTestId('nav-sign-in')).toHaveAttribute('href', '/login')
  expect(screen.queryByTestId('account-menu')).toBeNull()
  expect(screen.queryByTestId('sign-out')).toBeNull()
  expect(screen.queryByTestId('nav-settings')).toBeNull()

  // Catalog is the whole nav for a stranger, and it still works.
  expect(screen.getByTestId('nav-catalog')).toBeInTheDocument()
  expect(screen.queryByTestId('nav-households')).toBeNull()

  // No hamburger either: one entry does not need a disclosure button, and the panel is
  // never collapsed without one.
  expect(screen.queryByTestId('nav-toggle')).toBeNull()
  expect(screen.getByTestId('nav-primary').className).not.toContain('hidden')

  // And nothing authenticated was asked for on a public page.
  expect(calls.filter((call) => call === 'GET /friends/requests')).toHaveLength(0)
})

/* -------------------------------------------------------------------------- mobile */

test('below lg the four primary entries sit behind the hamburger', async () => {
  signedIn()
  renderNav()

  const toggle = await screen.findByTestId('nav-toggle')
  const panel = screen.getByTestId('nav-primary')

  // `hidden`/`flex` is the mechanism: the panel is a row from `lg` up whatever this
  // button says, and only below it does the button decide.
  //
  // `lg`, not `sm`, since the bar became a three-column grid with the entries in
  // letterspaced caps. Caps are measurably wider, and four of them plus a wordmark and a
  // person's name do not fit a 640px bar — the breakpoint moved with the type.
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(toggle).toHaveAttribute('aria-controls', 'nav-primary')
  expect(panel.className).toContain('hidden')
  expect(panel.className).toContain('lg:flex')

  fireEvent.click(toggle)

  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(panel.className).toContain('flex')
  expect(panel.className).not.toContain(' hidden')

  // The account menu is never inside the panel: it stays on the bar at every width, so
  // there is exactly one "Sign out" in the document.
  expect(panel.contains(screen.getByTestId('account-menu'))).toBe(false)
})

/**
 * The Households badge, mirroring the Friends one beside it. A household invitation now
 * arrives without a code to relay, so the only thing that tells you it is waiting is this
 * — an invitation nobody is shown is not a feature.
 */
test('an outstanding household invitation shows on the Households entry, and vanishes with it', async () => {
  const invitation = {
    id: 'inv-1',
    household: { id: 'hh-1', name: 'Flat 3B', image_url: null },
    invited_by: { id: 'user-2', display_name: 'Sasha', avatar_url: null },
    expires_at: '2026-12-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
  }
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(ada)),
    'GET /friends/requests': () => json([]),
    'GET /households/invitations': () => json([invitation]),
  })
  renderNav()

  const badge = await screen.findByTestId('nav-households-badge')
  expect(badge).toHaveTextContent('1')
  // Not a bare number for a screen reader: "1" next to "Households" says nothing.
  expect(badge).toHaveAccessibleName('1 household invitation waiting')

  cleanup()
  signedIn()
  renderNav()

  await screen.findByTestId('nav-households')
  expect(screen.queryByTestId('nav-households-badge')).toBeNull()
})

/**
 * The nav renders on the public catalog pages, so a signed-out visitor must not be firing
 * authenticated requests on every page load.
 *
 * Be honest about what this proves, because it is less than it looks. The property is
 * held up twice over: the badge sits inside the `{user && …}` branch, so the hook never
 * mounts; and the query is `enabled: isSignedIn`, so it would not fire even if it did. I
 * checked both — removing either one on its own leaves this test green. So it is a
 * backstop against losing *both*, not a test of either, and it is cheap enough to be
 * worth exactly that much.
 */
test('signed out, the nav makes no authenticated request', async () => {
  signedOut()
  renderNav()

  await screen.findByTestId('nav-sign-in')
  expect(calls.some((call) => call.includes('/households/invitations'))).toBe(false)
  expect(calls.some((call) => call.includes('/friends/requests'))).toBe(false)
})

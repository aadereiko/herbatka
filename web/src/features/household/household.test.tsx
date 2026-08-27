import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { HouseholdDetail, HouseholdSummary, Invite, Member, StockItem } from '../../lib/household'
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

const grace: User = {
  ...ada,
  id: 'user-2',
  email: 'grace@herbatka.test',
  display_name: 'Grace Hopper',
}

const sessionFor = (user: User): Session => ({
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  user,
})

const memberFor = (user: User, role: Member['role']): Member => ({
  user: {
    id: user.id,
    display_name: user.display_name,
    email: user.email,
    avatar_url: user.avatar_url,
  },
  role,
  joined_at: '2026-03-01T08:00:00Z',
})

const home: HouseholdSummary = {
  id: 'hh-1',
  name: 'Home',
  // M6 widened both household schemas with a picture. Null here, as an untouched
  // household actually comes back — the one test that cares sets it.
  image_url: null,
  role: 'owner',
  member_count: 2,
  stock_item_count: 4,
  low_stock_count: 2,
  created_at: '2026-03-01T08:00:00Z',
}

const homeDetail: HouseholdDetail = {
  ...home,
  members: [memberFor(ada, 'owner'), memberFor(grace, 'member')],
}

/** The same household seen by Grace, who is only a member of it. */
const homeAsMember: HouseholdDetail = {
  ...homeDetail,
  role: 'member',
}

const invite: Invite = {
  id: 'inv-1',
  code: 'TEA-7788',
  invited_email: null,
  expires_at: '2026-09-01T08:00:00Z',
  created_at: '2026-08-01T08:00:00Z',
  accepted_at: null,
}

/** A `File` the upload field will accept: the right type, and comfortably under the
 *  5 MB limit. The rejection cases live in the shop suite, which owns the field. */
function imageFile(name: string): File {
  return new File(['tea'], name, { type: 'image/png' })
}

function pageOf<T>(items: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, page: 1, size: 20, pages: 1, ...extra }
}

const emptyStock: Page<StockItem> = pageOf([])

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
 * Routes by `METHOD /path`, ignoring the query string, and records every call. An
 * unregistered path rejects loudly rather than answering something plausible — a wrong
 * URL that quietly returns an empty page is the bug this harness exists to catch.
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

let currentPath = ''

/** Mirrors the router's location out of the tree, written in an effect rather than
 *  during render — reassigning module state while rendering is the side effect the lint
 *  rule exists to catch. */
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

/** Signed in as Ada, with the household endpoints answering. Individual tests override
 *  whichever one they are actually about. */
function signedIn(user: User, overrides: Record<string, Handler> = {}) {
  return mockFetch({
    'POST /auth/refresh': () => json(sessionFor(user)),
    'GET /households': () => json([home]),
    'GET /households/hh-1': () => json(homeDetail),
    'GET /households/hh-1/stock': () => json(emptyStock),
    'GET /households/hh-1/invites': () => json([invite]),
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('a signed-out visitor is sent to sign in rather than shown the shelf', async () => {
  mockFetch({ 'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401) })

  renderApp('/households')

  expect(await screen.findByTestId('login-page')).toBeInTheDocument()
  expect(calls.some((call) => call.path.startsWith('/households'))).toBe(false)
})

test('the list shows each household with its tins and what is running low', async () => {
  signedIn(ada)
  renderApp('/households')

  const card = await screen.findByTestId('household-card')
  expect(within(card).getByRole('heading', { name: 'Home' })).toBeVisible()
  expect(card).toHaveTextContent('2 members')
  expect(card).toHaveTextContent('4 tins')
  expect(screen.getByTestId('household-low-hh-1')).toHaveTextContent('2 tins running low')
  expect(card).toHaveAttribute('href', '/households/hh-1')
})

test('an empty list explains what a household is for', async () => {
  signedIn(ada, { 'GET /households': () => json([]) })
  renderApp('/households')

  const empty = await screen.findByTestId('household-list-empty')
  expect(empty).toHaveTextContent('not in a household yet')
  expect(empty).toHaveTextContent('everybody in the household sees how much is left')
  // The two ways out are on the same screen as the explanation.
  expect(screen.getByTestId('create-household-form')).toBeInTheDocument()
  expect(screen.getByTestId('join-household-form')).toBeInTheDocument()
})

test('creating a household posts the name and lands on the new household', async () => {
  signedIn(ada, {
    'POST /households': () => json({ ...homeDetail, id: 'hh-9', name: 'Flat 3' }, 201),
    'GET /households/hh-9': () => json({ ...homeDetail, id: 'hh-9', name: 'Flat 3' }),
    'GET /households/hh-9/stock': () => json(emptyStock),
    'GET /households/hh-9/invites': () => json([]),
  })
  renderApp('/households')

  await screen.findByTestId('create-household-form')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Flat 3  ' } })
  fireEvent.submit(screen.getByTestId('create-household-form'))

  await waitFor(() => expect(currentPath).toBe('/households/hh-9'))
  const posted = calls.find((call) => call.method === 'POST' && call.path === '/households')
  // Trimmed, because "  Flat 3  " is a typing artefact and not what anybody named it.
  expect(JSON.parse(posted?.body ?? '{}')).toEqual({ name: 'Flat 3' })
})

test('joining with a bad code shows the server error', async () => {
  signedIn(ada, {
    'POST /households/join': () => json({ detail: 'That invite code does not exist.' }, 404),
  })
  renderApp('/households')

  await screen.findByTestId('join-household-form')
  fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'NOPE-0000' } })
  fireEvent.submit(screen.getByTestId('join-household-form'))

  expect(await screen.findByTestId('join-error')).toHaveTextContent(
    'That invite code does not exist.',
  )
  // Still on the list, and nowhere near a household page.
  expect(currentPath).toBe('/households')
})

test('joining with a good code lands on the household you joined', async () => {
  signedIn(ada, { 'POST /households/join': () => json(homeDetail) })
  renderApp('/households')

  await screen.findByTestId('join-household-form')
  fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'TEA-7788' } })
  fireEvent.submit(screen.getByTestId('join-household-form'))

  await waitFor(() => expect(currentPath).toBe('/households/hh-1'))
  const posted = calls.find((call) => call.path === '/households/join')
  expect(JSON.parse(posted?.body ?? '{}')).toEqual({ code: 'TEA-7788' })
})

test('a 404 on the household page reads as “not found or not yours”, with no retry', async () => {
  signedIn(ada, {
    'GET /households/hh-1': () => json({ detail: 'Household not found' }, 404),
  })
  renderApp('/households/hh-1')

  const missing = await screen.findByTestId('household-missing')
  expect(missing).toHaveTextContent('Not found, or not yours')
  expect(missing).toHaveTextContent('you are not a member of it')
  // The point of the test: no retry, because neither answer changes on a second ask.
  expect(screen.queryByTestId('household-retry')).toBeNull()
  expect(screen.queryByTestId('household-error')).toBeNull()
  // And nothing behind the 404 was asked for either.
  expect(calls.some((call) => call.path === '/households/hh-1/stock')).toBe(false)
})

test('a server failure that is not a 404 does offer a retry', async () => {
  signedIn(ada, { 'GET /households/hh-1': () => json({ detail: 'Database is on fire' }, 500) })
  renderApp('/households/hh-1')

  expect(await screen.findByTestId('household-error')).toHaveTextContent('Database is on fire')
  expect(screen.getByTestId('household-retry')).toBeInTheDocument()
  expect(screen.queryByTestId('household-missing')).toBeNull()
})

test('the invites panel renders for an owner and is absent for a member', async () => {
  signedIn(ada)
  renderApp('/households/hh-1')

  expect(await screen.findByTestId('invites-panel')).toBeInTheDocument()
  expect(await screen.findByTestId('invite-code-inv-1')).toHaveTextContent('TEA-7788')
  expect(screen.getByTestId('start-rename')).toBeInTheDocument()
  expect(screen.getByTestId('delete-household')).toBeInTheDocument()

  cleanup()

  // Same household, same id, seen by somebody whose role is `member`.
  signedIn(grace, { 'GET /households/hh-1': () => json(homeAsMember) })
  renderApp('/households/hh-1')

  await screen.findByTestId('members-panel')
  expect(screen.queryByTestId('invites-panel')).toBeNull()
  expect(screen.queryByTestId('start-rename')).toBeNull()
  expect(screen.queryByTestId('delete-household')).toBeNull()
  // Hidden, and not merely unrendered: the owner-only endpoint is never called.
  expect(calls.some((call) => call.path === '/households/hh-1/invites')).toBe(false)
  // Leaving is everybody's, though.
  expect(screen.getByTestId('leave-household')).toBeInTheDocument()
})

test('making an invite posts only the fields that were filled in', async () => {
  signedIn(ada, {
    'POST /households/hh-1/invites': () => json({ ...invite, id: 'inv-2', code: 'TEA-0001' }, 201),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('create-invite-form')
  fireEvent.change(screen.getByLabelText('Expires in (optional)'), { target: { value: '7' } })
  fireEvent.submit(screen.getByTestId('create-invite-form'))

  await waitFor(() =>
    expect(calls.some((call) => call.method === 'POST' && call.path === '/households/hh-1/invites')).toBe(
      true,
    ),
  )
  const posted = calls.find((call) => call.method === 'POST' && call.path === '/households/hh-1/invites')
  // No `invited_email: ''` — an empty box means "a code anybody can use", not a blank
  // address the server has to decide how to interpret.
  expect(JSON.parse(posted?.body ?? '{}')).toEqual({ expires_in_days: 7 })
})

test('leaving takes two taps and DELETEs your own membership', async () => {
  signedIn(ada, {
    'DELETE /households/hh-1/members/user-1': () => new Response(null, { status: 204 }),
  })
  renderApp('/households/hh-1')

  await screen.findByTestId('leave-household')
  // One tap arms it; nothing has been sent yet.
  fireEvent.click(screen.getByTestId('leave-household'))
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false)

  fireEvent.click(screen.getByTestId('confirm-leave'))

  await waitFor(() => expect(currentPath).toBe('/households'))
  expect(
    calls.some(
      (call) => call.method === 'DELETE' && call.path === '/households/hh-1/members/user-1',
    ),
  ).toBe(true)
})

test('the last owner is told why they cannot leave, in the server’s words', async () => {
  signedIn(ada, {
    'DELETE /households/hh-1/members/user-1': () =>
      json({ detail: 'You are the only owner. Make somebody else an owner first.' }, 409),
  })
  renderApp('/households/hh-1')

  fireEvent.click(await screen.findByTestId('leave-household'))
  fireEvent.click(screen.getByTestId('confirm-leave'))

  expect(await screen.findByTestId('household-action-error')).toHaveTextContent(
    'You are the only owner. Make somebody else an owner first.',
  )
  // Refused, so still here.
  expect(currentPath).toBe('/households/hh-1')
})

test('renaming a household PATCHes the name and refreshes the page', async () => {
  let detailCalls = 0
  signedIn(ada, {
    'GET /households/hh-1': () => {
      detailCalls += 1
      return json(detailCalls === 1 ? homeDetail : { ...homeDetail, name: 'The Kitchen' })
    },
    'PATCH /households/hh-1': () => json({ ...homeDetail, name: 'The Kitchen' }),
  })
  renderApp('/households/hh-1')

  fireEvent.click(await screen.findByTestId('start-rename'))
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'The Kitchen' } })
  fireEvent.submit(screen.getByTestId('rename-household-form'))

  expect(await screen.findByRole('heading', { level: 1, name: 'The Kitchen' })).toBeVisible()
  const patched = calls.find((call) => call.method === 'PATCH' && call.path === '/households/hh-1')
  expect(JSON.parse(patched?.body ?? '{}')).toEqual({ name: 'The Kitchen' })
})

test('an owner sets a household photo: it uploads, then PATCHes only what changed', async () => {
  let stored: string | null = null
  signedIn(ada, {
    'GET /households/hh-1': () => json({ ...homeDetail, image_url: stored }),
    'POST /uploads/image': () => json({ url: 'https://cdn.example/home.png' }, 201),
    'PATCH /households/hh-1': ({ init }) => {
      const patch = JSON.parse(String(init?.body)) as { image_url?: string | null }
      stored = patch.image_url ?? null
      return json({ ...homeDetail, image_url: stored })
    },
  })
  renderApp('/households/hh-1')

  // Nothing set yet, so the shared leaf placeholder stands in for the picture.
  expect(await screen.findByTestId('household-detail-image-placeholder')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('start-rename'))
  fireEvent.change(screen.getByTestId('household-image-input'), {
    target: { files: [imageFile('home.png')] },
  })

  // The upload is its own step: the URL comes back and sits in the form until saved.
  expect(await screen.findByTestId('household-image-preview')).toHaveAttribute(
    'src',
    'https://cdn.example/home.png',
  )
  expect(calls.some((call) => call.path === '/households/hh-1' && call.method === 'PATCH')).toBe(
    false,
  )

  fireEvent.submit(screen.getByTestId('rename-household-form'))

  expect(await screen.findByTestId('household-detail-image')).toHaveAttribute(
    'src',
    'https://cdn.example/home.png',
  )

  // Only the field that moved. Sending an unchanged name back is the write that clobbers
  // the rename another owner made thirty seconds ago.
  const patched = calls.find((call) => call.method === 'PATCH' && call.path === '/households/hh-1')
  expect(JSON.parse(patched?.body ?? '{}')).toEqual({ image_url: 'https://cdn.example/home.png' })
})

test('an owner removes another member in two taps; a member sees no remove button', async () => {
  signedIn(ada, {
    'DELETE /households/hh-1/members/user-2': () => new Response(null, { status: 204 }),
  })
  renderApp('/households/hh-1')

  const members = await screen.findByTestId('member-list')
  // Your own row has no Remove — leaving is a different decision with a different name.
  expect(screen.queryByTestId('remove-user-1')).toBeNull()
  expect(within(members).getByText('Grace Hopper')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('remove-user-2'))
  fireEvent.click(screen.getByTestId('confirm-remove-user-2'))

  await waitFor(() =>
    expect(
      calls.some(
        (call) => call.method === 'DELETE' && call.path === '/households/hh-1/members/user-2',
      ),
    ).toBe(true),
  )
})

test('deleting a household needs a confirm and then returns to the list', async () => {
  signedIn(ada, { 'DELETE /households/hh-1': () => new Response(null, { status: 204 }) })
  renderApp('/households/hh-1')

  fireEvent.click(await screen.findByTestId('delete-household'))
  expect(calls.some((call) => call.method === 'DELETE')).toBe(false)

  fireEvent.click(screen.getByTestId('confirm-delete-household'))

  await waitFor(() => expect(currentPath).toBe('/households'))
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes } from '../../app/router'
import type { Session, User } from '../../lib/api'
import type { Ingredient, Page, TeaDetail, TeaSummary } from '../../lib/catalog'
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

const grace: User = { ...ada, id: 'user-2', email: 'grace@herbatka.test', role: 'admin' }

const sessionFor = (user: User): Session => ({
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  user,
})

const jasmine: Ingredient = {
  id: 'ing-1',
  slug: 'jasmine',
  name: 'Jasmine',
  category: 'flower',
  is_caffeinated: false,
  description: null,
  image_url: null,
  // No picture, so nobody to credit. The four travel together: an ingredient either has a
  // seeded Commons photograph and all of them, or it has neither.
  image_attribution: null,
  image_license: null,
  image_license_url: null,
  image_source_url: null,
}

/** A `File` the upload field will accept. The rejection cases live in the shop suite,
 *  which owns the field. */
function imageFile(name: string): File {
  return new File(['petal'], name, { type: 'image/png' })
}

const pendingTea: TeaSummary = {
  id: 'tea-9',
  slug: 'kitchen-blend',
  name: 'Kitchen Blend',
  tea_type: 'black',
  caffeine_level: 'high',
  image_url: null,
  brand: null,
  is_approved: false,
  primary_ingredients: ['Assam'],
  average_score: null,
  review_count: 0,
  my_score: null,
  // M8 widened both tea schemas with the star. False is what an untouched tea comes
  // back as, and what every signed-out reader is sent.
  is_favourite: false,
}

const approvedTea: TeaDetail = {
  ...pendingTea,
  is_approved: true,
  description: null,
  origin_country: null,
  brew_temp_c: null,
  brew_seconds: null,
  grams_per_100ml: null,
  ingredients: [],
  created_at: '2026-02-01T10:00:00Z',
  my_review: null,
  average_aroma: null,
  average_flavour: null,
  average_aftertaste: null,
  // M8. Null unless a test says otherwise: nobody has written their own numbers.
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

afterEach(() => {
  vi.restoreAllMocks()
  clearAccessToken()
})

/* ------------------------------------------------------------------------- tests */

test('a signed-in non-admin gets the 403 page, not the admin screen', async () => {
  mockFetch({ 'POST /auth/refresh': () => json(sessionFor(ada)) })

  renderApp('/admin')

  expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument()
  expect(screen.queryByTestId('pending-count')).toBeNull()
  // The guard has to stop the request too, not merely hide the answer.
  expect(calls.some((call) => call.path.startsWith('/admin'))).toBe(false)
})

test('a signed-out visitor is sent to sign in rather than shown a 403', async () => {
  mockFetch({ 'POST /auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401) })

  renderApp('/admin/ingredients')

  expect(await screen.findByTestId('login-page')).toBeInTheDocument()
})

test('an admin sees the pending count and the queue', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /admin/teas': () => json(pageOf([pendingTea], { total: 3 })),
  })

  renderApp('/admin')

  expect(await screen.findByTestId('pending-count')).toHaveTextContent('3 teas')
  // The count card asks for the envelope, not the rows.
  expect(calls.find((call) => call.path === '/admin/teas')?.search).toContain('size=1')
  expect(calls.find((call) => call.path === '/admin/teas')?.search).toContain('approved=false')
})

test('approving a tea empties the queue it came from', async () => {
  let queueCalls = 0
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /admin/teas': () => {
      queueCalls += 1
      return json(queueCalls === 1 ? pageOf([pendingTea]) : pageOf([]))
    },
    'POST /admin/teas/tea-9/approve': () => json(approvedTea),
  })

  renderApp('/admin/teas')

  await screen.findByTestId('queue-list')
  fireEvent.click(screen.getByTestId('approve-tea-9'))

  // The refetch is the point: without the invalidation in useApproveTea the row would
  // sit there approved-but-still-listed until a manual reload.
  expect(await screen.findByTestId('queue-empty')).toBeInTheDocument()
  expect(screen.getByTestId('queue-notice')).toHaveTextContent('“Kitchen Blend” is now in the catalog.')
  expect(queueCalls).toBeGreaterThan(1)
})

test('deleting an ingredient that is still in use shows the server’s own reason', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /catalog/ingredients': () => json(pageOf([jasmine])),
    'DELETE /admin/ingredients/ing-1': () =>
      json({ detail: 'Jasmine is used by 3 teas and cannot be deleted.' }, 409),
  })

  renderApp('/admin/ingredients')

  await screen.findByTestId('ingredient-table')
  fireEvent.click(screen.getByTestId('delete-ing-1'))
  fireEvent.click(screen.getByTestId('confirm-delete-ing-1'))

  expect(await screen.findByTestId('ingredient-error-ing-1')).toHaveTextContent(
    'Jasmine is used by 3 teas and cannot be deleted.',
  )
  // The row survives a refused delete, and the page does not pretend anything happened.
  expect(screen.getByText('Jasmine')).toBeInTheDocument()
  expect(screen.queryByTestId('ingredient-notice')).toBeNull()
})

test('deleting an unused ingredient goes through and refreshes the list', async () => {
  let listCalls = 0
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /catalog/ingredients': () => {
      listCalls += 1
      return json(listCalls === 1 ? pageOf([jasmine]) : pageOf([]))
    },
    'DELETE /admin/ingredients/ing-1': () => new Response(null, { status: 204 }),
  })

  renderApp('/admin/ingredients')

  await screen.findByTestId('ingredient-table')
  fireEvent.click(screen.getByTestId('delete-ing-1'))
  fireEvent.click(screen.getByTestId('confirm-delete-ing-1'))

  expect(await screen.findByTestId('admin-ingredients-empty')).toBeInTheDocument()
  expect(screen.getByTestId('ingredient-notice')).toHaveTextContent('Deleted “Jasmine”.')
})

test('the create form posts what the contract asks for', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /catalog/ingredients': () => json(pageOf([jasmine])),
    'POST /admin/ingredients': () =>
      json({ ...jasmine, id: 'ing-2', slug: 'rooibos', name: 'Rooibos', category: 'leaf' }, 201),
  })

  renderApp('/admin/ingredients')

  await screen.findByTestId('ingredient-form')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rooibos' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'leaf' } })
  fireEvent.click(screen.getByLabelText('Contains caffeine'))
  fireEvent.submit(screen.getByTestId('ingredient-form'))

  await waitFor(() => expect(screen.getByTestId('ingredient-notice')).toHaveTextContent('Rooibos'))
  const posted = calls.find((call) => call.method === 'POST' && call.path === '/admin/ingredients')
  expect(JSON.parse(posted?.body ?? '{}')).toEqual({
    name: 'Rooibos',
    category: 'leaf',
    is_caffeinated: true,
    // An explicit null rather than an omitted key, so the same submit handler can also
    // *remove* a picture on edit. See the note on `handleSubmit`.
    image_url: null,
  })
})

/**
 * The picture, end to end through the form: upload, preview, then into the body.
 *
 * The two halves are separate on purpose, and the assertion between them is the point —
 * `ImageUploadField` uploads immediately and hands back a URL, but nothing is *saved*
 * until submit. An implementation that posted the ingredient on file-pick, or that never
 * threaded the returned URL into the payload, would fail one half each.
 */
test('a picture chosen for an ingredient is uploaded, previewed, then saved with it', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /catalog/ingredients': () => json(pageOf([jasmine])),
    'POST /uploads/image': () => json({ url: 'https://cdn.example/jasmine.png' }, 201),
    'POST /admin/ingredients': () =>
      json({ ...jasmine, id: 'ing-2', slug: 'osmanthus', name: 'Osmanthus' }, 201),
  })

  renderApp('/admin/ingredients')

  await screen.findByTestId('ingredient-form')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Osmanthus' } })
  fireEvent.change(screen.getByTestId('ingredient-image-input'), {
    target: { files: [imageFile('osmanthus.png')] },
  })

  expect(await screen.findByTestId('ingredient-image-preview')).toHaveAttribute(
    'src',
    'https://cdn.example/jasmine.png',
  )
  expect(calls.some((call) => call.path === '/admin/ingredients')).toBe(false)

  fireEvent.submit(screen.getByTestId('ingredient-form'))

  await waitFor(() =>
    expect(screen.getByTestId('ingredient-notice')).toHaveTextContent('Osmanthus'),
  )
  const posted = calls.find((call) => call.method === 'POST' && call.path === '/admin/ingredients')
  expect(JSON.parse(posted?.body ?? '{}').image_url).toBe('https://cdn.example/jasmine.png')
})

test('the form refuses a nameless ingredient before it reaches the API', async () => {
  mockFetch({
    'POST /auth/refresh': () => json(sessionFor(grace)),
    'GET /catalog/ingredients': () => json(pageOf([jasmine])),
  })

  renderApp('/admin/ingredients')

  fireEvent.submit(await screen.findByTestId('ingredient-form'))

  expect(screen.getByTestId('ingredient-name-error')).toHaveTextContent(
    'Give the ingredient a name.',
  )
  expect(calls.some((call) => call.path === '/admin/ingredients')).toBe(false)
})

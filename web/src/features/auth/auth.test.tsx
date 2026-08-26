import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { AppRoutes, RedirectIfSignedIn, RequireAdmin, RequireAuth } from '../../app/router'
import { api } from '../../lib/api'
import type { Session, User } from '../../lib/api'
import { clearAccessToken, setAccessToken } from '../../lib/token'
import { AuthProvider } from './AuthProvider'
import { LoginPage } from './LoginPage'

const ada: User = {
  id: '6f8b0a1e-5c4d-4f2b-9d3a-11d0a7c5e001',
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

const healthy = { status: 'ok', database: 'ok', version: '0.1.0' }

type Handler = (init?: RequestInit) => Response | Promise<Response>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Routes fetch by path so a test can say "refresh is 401 but login is 200" without
 *  caring about call order — and shouts about any request it did not expect. */
function mockFetch(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = url.replace('/api/v1', '')
    const handler = handlers[path]
    if (!handler) return Promise.reject(new Error(`unexpected request: ${url}`))
    return Promise.resolve(handler(init))
  })
}

function renderWithProviders(ui: ReactNode, initialPath = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const renderApp = (initialPath = '/') => renderWithProviders(<AppRoutes />, initialPath)

afterEach(() => {
  vi.restoreAllMocks()
  // The token is module state, so it would otherwise leak into the next test.
  clearAccessToken()
})

test('a successful login lands on the protected home', async () => {
  let refreshCalls = 0
  mockFetch({
    '/auth/refresh': () => {
      refreshCalls += 1
      return json({ detail: 'Missing refresh cookie' }, 401)
    },
    '/auth/login': () => json(session),
    '/health': () => json(healthy),
  })

  renderApp('/')

  // No cookie, so RequireAuth sent us to the form — remembering that we wanted "/".
  const form = await screen.findByTestId('login-page')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@herbatka.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } })
  fireEvent.submit(form)

  expect(await screen.findByTestId('home-greeting')).toHaveTextContent('Ada Lovelace')
  expect(screen.getByTestId('role-badge')).toHaveTextContent('user')
  expect(screen.queryByTestId('login-page')).toBeNull()
  // A 401 from /auth/login must not kick off a refresh-and-retry of its own.
  expect(refreshCalls).toBe(1)
})

test('a rejected login shows the server message and stays on the login page', async () => {
  mockFetch({
    '/auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    '/auth/login': () => json({ detail: 'Incorrect email or password' }, 401),
  })

  renderApp('/login')

  const form = await screen.findByTestId('login-page')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@herbatka.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
  fireEvent.submit(form)

  expect(await screen.findByTestId('form-error')).toHaveTextContent('Incorrect email or password')
  expect(screen.getByTestId('login-page')).toBeInTheDocument()
  expect(screen.queryByTestId('home-greeting')).toBeNull()
})

test('a hard reload restores the session without flashing the login page', async () => {
  mockFetch({
    '/auth/refresh': () => json(session),
    '/health': () => json(healthy),
  })

  // A synchronous assertion only proves the first frame. This watches every DOM
  // mutation in between, so even a one-render flash of the form would be caught.
  const flashes: string[] = []
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-testid="login-page"]')) flashes.push('login')
  })
  observer.observe(document.body, { childList: true, subtree: true })

  renderApp('/')
  expect(screen.queryByTestId('login-page')).toBeNull()

  expect(await screen.findByTestId('home-greeting')).toHaveTextContent('Ada Lovelace')
  observer.disconnect()
  expect(flashes).toEqual([])
})

test('concurrent 401s share exactly one refresh', async () => {
  setAccessToken('expired-token')
  let refreshCalls = 0

  mockFetch({
    '/auth/refresh': async () => {
      refreshCalls += 1
      // A real refresh is not instant; the delay is what makes the five callers
      // genuinely concurrent instead of accidentally sequential.
      await new Promise((resolve) => setTimeout(resolve, 10))
      return json({ ...session, access_token: 'access-2' })
    },
    '/auth/me': (init) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      return authorization === 'Bearer access-2'
        ? json(ada)
        : json({ detail: 'Token has expired' }, 401)
    },
  })

  const results = await Promise.all(Array.from({ length: 5 }, () => api<User>('/auth/me')))

  expect(refreshCalls).toBe(1)
  expect(results).toHaveLength(5)
  expect(results.every((user) => user.display_name === 'Ada Lovelace')).toBe(true)
})

test('registration validates before it submits, then surfaces a 409', async () => {
  let registerCalls = 0
  mockFetch({
    '/auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    '/auth/register': () => {
      registerCalls += 1
      return json({ detail: 'Email already registered' }, 409)
    },
  })

  renderApp('/register')

  const form = await screen.findByTestId('register-page')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@herbatka.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
  fireEvent.submit(form)

  expect(screen.getByTestId('display-name-error')).toHaveTextContent('Tell us what to call you.')
  expect(screen.getByTestId('password-error')).toHaveTextContent('at least 8 characters')
  expect(registerCalls).toBe(0)

  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada Lovelace' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lovelace-1815' } })
  fireEvent.submit(form)

  expect(await screen.findByTestId('form-error')).toHaveTextContent('Email already registered')
  expect(registerCalls).toBe(1)
})

test('RequireAdmin shows 403 to a signed-in non-admin', async () => {
  mockFetch({ '/auth/refresh': () => json(session) })

  renderWithProviders(
    <Routes>
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <p>Ingredient editor</p>
          </RequireAdmin>
        }
      />
    </Routes>,
    '/admin',
  )

  expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument()
  expect(screen.queryByText('Ingredient editor')).toBeNull()
})

test('signing in returns you to the page you were bounced off', async () => {
  mockFetch({
    '/auth/refresh': () => json({ detail: 'Missing refresh cookie' }, 401),
    '/auth/login': () => json(session),
  })

  // Two routes are the minimum needed to prove the round trip: with only "/" protected,
  // "back where you came from" and "home" are the same place and prove nothing.
  renderWithProviders(
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <LoginPage />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/stock"
        element={
          <RequireAuth>
            <p>Kitchen shelf</p>
          </RequireAuth>
        }
      />
    </Routes>,
    '/stock',
  )

  const form = await screen.findByTestId('login-page')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@herbatka.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } })
  fireEvent.submit(form)

  expect(await screen.findByText('Kitchen shelf')).toBeInTheDocument()
})

import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import type { Location } from 'react-router'

import App from '../App'
import { useAuth } from '../features/auth/auth-context'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { HomePage } from '../features/home/HomePage'
import { ForbiddenPage } from './ForbiddenPage'

/** What the guards stash in router state so the login page can send you back. */
type FromState = { from?: Location } | null

function useSignedInTarget(): string {
  const { state } = useLocation()
  const from = (state as FromState)?.from
  return from ? `${from.pathname}${from.search}` : '/'
}

/**
 * Gate for anything that needs a session.
 *
 * The `isLoading` branch renders nothing rather than redirecting, and that is the whole
 * trick: on a hard reload we do not yet know whether the refresh cookie is good, so
 * redirecting would throw a signed-in user at /login and then yank them back.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

/** Same gate, plus the role check. Unused until M2 puts the admin catalog behind it. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (user.role !== 'admin') return <ForbiddenPage />
  return children
}

/** The mirror image, for /login and /register. It also owns the post-login redirect —
 *  the forms just call login() and let this decide where that lands. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const target = useSignedInTarget()

  if (isLoading) return null
  if (user) return <Navigate to={target} replace />
  return children
}

/** Split out from AppRouter so tests can mount the same routes in a MemoryRouter. */
export function AppRoutes() {
  return (
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
        path="/register"
        element={
          <RedirectIfSignedIn>
            <RegisterPage />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      {/* The M0 status page, still reachable on its own and still public. */}
      <Route path="/health" element={<App />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

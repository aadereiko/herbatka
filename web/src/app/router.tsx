import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import type { Location } from 'react-router'

import App from '../App'
import { AdminHomePage } from '../features/admin/AdminHomePage'
import { AdminIngredientsPage } from '../features/admin/AdminIngredientsPage'
import { AdminShopsPage } from '../features/admin/AdminShopsPage'
import { AdminTeasPage } from '../features/admin/AdminTeasPage'
import { useAuth } from '../features/auth/auth-context'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { IngredientListPage } from '../features/catalog/IngredientListPage'
import { TeaDetailPage } from '../features/catalog/TeaDetailPage'
import { TeaListPage } from '../features/catalog/TeaListPage'
import { FavouritesPage } from '../features/favourite/FavouritesPage'
import { FriendsPage } from '../features/friend/FriendsPage'
import { HomePage } from '../features/home/HomePage'
import { HouseholdDetailPage } from '../features/household/HouseholdDetailPage'
import { HouseholdListPage } from '../features/household/HouseholdListPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SettingsPage } from '../features/profile/SettingsPage'
import { MyReviewsPage } from '../features/review/MyReviewsPage'
import { ShopDetailPage } from '../features/shop/ShopDetailPage'
import { ShopListPage } from '../features/shop/ShopListPage'
import { ConsumptionPage } from '../features/stock/ConsumptionPage'
import { StockItemPage } from '../features/stock/StockItemPage'
import { ForbiddenPage } from './ForbiddenPage'

/**
 * The OCR workbench, and the one route in the app that is not shipped.
 *
 * `import.meta.env.DEV` rather than an admin guard, and the difference matters: Vite
 * substitutes the literal `false` here in a production build, the conditional folds away,
 * and Rollup then drops the only `import()` of `dev/` — with it tesseract.js, a 2.9 MB
 * WASM core and every byte of the bench. An admin-only route would still be in the bundle,
 * just unreachable.
 *
 * The ternary rather than putting `lazy()` inside the JSX guard is deliberate too. A
 * top-level `const x = lazy(() => import(…))` is a call Rollup cannot prove is pure, so it
 * survives tree-shaking even when `x` is unreferenced — and the dynamic import inside it
 * survives with it, emitting the chunk. `false ? lazy(…) : null` folds to `null` before
 * that can happen.
 */
const OcrBenchPage = import.meta.env.DEV ? lazy(() => import('../dev/ocr/OcrBenchPage')) : null


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

/** Same gate, plus the role check. This is what /admin/* sits behind. */
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
        // Public. HomePage renders a dashboard when you are signed in and a landing
        // page when you are not — sending a stranger straight to /login would hide the
        // catalog, which is browsable without an account and is the best argument for
        // making one.
        element={<HomePage />}
      />

      {/* The catalog is deliberately outside RequireAuth. Browsing what a tea is made of
          needs no account, and a public catalog is the thing that makes an empty account
          worth creating in the first place. */}
      <Route path="/teas" element={<TeaListPage />} />
      <Route path="/teas/:slug" element={<TeaDetailPage />} />
      <Route path="/ingredients" element={<IngredientListPage />} />

      {/* Public for the same reason the catalog is, and more so: "where can I buy this"
          is the question somebody arrives with, and putting it behind a sign-up is how
          they leave again. Only the buy button needs an account, because only it needs a
          shelf to put the tin on. */}
      <Route path="/shops" element={<ShopListPage />} />
      <Route path="/shops/:slug" element={<ShopDetailPage />} />

      {/* Reading reviews needs no account; the list of *yours* is the one page in this
          feature that does. `/reviews/mine` is the endpoint's own name, and a URL that
          matches the API is one less thing to remember. */}
      <Route
        path="/reviews/mine"
        element={
          <RequireAuth>
            <MyReviewsPage />
          </RequireAuth>
        }
      />

      {/* Your stars, both kinds. Signed-in only for the same reason `/reviews/mine` is:
          every favourites endpoint answers relative to the caller, so there is no
          signed-out version of this page to fall back to. */}
      <Route
        path="/favourites"
        element={
          <RequireAuth>
            <FavouritesPage />
          </RequireAuth>
        }
      />

      {/* Public, and it has to be: a review carries a name, and a name that only becomes
          clickable once you have an account is a dead end for exactly the visitor who has
          not made one yet. The server answers the same document minus `friend_state`. */}
      <Route path="/users/:id" element={<ProfilePage />} />

      {/* Your own half of the same thing. No id in the path — PATCH /auth/me has no
          version that edits somebody else. */}
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />

      {/* Means nothing to a stranger: every M5 endpoint answers relative to the caller
          — who *your* friends are, what *you* are allowed to see — so there is no
          signed-out version of this page to fall back to.

          `/feed` used to sit beside it and is gone. The home page shows the head of the
          same timeline, which turned out to be as much of it as anybody read; the
          endpoint behind it is untouched, so restoring the page is a route and a
          screen. */}
      <Route
        path="/friends"
        element={
          <RequireAuth>
            <FriendsPage />
          </RequireAuth>
        }
      />

      {/* Households are the opposite of the catalog: a shared shelf is only meaningful
          for somebody with an account, and the API answers 404 rather than 403 for a
          household you are not in — so there is nothing here to show a stranger. */}
      <Route
        path="/households"
        element={
          <RequireAuth>
            <HouseholdListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/households/:id"
        element={
          <RequireAuth>
            <HouseholdDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/households/:id/stock/:itemId"
        element={
          <RequireAuth>
            <StockItemPage />
          </RequireAuth>
        }
      />
      {/* Behind the same guard as the shelf it summarises, and the server checks
          membership again on the endpoint. Who has been drinking what is the most private
          thing this app computes, so it is gated in both places rather than either. */}
      <Route
        path="/households/:id/consumption"
        element={
          <RequireAuth>
            <ConsumptionPage />
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminHomePage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/teas"
        element={
          <RequireAdmin>
            <AdminTeasPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/ingredients"
        element={
          <RequireAdmin>
            <AdminIngredientsPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/shops"
        element={
          <RequireAdmin>
            <AdminShopsPage />
          </RequireAdmin>
        }
      />

      {/* The M0 status page, still reachable on its own and still public. */}
      <Route path="/health" element={<App />} />

      {/* Dev only, and deliberately not in any menu — see the note on `OcrBenchPage`. */}
      {OcrBenchPage && (
        <Route
          path="/dev/ocr"
          element={
            <Suspense fallback={null}>
              <OcrBenchPage />
            </Suspense>
          }
        />
      )}
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

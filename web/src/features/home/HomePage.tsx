import { useState } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../auth/auth-context'
import { HealthCard } from '../health/HealthCard'

function ShelfLink({ to, title, blurb }: { to: string; title: string; blurb: string }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-brand-200 p-3 transition hover:border-brand-400 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{title}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{blurb}</p>
    </Link>
  )
}

export function HomePage() {
  const { user, logout } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await logout()
    setSigningOut(false)
  }

  // RequireAuth guarantees a user; this narrows the type rather than asserting it.
  if (!user) return null

  return (
    <main className="min-h-dvh bg-brand-50 p-6 dark:bg-neutral-950">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <section className="flex w-full max-w-md items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Signed in as
            </p>
            <h1
              data-testid="home-greeting"
              className="truncate text-xl font-semibold text-brand-900 dark:text-brand-100"
            >
              {user.display_name}
            </h1>
            <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
            <span
              data-testid="role-badge"
              className="mt-2 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-100"
            >
              {user.role}
            </span>
          </div>
          <button
            type="button"
            data-testid="sign-out"
            onClick={handleSignOut}
            disabled={signingOut}
            className="shrink-0 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-brand-200 dark:hover:bg-neutral-800"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>

        {/* First on the page, above the kitchen and the catalog.
            The brief allowed either embedding the feed here or linking to it
            prominently; linking won. This page is not a `PageShell` — it is its own
            narrow, centred layout with the session card at the top — so inlining a
            paginated stream would mean either rebuilding the feed at half width or
            rebuilding this page around it. A pair of links at the very top, above
            everything else, is not "buried", and the nav carries /feed on every screen
            besides. */}
        <nav
          aria-label="People"
          className="w-full max-w-md space-y-3 rounded-2xl border border-brand-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            People
          </h2>
          <ShelfLink
            to="/feed"
            title="Activity"
            blurb="What your friends rated, and what landed on your shelves."
          />
          <ShelfLink
            to="/friends"
            title="Friends"
            blurb="Requests waiting, and people to add."
          />
        </nav>

        <nav
          aria-label="Kitchen"
          className="w-full max-w-md space-y-3 rounded-2xl border border-brand-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Kitchen
          </h2>
          {/* First, and on its own: this is the thing somebody opens the app to do, and
              the catalog is what they consult while doing it. */}
          <ShelfLink
            to="/households"
            title="Households"
            blurb="Your shared shelves — what is left of what."
          />
        </nav>

        <nav
          aria-label="Catalog"
          className="w-full max-w-md space-y-3 rounded-2xl border border-brand-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Catalog
          </h2>
          <ShelfLink to="/teas" title="Browse teas" blurb="Search, filter and suggest new ones." />
          <ShelfLink
            to="/reviews/mine"
            title="Your reviews"
            blurb="What you thought of everything you have tried."
          />
          <ShelfLink
            to="/ingredients"
            title="Ingredients"
            blurb="What the catalog is described with."
          />
          {/* The admin link is hidden rather than disabled for a normal user: an entry
              you can see but never use is a worse answer than no entry. RequireAdmin
              still guards the route itself — this is tidiness, not security. */}
          {user.role === 'admin' && (
            <ShelfLink
              to="/admin"
              title="Admin"
              blurb="Approve submissions and edit the vocabulary."
            />
          )}
        </nav>

        <HealthCard />
      </div>
    </main>
  )
}

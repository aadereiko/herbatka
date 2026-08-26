import { useState } from 'react'

import { useAuth } from '../auth/auth-context'
import { HealthCard } from '../health/HealthCard'

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

        <HealthCard />
      </div>
    </main>
  )
}

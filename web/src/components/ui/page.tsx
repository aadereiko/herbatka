import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

import { useAuth } from '../../features/auth/auth-context'
import { Button } from './button'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'rounded-lg bg-brand-100 px-2.5 py-1 text-sm font-semibold text-brand-900 dark:bg-neutral-800 dark:text-brand-100'
    : 'rounded-lg px-2.5 py-1 text-sm font-medium text-neutral-600 hover:bg-brand-50 hover:text-brand-800 dark:text-neutral-300 dark:hover:bg-neutral-800'
}

/**
 * The bar every catalog and admin page wears. `NavLink` sets `aria-current="page"` on
 * the active entry for free, which is the whole reason to use it over `Link`.
 *
 * The wordmark points at /teas for a signed-out visitor: "/" is behind RequireAuth, and
 * sending someone to a login screen for clicking a logo is a small betrayal.
 */
function SiteNav() {
  const { user } = useAuth()

  return (
    <header className="border-b border-brand-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 sm:px-6"
      >
        <Link
          to={user ? '/' : '/teas'}
          className="mr-auto flex items-center gap-2 text-base font-semibold text-brand-900 dark:text-brand-100"
        >
          <span role="img" aria-label="teacup">
            🍵
          </span>
          Herbatka
        </Link>
        {/* Signed-in only, and first: the catalog is browsing, the shelf is the job.
            RequireAuth guards the route itself — this is tidiness, not security. */}
        {user && (
          <NavLink to="/households" className={navClass} data-testid="nav-households">
            Households
          </NavLink>
        )}
        <NavLink to="/teas" className={navClass}>
          Teas
        </NavLink>
        <NavLink to="/ingredients" className={navClass}>
          Ingredients
        </NavLink>
        {/* After the catalog it belongs to, and signed-in only: /reviews/mine is behind
            RequireAuth, and an entry that only ever leads to a login screen is worse
            than no entry. */}
        {user && (
          <NavLink to="/reviews/mine" className={navClass} data-testid="nav-my-reviews">
            My reviews
          </NavLink>
        )}
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={navClass} data-testid="nav-admin">
            Admin
          </NavLink>
        )}
        {!user && (
          <NavLink to="/login" className={navClass}>
            Sign in
          </NavLink>
        )}
      </nav>
    </header>
  )
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-50 dark:bg-neutral-950">
      <SiteNav />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-brand-100">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        )}
      </div>
      {actions}
    </div>
  )
}

export function Panel({
  children,
  as: Tag = 'section',
  className = '',
  ariaLabel,
  testId,
}: {
  children: ReactNode
  as?: 'section' | 'div' | 'li'
  className?: string
  ariaLabel?: string
  testId?: string
}) {
  return (
    <Tag
      aria-label={ariaLabel}
      data-testid={testId}
      className={`rounded-2xl border border-brand-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  )
}

export type BadgeTone = 'brand' | 'neutral' | 'amber' | 'rose'

const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100',
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: BadgeTone
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-brand-100 dark:bg-neutral-800 ${className}`}
    />
  )
}

/**
 * A skeleton is decoration; a screen reader needs to be told the page is working. The
 * `role="status"` wrapper with an sr-only sentence is the whole reason this exists as a
 * component rather than a loop of divs at each call site.
 */
export function LoadingGrid({
  label,
  count = 6,
  testId,
  className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: {
  label: string
  count?: number
  testId?: string
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" data-testid={testId} className={className}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  testId,
  children,
}: {
  title: string
  testId?: string
  children?: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-dashed border-brand-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900"
    >
      <p className="text-base font-semibold text-brand-900 dark:text-brand-100">{title}</p>
      {children && (
        <div className="mt-2 space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
          {children}
        </div>
      )}
    </div>
  )
}

export function ErrorNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p
      role="alert"
      data-testid={testId}
      className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
    >
      {children}
    </p>
  )
}

/** Prev/next rather than numbered pages: the API hands us `page` and `pages` and nothing
 *  about the shape of the middle, and a phone has no room for twelve page numbers. */
export function Pagination({
  page,
  pages,
  onPageChange,
}: {
  page: number
  pages: number
  onPageChange: (page: number) => void
}) {
  if (pages <= 1) return null

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between gap-3"
      data-testid="pagination"
    >
      <Button onClick={() => onPageChange(page - 1)} disabled={page <= 1} testId="page-previous">
        ← Previous
      </Button>
      <p aria-live="polite" className="text-sm text-neutral-600 dark:text-neutral-400">
        Page {page} of {pages}
      </p>
      <Button onClick={() => onPageChange(page + 1)} disabled={page >= pages} testId="page-next">
        Next →
      </Button>
    </nav>
  )
}

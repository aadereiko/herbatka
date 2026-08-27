import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../../features/auth/auth-context'
import type { User } from '../../lib/api'
import { useIncomingRequestCount } from '../../features/friend/queries'
import { useIncomingInvitationCount } from '../../features/household/queries'
import { Avatar } from './avatar'
import { Button } from './button'
import { Menu, MenuButton, MenuLink } from './menu'

/**
 * A nav entry, and the one place in the app where "where am I" is worth shouting.
 *
 * Active is a pressed matcha tile with its own ink edge rather than the old pale
 * highlight: the bar is now a wooden beam, and a tint-on-tint highlight disappears
 * against grain. Cream on `brand-600` is 6.2:1, so the loudest state is also the most
 * readable one. Inactive text is `brand-800` rather than a grey — grey on timber reads
 * as a rendering fault.
 */
function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'btn btn-md btn-primary font-semibold'
    : 'btn btn-md btn-quiet'
}

/**
 * The count of requests waiting on you, as a badge on the Friends entry.
 *
 * This is the one number in the app somebody scans the nav *for*, so it lives where they
 * are already looking rather than only on the page they would have to remember to visit.
 * Nothing is rendered at zero: a permanent "0" is a badge people learn to stop seeing,
 * and the whole value of this one is that its presence means something.
 *
 * `useIncomingRequestCount` is `enabled` on having a session, which matters here and
 * nowhere else in the feature: the nav renders on the public catalog pages too, and a
 * signed-out visitor must not be firing an authenticated request on every page load.
 */
function IncomingBadge() {
  const count = useIncomingRequestCount()
  if (count === 0) return null

  return (
    <span
      data-testid="nav-friends-badge"
      aria-label={`${count} friend ${count === 1 ? 'request' : 'requests'} waiting`}
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white"
    >
      {count}
    </span>
  )
}

/** The same badge for a household you have been invited to join. Same `isSignedIn` gate
 *  as the one above, and for the same reason: the nav renders on the public catalog pages
 *  and a signed-out visitor must not be firing an authenticated request on every load. */
function InvitationsBadge() {
  const count = useIncomingInvitationCount()
  if (count === 0) return null

  return (
    <span
      data-testid="nav-households-badge"
      aria-label={`${count} household ${count === 1 ? 'invitation' : 'invitations'} waiting`}
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white"
    >
      {count}
    </span>
  )
}

/**
 * Teas, Ingredients, Shops — the three public browsing screens, behind one entry.
 *
 * They were three top-level items out of eight, and eight wrapped onto two lines on
 * anything narrower than a laptop. Grouping them is not only a space saving: they are the
 * one part of the app that means the same thing signed in or out, and collapsing them
 * leaves the top level to the things that are *yours*.
 */
function CatalogMenu() {
  return (
    <Menu trigger={<span>Catalog</span>} triggerTestId="nav-catalog" menuTestId="catalog-menu">
      <MenuLink to="/teas" testId="nav-teas">
        Teas
      </MenuLink>
      <MenuLink to="/ingredients" testId="nav-ingredients">
        Ingredients
      </MenuLink>
      {/* A shop is the other half of "what is this tea" — the half that answers where to
          get it — so it belongs with the catalog rather than beside the feed. */}
      <MenuLink to="/shops" testId="nav-shops">
        Shops
      </MenuLink>
    </Menu>
  )
}

/**
 * You, and everything that is about you.
 *
 * This replaces the bare "Sasha  Sign out" pair. Sign out was the only account action
 * that had anywhere to live, so it sat in the bar next to a name that did nothing; now
 * the name is the button and the actions are behind it, which is where anybody who has
 * used a web application in the last fifteen years will look for them.
 *
 * "Your reviews" is here rather than in the target shape's four items, and deliberately:
 * `/reviews/mine` is a signed-in page about your own writing, so it belongs with your
 * profile and your settings. Dropping it from the nav entirely would have left the route
 * reachable only by typing the URL.
 *
 * The display name stays in the DOM at every width and truncates with CSS rather than
 * being hidden below `sm`. A trigger that is an unlabelled 24px circle on a phone is a
 * button a screen reader announces as nothing at all.
 */
function AccountMenu({ user }: { user: User }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <Menu
      align="right"
      triggerTestId="account-menu"
      menuTestId="account-menu-items"
      triggerClassName="max-w-40"
      trigger={
        <>
          <Avatar
            src={user.avatar_url}
            name={user.display_name}
            size="xs"
            testId="nav-account-avatar"
          />
          <span className="max-w-20 truncate sm:max-w-32">{user.display_name}</span>
        </>
      }
    >
      <MenuLink to={`/users/${user.id}`} testId="nav-profile">
        Your profile
      </MenuLink>
      <MenuLink to="/reviews/mine" testId="nav-my-reviews">
        Your reviews
      </MenuLink>
      {/* Beside your reviews rather than beside the catalog: a star is a fact about you,
          not about the tea, and the page it opens is a page of your own things. */}
      <MenuLink to="/favourites" testId="nav-favourites">
        Your favourites
      </MenuLink>
      <MenuLink to="/settings" testId="nav-settings">
        Settings
      </MenuLink>
      {user.role === 'admin' && (
        <MenuLink to="/admin" testId="nav-admin">
          Admin
        </MenuLink>
      )}
      <MenuButton
        testId="sign-out"
        onClick={() => {
          void logout().then(() => navigate('/'))
        }}
      >
        Sign out
      </MenuButton>
    </Menu>
  )
}

/**
 * The bar every page wears: eight flat items, regrouped into four plus you.
 *
 * `NavLink` sets `aria-current="page"` on the active entry for free, which is the whole
 * reason to use it over `Link`. The wordmark points at /teas for a signed-out visitor:
 * sending someone to a sign-in screen for clicking a logo is a small betrayal.
 *
 * The row is `🍵 Herbatka … Activity Households Friends[badge] Catalog ▾ … [avatar] Name ▾`
 * signed in, and `🍵 Herbatka … Catalog ▾ Sign in` signed out. Activity leads because it
 * is the thing that changes without you; everything after it is somewhere you go on
 * purpose. RequireAuth guards the routes themselves — this ordering is tidiness, not
 * security.
 *
 * **Below `sm`** the four primary entries collapse behind a hamburger and stack full
 * width, while the wordmark and the account menu stay on the bar. Two reasons for that
 * split rather than sweeping everything into the panel: the avatar is how you confirm
 * which account you are in, which is worth a permanent 24px; and a second copy of the
 * account items inside the panel would be two of every menu item in the DOM, which is
 * how "Sign out" ends up ambiguous to a screen reader and to a test.
 *
 * Signed out there is no hamburger at all — two items fit at 320px, and a disclosure
 * button that reveals one link is a control that costs more than it saves.
 *
 * The panel is ordered last on a phone (`order-last`) and back in place at `sm`, so the
 * links appear below the bar rather than shoving the account menu onto a third line.
 */
function SiteNav() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // A panel that survives the navigation it caused would hang over the new page.
  // Adjusted during render rather than in an effect, for the reason `menu.tsx` gives.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  return (
    // The beam the shop sign hangs off: a band of lighter timber with grain (free, from
    // `bg-brand-100`), a thick ink underline, and the house drop shadow so the bar sits
    // *on* the room rather than being a hairline drawn across it. It stays lighter than
    // the ground in both schemes — by night that reads as the one lit surface.
    <header className="border-b-[3px] border-brand-800/50 bg-brand-100 shadow-sm dark:border-neutral-950 dark:bg-neutral-900">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:px-6"
      >
        <Link
          to={user ? '/' : '/teas'}
          className="mr-auto flex items-center gap-2 text-lg font-bold text-brand-900 dark:text-brand-50"
        >
          <span
            role="img"
            aria-label="teacup"
            // The cup gets a little wooden coaster of its own. It is the app's only logo,
            // and a bare emoji beside bold text reads as a stray character.
            className="grid size-8 place-items-center rounded-full border border-brand-800/60 bg-white text-base shadow-2xs dark:border-neutral-950 dark:bg-neutral-800"
          >
            🍵
          </span>
          Herbatka
        </Link>

        {user && (
          <button
            type="button"
            data-testid="nav-toggle"
            aria-expanded={open}
            aria-controls="nav-primary"
            onClick={() => setOpen((value) => !value)}
            className="btn btn-sm btn-secondary text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:hidden"
          >
            <span aria-hidden="true">☰</span>
            <span className="sr-only">Menu</span>
          </button>
        )}

        <div
          id="nav-primary"
          data-testid="nav-primary"
          // Signed out this group is one entry with no hamburger to reveal it, so it is
          // never collapsed and never reordered — the mobile machinery is for the four.
          className={
            user
              ? `${open ? 'flex' : 'hidden'} order-last w-full basis-full flex-col items-stretch gap-1 sm:order-none sm:flex sm:w-auto sm:basis-auto sm:flex-row sm:items-center sm:gap-2`
              : 'flex items-center gap-2'
          }
        >
          {user && (
            <NavLink to="/feed" className={navClass} data-testid="nav-feed">
              Activity
            </NavLink>
          )}
          {user && (
            <NavLink to="/households" className={navClass} data-testid="nav-households">
              Households
              <InvitationsBadge />
            </NavLink>
          )}
          {user && (
            <NavLink to="/friends" className={navClass} data-testid="nav-friends">
              Friends
              <IncomingBadge />
            </NavLink>
          )}
          <CatalogMenu />
        </div>

        {user ? (
          <AccountMenu user={user} />
        ) : (
          <NavLink to="/login" className={navClass} data-testid="nav-sign-in">
            Sign in
          </NavLink>
        )}
      </nav>
    </header>
  )
}

/** `wood-ground` rather than `bg-brand-50 dark:bg-neutral-950`: the utility carries both
 *  colours *and* the grain, plank seams and night lamp, and pairing it with the colour
 *  utilities would knock its own background-image out. See the note on it in index.css. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="wood-ground min-h-dvh">
      <SiteNav />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

export function PageHeading({
  title,
  subtitle,
  actions,
  leading,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** A picture, in practice — the household's or the shop's, beside its name rather than
   *  floating above it. A slot here rather than a second heading component: the margins,
   *  the wrapping and the actions row are the parts nobody wants two versions of. */
  leading?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {leading}
        <div>
          {/* One brush stroke under the title, on every page, from one place. It is the
              app's only ornament, and it is here rather than on each page for the usual
              reason: a signature that half the screens are missing is not a signature.
              The subtitle drops to `mt-3` to clear the stroke, which hangs below the
              heading's box. */}
          <h1 className="brush-underline text-2xl font-bold text-brand-900 dark:text-brand-50 sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
      </div>
      {actions}
    </div>
  )
}

export type PanelTone = 'paper' | 'wood'

/**
 * Paper is a card you read; wood is a card you read *past*.
 *
 * Two tones rather than one because the app kept reaching for
 * `rounded-xl bg-brand-50 p-3` by hand whenever something needed to sit visibly *inside*
 * a card — a brewing table, a picked-shop row, a note above a list — and once every
 * surface is textured, a paper card nested inside a paper card is invisible. Timber for
 * the inner one solves it in a way a shade of grey no longer can.
 */
const PANEL_TONES: Record<PanelTone, string> = {
  paper: 'border-brand-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
  wood: 'border-brand-300/70 bg-brand-50 dark:border-neutral-700 dark:bg-neutral-800',
}

export function Panel({
  children,
  as: Tag = 'section',
  tone = 'paper',
  className = '',
  ariaLabel,
  testId,
}: {
  children: ReactNode
  as?: 'section' | 'div' | 'li'
  /** `wood` for a panel nested inside another panel. Default `paper`. */
  tone?: PanelTone
  className?: string
  ariaLabel?: string
  testId?: string
}) {
  return (
    <Tag
      aria-label={ariaLabel}
      data-testid={testId}
      className={`rounded-2xl border p-4 shadow-sm ${PANEL_TONES[tone]} sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  )
}

export type BadgeTone = 'brand' | 'neutral' | 'amber' | 'rose'

/** Drawn edges, like everything else — but at 1.5px, set explicitly so the house-wide
 *  2px `border` does not apply. A 2px outline around an 18px-tall pill is a black olive,
 *  and a tea card wears four of these at once. */
const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'border-brand-300/60 bg-brand-100 text-brand-800 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100',
  neutral:
    'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  amber: 'border-amber-300/70 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  rose: 'border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
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
      className={`inline-block rounded-full border-[1.5px] px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-brand-100 dark:bg-neutral-800 ${className}`}
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
          className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
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
      // An empty tray rather than an empty card: timber under a chunky dashed edge, so
      // "there is nothing here yet" looks like a place waiting for something rather than
      // like a card that failed to load.
      className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-8 text-center dark:border-neutral-600 dark:bg-neutral-900"
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
      className="note-error"
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

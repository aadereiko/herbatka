import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../../features/auth/auth-context'
import type { User } from '../../lib/api'
import { useIncomingRequestCount } from '../../features/friend/queries'
import { useIncomingInvitationCount } from '../../features/household/queries'
import { Avatar } from './avatar'
import { TeaBranch, TeaSprigMark, TeapotMark } from './botanical'
import { Button } from './button'
import { Menu, MenuButton, MenuLink } from './menu'
import { ThemeToggle } from './theme'

/**
 * A nav entry, and the one place in the app where "where am I" is worth shouting.
 *
 * Active used to be a filled `btn-primary` tile. It is now `btn-current` — pale mint with
 * a leaf rule under it — for a reason that only appeared once the primary button grew
 * letterspaced caps: caps and tracking make a word measurably wider, so the current entry
 * would have been a different width from the same word when inactive, and the whole bar
 * would have shuffled sideways on every navigation. `btn-current` draws its rule with an
 * inset box-shadow, which takes no space at all.
 *
 * Mint against sage is 4.6:1 apart, so the state is visible without the rule; and
 * `NavLink` sets `aria-current="page"` regardless, so it is not carried by colour alone.
 */
function navClass({ isActive }: { isActive: boolean }): string {
  // `btn-sm` below `sm` and `btn-md` from there up. The bar carries one more control than
  // it used to — the theme toggle — and at 390px the four items measured 366px against
  // 304px of room, so it wrapped onto two lines. Everything here is a step in getting it
  // back onto one; see the note on the `<nav>` for the arithmetic.
  const shape = 'btn btn-sm sm:btn-md text-xs uppercase tracking-wide'
  return isActive ? `${shape} btn-current font-semibold` : `${shape} btn-quiet font-medium`
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
      // Caps are on the shared `Menu` trigger for the nav's sake, and undone here: this
      // trigger contains a *person's name*, and shouting somebody's name at them is not a
      // design decision. Exactly the trap `btn-primary` documents for the same reason.
      triggerClassName="max-w-40 normal-case tracking-normal"
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
 * The row is `[sign] Herbatka … Households Friends[badge] Catalog ▾ … ☾ [avatar] Name ▾`
 * signed in, and `[sign] Herbatka … Catalog ▾ ☾ Sign in` signed out. Activity used to lead
 * it and no longer exists as a page: the home page carries the head of that timeline, and
 * a nav entry pointing at a fuller version of what the landing page already shows was one
 * click to see the same thing again. The lamp switch is last in both, outside the
 * collapsing group. RequireAuth guards the routes themselves — this ordering is tidiness,
 * not security.
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
    // Two rows, both pinned: a thin strip of secondary links and the bar proper.
    //
    // There was a third — a green band carrying the app's one line of copy — and it is
    // gone. A coloured strip that says the same sentence on every screen is one people
    // learn to stop seeing, and it was costing 32px of pinned height on every page to do
    // it. The home page still says the same thing, once, where somebody is actually
    // reading.
    //
    // `z-30` clears the page content and the `Menu` panels that hang off the bar.
    <header data-testid="site-header" className="sticky top-0 z-30">
      {/* Hidden below `sm`. Both rows are pinned, so every pixel here is a pixel of phone
          screen the reader never gets back — and both of these links are also in the
          Catalog menu one row down, so nothing is actually lost. */}
      <div className="hidden border-b border-brand-100 bg-white dark:border-neutral-800 dark:bg-neutral-900 sm:block">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-5 px-4 py-1.5 sm:px-6">
          <Link
            to="/ingredients"
            className="text-xs text-neutral-500 hover:text-brand-900 dark:text-neutral-400 dark:hover:text-brand-100"
          >
            Ingredients
          </Link>
          <Link
            to="/shops"
            className="text-xs text-neutral-500 hover:text-brand-900 dark:text-neutral-400 dark:hover:text-brand-100"
          >
            Shops
          </Link>
        </div>
      </div>

      <div className="border-b border-brand-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <nav
          aria-label="Main"
          // Three columns rather than a flex row with auto margins: the middle one is
          // *centred in the page*, not centred in whatever space the other two leave, and
          // those are different layouts the moment the wordmark and the account menu are
          // different widths — which they always are, because one of them is a person's
          // name. Below `lg` it collapses to the old two-row behaviour.
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]"
        >
          <Link
            to={user ? '/' : '/teas'}
            className="mr-auto flex items-center gap-2.5 text-brand-900 dark:text-brand-50 lg:mr-0"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-200 sm:size-9"
            >
              <TeaSprigMark className="size-5 text-leaf-700 sm:size-6" />
            </span>
            {/* The wordmark wears the heading serif, mixed case.
                
                It was the body sans in tracked caps, which is the same treatment the nav
                entries beside it get — so the shop's name read as one more UI label
                rather than as a mark. Putting it in the display face and dropping the
                caps is what separates the two: everything else on this bar is a control,
                and this is the only thing that is a name. */}
            <span className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              Herbatka
            </span>
          </Link>

          {user && (
            <button
              type="button"
              data-testid="nav-toggle"
              aria-expanded={open}
              aria-controls="nav-primary"
              onClick={() => setOpen((value) => !value)}
              className="btn btn-sm btn-secondary text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
            >
              <span aria-hidden="true">☰</span>
              <span className="sr-only">Menu</span>
            </button>
          )}

          <div
            id="nav-primary"
            data-testid="nav-primary"
            className={
              user
                ? `${open ? 'flex panel-in' : 'hidden'} order-last w-full basis-full flex-col items-stretch gap-1 border-t border-brand-100 pt-2 dark:border-neutral-800 lg:order-none lg:flex lg:w-auto lg:basis-auto lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:pt-0`
                : 'flex items-center gap-1'
            }
          >
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

          <span className="flex items-center justify-end gap-1">
            <ThemeToggle />
            {user ? (
              <AccountMenu user={user} />
            ) : (
              <NavLink to="/login" className={navClass} data-testid="nav-sign-in">
                Sign in
              </NavLink>
            )}
          </span>
        </nav>
      </div>

    </header>
  )
}

/** `page-ground` rather than a bare `bg-neutral-950`: `body` carries the same colour so
 *  the overscroll bounce is not a white flash, and two places holding one value want a
 *  name between them. It used to be `wood-ground` and carried grain, plank seams and a
 *  lamp as well; all three went with the timber. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-ground min-h-dvh">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
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
          <h1 className="title-rule text-2xl font-bold text-brand-900 dark:text-brand-50 sm:text-3xl">
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

export type PanelTone = 'surface' | 'inset'

/**
 * A surface is a card you read; an inset is a card you read *past*.
 *
 * Two tones rather than one because the app kept reaching for `bg-brand-50 p-3` by hand
 * whenever something needed to sit visibly *inside* a card — a brewing table, a
 * picked-shop row, a note above a list — and a card nested inside a card at the same
 * value is invisible. The inner one goes *down* to the page ground rather than up to a
 * tint: the app's tint value, `neutral-800`, doubles as the rule colour and so has to
 * stay bright enough that secondary copy on it measures 3.82.
 *
 * They were called `paper` and `wood`, which meant something when the app was a timber
 * tea house and means nothing now.
 */
const PANEL_TONES: Record<PanelTone, string> = {
  // Paper. `paper-grain` is the only thing new here and it is one word: the utility puts
  // a masked noise tile behind the content on a `::before`, which is why thirteen card
  // components gained a texture without any of them gaining an element.
  surface: 'paper-grain border-brand-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900',
  // Timber: the shelf the paper is lying on. No grain — this tone is almost always
  // *behind* something, and two textures stacked read as dirt rather than as depth.
  inset: 'border-brand-300/70 bg-brand-50 dark:border-neutral-700 dark:bg-neutral-950',
}

export function Panel({
  children,
  as: Tag = 'section',
  tone = 'surface',
  className = '',
  ariaLabel,
  testId,
}: {
  children: ReactNode
  as?: 'section' | 'div' | 'li'
  /** `inset` for a panel nested inside another panel. Default `surface`. */
  tone?: PanelTone
  className?: string
  ariaLabel?: string
  testId?: string
}) {
  return (
    <Tag
      aria-label={ariaLabel}
      data-testid={testId}
      // `rounded-2xl` and `shadow-sm` were dead classes under the previous design — every
      // radius token was 0 and every shadow token transparent — and were kept anyway, on
      // the argument that the day somebody wanted a corner back, one token would bring all
      // thirteen call sites with it. That day is this one: the radius tokens are small
      // again and the shadows are a short warm cast, so these two words now do the work
      // that thirteen files would otherwise have had to be edited to do.
      className={`rounded-2xl border p-4 ${PANEL_TONES[tone]} sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  )
}

export type BadgeTone = 'brand' | 'neutral' | 'amber' | 'rose'

/** Pills with a 1px edge. They were square, which suited a design drawn with a ruler and
 *  a pen; nothing else in this one has a hard corner any more, and a tea card wears four
 *  of these at once, so a square badge was four hard corners per card against a page with
 *  none. `rounded-full` rather than a token step: a badge is two lines of text tall, and
 *  at that height anything short of a full round reads as a mistake. */
const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'border-brand-300/60 bg-brand-100 text-brand-800 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100',
  neutral:
    'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300',
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
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
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
          className="paper-grain space-y-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
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
      className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-8 text-center dark:border-neutral-600 dark:bg-neutral-950"
    >
      {/* A pot left out on the empty shelf. The one drawing in the app that appears
          because there is *nothing* to show, which is the place the brief asks
          illustration to go — the empty space, not behind the paragraphs. Faint on
          purpose: it is furniture, and the sentence under it is the message. */}
      <TeapotMark className="mx-auto mb-3 h-12 w-14 text-brand-300 opacity-60" />
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

/**
 * A small stamped heading for a band of the page: `FEATURED TEAS`, `WELL THOUGHT OF`.
 *
 * The app already had eighteen letterspaced small-caps eyebrows written by hand as
 * `text-xs uppercase tracking-wide`, which is why this component takes that exact recipe
 * rather than inventing a new one — it is the existing mark, named, plus the short rule
 * that turns a label into a section boundary.
 *
 * `as` exists because half the places that want this are a real heading in the document
 * outline and half are a caption over a list that already has one. Rendering an `<h2>`
 * for the second kind would put a heading in the outline that says "PRICE".
 */
export function SectionLabel({
  children,
  as: Tag = 'h2',
  action,
}: {
  children: ReactNode
  as?: 'h2' | 'h3' | 'p'
  /** A link to the right of the label — "All activity →". */
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <Tag className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {children}
        <span
          aria-hidden="true"
          className="h-px w-8 bg-brand-200 dark:bg-neutral-700"
        />
      </Tag>
      {action}
    </div>
  )
}

/**
 * A cut branch lying across the seam between two bands of a page.
 *
 * Decoration, and the only piece in the app that exists purely to separate. It earns its
 * place on the long editorial pages — the signed-out home, a profile — and nowhere else;
 * a divider between every two elements is a page with a rash.
 *
 * `hidden sm:block` is not a detail. The brief is explicit that architectural decoration
 * is the first thing to go on a phone, and a 130px-wide drawing centred in a 320px column
 * is a third of the screen spent on a garnish.
 */
export function SectionDivider() {
  return (
    <div aria-hidden="true" className="my-8 hidden items-center gap-4 sm:flex">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-brand-200 dark:to-neutral-800" />
      <TeaBranch className="h-9 w-16 shrink-0 text-leaf-600 opacity-70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-brand-200 dark:to-neutral-800" />
    </div>
  )
}

/**
 * The mark on something somebody suggested that no admin has vouched for yet.
 *
 * Teas, shops and ingredients all carry `is_approved`, and all three used to be *hidden*
 * until it was true. They are listed now and marked instead, which is a better trade in
 * both directions: the person who suggested it can find what they added, and a reader
 * browsing the catalog is not quietly shown a filtered version of it.
 *
 * One component rather than three copies of a badge, because "pending" has to look
 * identical everywhere it appears — a reader learns the mark once, and three different
 * shapes for one state is three things to learn.
 *
 * `rose` rather than `amber`: amber is the caffeine badge, and a tea card can wear both
 * at once.
 */
export function PendingBadge() {
  return (
    <span data-testid="pending-badge">
      <Badge tone="rose">Awaiting review</Badge>
    </span>
  )
}

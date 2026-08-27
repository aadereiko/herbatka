import type { FavouriteKind } from '../../lib/favourite'
import { useAuth } from '../auth/auth-context'
import { useToggleFavourite } from './queries'

const SIZES = {
  sm: 'size-7 text-base',
  md: 'size-9 text-lg',
} as const

export type FavouriteStarSize = keyof typeof SIZES

/**
 * The star, on a tea card, a shop card and both detail pages.
 *
 * **Signed out it is not here at all.** Not a greyed-out star, not a star that opens a
 * sign-in prompt: a control that is visibly present and refuses to work is a small lie
 * told on every card in the grid, and the sign-in prompt already exists on the pages that
 * need one. The condition is the session rather than `is_favourite`, because those are
 * different questions — the server sends `false` to a stranger, which is indistinguishable
 * from "signed in, not starred".
 *
 * A real `<button>` with `aria-pressed`, so a screen reader gets the state from the
 * control rather than from a glyph it cannot see. The name says what pressing it will
 * *do* and names the thing it will do it to — "Add Jasmine Pearls to your favourites" —
 * because in a grid of twenty cards "Favourite" twenty times over is twenty identical
 * announcements. The glyph itself is `aria-hidden`: ★ and ☆ are read aloud as "black
 * star" and "white star" by some screen readers, which is noise on top of a state that
 * `aria-pressed` has already given.
 *
 * On a card this must be a *sibling* of the card's link rather than a child of it: the
 * whole card is one anchor, and a button nested inside an anchor is invalid markup that
 * navigates when you press it.
 */
export function FavouriteStar({
  kind,
  slug,
  name,
  isFavourite,
  size = 'sm',
}: {
  kind: FavouriteKind
  slug: string
  name: string
  isFavourite: boolean
  size?: FavouriteStarSize
}) {
  const { user } = useAuth()
  const toggle = useToggleFavourite(kind)

  if (!user) return null

  const label = isFavourite
    ? `Remove ${name} from your favourites`
    : `Add ${name} to your favourites`

  return (
    <button
      type="button"
      aria-pressed={isFavourite}
      aria-label={label}
      title={label}
      data-testid={`favourite-${kind}-${slug}`}
      onClick={() => toggle.mutate({ slug, next: !isFavourite })}
      className={`inline-flex items-center justify-center rounded-full border leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        SIZES[size]
      } ${
        isFavourite
          ? 'border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : 'border-brand-200 bg-white text-neutral-400 hover:text-amber-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500'
      }`}
    >
      <span aria-hidden="true">{isFavourite ? '★' : '☆'}</span>
    </button>
  )
}

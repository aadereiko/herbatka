/**
 * A person, or the stand-in for one.
 *
 * The sibling of `EntityImage`, and a separate component for one reason that matters: the
 * fallback. A tea with no picture gets a leaf, because one leaf looks like every other
 * leaf and that is fine — teas are told apart by the name under the card. People are not.
 * A wall of identical silhouettes in a members list, a friends list and a feed is a wall
 * that actively fights recognition, so the fallback here is the person's own initials on
 * a colour derived from their name: stable across every screen they appear on, different
 * from the person above them, and readable at 24px.
 *
 * Decorative throughout — `alt=""` on the photo, `aria-hidden` on the initials. Every
 * call site in the app puts the display name immediately beside it, so an accessible
 * name here would only make a screen reader read the person twice. The one place that
 * would otherwise lose the name is the nav's account trigger on a narrow screen, and it
 * keeps the name in the DOM and truncates it with CSS rather than removing it.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZES: Record<AvatarSize, string> = {
  xs: 'size-6 text-[0.6rem]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-20 text-2xl',
}

/**
 * Enough hues to make two adjacent rows differ, all of them at a contrast that survives
 * both themes. Not random and not per-session: the colour is a function of the name, so
 * the same person is the same colour on the feed, on their profile and in the nav — which
 * is the only thing that makes it worth having a colour at all.
 */
const TONES = [
  'bg-brand-200 text-brand-900 dark:bg-brand-900 dark:text-brand-100',
  'bg-amber-200 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  'bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-sky-200 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  'bg-violet-200 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
]

/** First letter of the first word, plus the first of the last — "Ada Lovelace" is AL,
 *  "Ada" is A. Spread rather than `charAt`, so a name starting with an emoji or an
 *  astral-plane character yields one whole character instead of half a surrogate pair. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

function toneOf(name: string): string {
  let total = 0
  for (const character of name) total = (total + (character.codePointAt(0) ?? 0)) % 4096
  return TONES[total % TONES.length]
}

export function Avatar({
  src,
  /** Used for the initials and the colour, never rendered as text on its own. */
  name,
  size = 'md',
  testId,
}: {
  src: string | null
  name: string
  size?: AvatarSize
  testId?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        data-testid={testId}
        loading="lazy"
        className={`${SIZES[size]} shrink-0 rounded-full object-cover`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className={`${SIZES[size]} ${toneOf(name)} inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none`}
    >
      {initialsOf(name)}
    </span>
  )
}

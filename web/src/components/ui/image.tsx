import { LeafMark } from './botanical'

/**
 * A picture of a thing, or the stand-in for one.
 *
 * Teas, shops and households all now have an optional `image_url`, and all three want
 * the identical behaviour: the picture when there is one, the leaf when there is not.
 * One component rather than three copies, because the interesting decisions here are
 * ones you only want to make once —
 *
 *  - **The same placeholder everywhere.** Two different stand-ins for "no picture yet"
 *    in one interface read as two different kinds of thing. M2 chose the leaf for teas;
 *    everything since keeps it.
 *  - **`aria-hidden` on the placeholder.** It carries no information, and a screen
 *    reader announcing "leaf" on every second card is noise sitting directly in front of
 *    the name, which is the thing the reader actually wants.
 *  - **`alt` is required and takes `''` explicitly.** An empty alt is right where the
 *    picture is inside a link whose text already names the thing — a card. It is wrong
 *    on a detail page, where the picture is content. Making the caller type one or the
 *    other is the point; defaulting it would silently pick wrong half the time.
 *  - **`loading="lazy"`.** These arrive in grids.
 *
 * Sizing stays with the caller: a card wants `h-32 w-full`, a header wants a square, and
 * baking either in would mean overriding it at every second call site.
 */
export function EntityImage({
  src,
  alt,
  className,
  testId,
}: {
  src: string | null
  /** `''` when the surrounding link or heading already names the thing. */
  alt: string
  className: string
  testId?: string
}) {
  if (!src) {
    return (
      <div
        aria-hidden="true"
        data-testid={testId ? `${testId}-placeholder` : undefined}
        // The ground colour rather than a tint, so a missing picture reads as a recess cut
        // into the card — a shelf with nothing on it — rather than as a block sitting on
        // it. It also keeps the one focus ring that lands on top of a card image, the
        // favourite star, off `neutral-800`, which is the one surface `brand-500` does not
        // clear 3:1 against.
        className={`grid place-items-center bg-brand-100 dark:bg-neutral-800 ${className}`}
      >
        {/* Was the 🍃 emoji, which was three problems in one glyph: it is a different
            drawing on every platform, it is full-colour on a page whose whole point is
            that it looks hand-painted, and at the 32px a card renders it, Apple's version
            is a glossy green blob. `LeafMark` is the app's own leaf, inks itself from
            `currentColor`, and is the same 500 bytes on every machine. */}
        <LeafMark className="size-12 text-leaf-600 opacity-45" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      data-testid={testId}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  )
}

import type { CSSProperties, ReactNode } from 'react'

/**
 * The drawings.
 *
 * Every illustration in the app is inline SVG in this one file, and each of them
 * is built the same way — which is worth explaining once here rather than
 * thirty times below.
 *
 * ## How a drawing is made
 *
 * Two layers, in this order:
 *
 *   1. **the wash** — the same silhouette, filled, at low opacity, and nudged a
 *      pixel or two off the outline it belongs to.
 *   2. **the ink** — an unfilled stroke with round caps and joins.
 *
 * The offset is the entire trick, and it is not a mistake left in. Gouache laid
 * inside a pen line never lands exactly on it; a fill that registers perfectly
 * with its outline is the thing that makes vector art look like vector art. Two
 * pixels of misregistration is the difference between "drawn" and "generated",
 * and it costs nothing.
 *
 * There are no `<filter>` elements, deliberately. A soft blur on the wash would
 * look better in isolation and would also mean the browser rasterising a filter
 * region per instance — and `LeafMark` appears twenty-four times on one screen,
 * once per tea in the grid. Offset flat colour reads as hand-painted at every
 * size the app uses it and stays cheap enough to put in a list.
 *
 * ## Colour
 *
 * The ink is `currentColor`, so a drawing takes the colour of the type around it
 * and both themes are handled by the same rule that handles the text. The wash
 * is a `leaf-*` or `brand-*` token, quoted through `var()` rather than a class,
 * because SVG `fill` is not a Tailwind text colour and pretending otherwise
 * leads to `[fill:var(--color-leaf-300)]` at every call site.
 *
 * ## Accessibility
 *
 * All of these are decoration and every one is `aria-hidden`. The rule the app
 * follows is that a drawing never carries information a sighted reader would not
 * also get from the words beside it — a tea card's leaf is not "a leaf", it is
 * "no photograph yet", and the tea's name is already the link text. Where an
 * illustration *is* content (the detail page's product plate) the caller
 * supplies a real `<img alt>` instead of reaching for one of these.
 */

/** Shared stroke settings. `vectorEffect` keeps a 1.6px line 1.6px whether the
 *  drawing is rendered at 24px or 240px — without it a hero-sized branch has a
 *  fat marker outline and a badge-sized leaf has a hairline, and the two stop
 *  looking like the same pen.
 *
 *  It is a presentation *attribute*, which means CSS beats it: a caller that wants a
 *  heavier pen for a hero-sized drawing writes `[stroke-width:2.4]` on the element and
 *  every path in it thickens together. */
const INK = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const

const WASH_LEAF = 'var(--color-leaf-300)'
const WASH_WOOD = 'var(--color-neutral-800)'
const WASH_BREW = 'var(--color-leaf-400)'

type MarkProps = {
  /** Tailwind sizing and colour. The ink is `currentColor`, so `text-leaf-600`
   *  here is what actually inks the drawing. */
  className?: string
  style?: CSSProperties
}

function Drawing({
  viewBox,
  className,
  style,
  children,
}: MarkProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

/* --------------------------------------------------------------------------
   Leaves
   -------------------------------------------------------------------------- */

// Broad rather than lanceolate, and that is a correction rather than a preference: the
// first version was a narrow pointed oval with five fine veins, and at the 40px the
// catalog grid renders it, "narrow + evenly spaced fine lines" is the silhouette of a
// feather. Widening the blade and cutting the veins to five heavier ones fixed it.
const LEAF_BODY = 'M14 50C15 34 27 17 50 11c1 20-13 35-36 39z'

/**
 * One tea leaf, and the most-rendered drawing in the app: it is the stand-in for
 * every tea, shop and household with no photograph, so it appears up to
 * twenty-four times on the catalog grid.
 *
 * That is why it is the simplest thing here — a silhouette, a midrib, three
 * veins and a stem. An earlier version had a serrated edge, which at the 40px
 * the grid actually renders it turned into a grey fuzz along one side.
 */
export function LeafMark({ className, style }: MarkProps) {
  return (
    <Drawing viewBox="0 0 64 64" className={className} style={style}>
      <path d={LEAF_BODY} fill={WASH_LEAF} opacity="0.8" transform="translate(1.8 -2)" />
      <path d={LEAF_BODY} {...INK} />
      <path d="M14 50C24 42 37 28 49.5 12" {...INK} strokeWidth={1.3} />
      <path d="M20.5 45c2.9 1.7 6.2 2.5 9.6 2.4" {...INK} strokeWidth={1} />
      <path d="M26.5 38c3.1 1.9 6.6 2.9 10.2 3" {...INK} strokeWidth={1} />
      <path d="M33.5 30c2.9 2.1 6.2 3.4 9.6 3.7" {...INK} strokeWidth={1} />
      <path d="M23.5 41.5c-.7-4.2-.3-8.2 1.2-11.8" {...INK} strokeWidth={1} />
      <path d="M32 32c-.4-4.1.6-8 2.7-11.3" {...INK} strokeWidth={1} />
      <path d="M14 50c-2.4 1.9-4.3 4.1-5.5 6.5" {...INK} strokeWidth={1.3} />
    </Drawing>
  )
}

// Sized to fill roughly 72% of the box across and 76% down. The first draft occupied
// barely half of it, which is invisible at a glance and reads as a seedling rather than
// as a mark — a logo has to own its tile.
const SPRIG_BUD = 'M32.2 31c-4.6-7.6-4.3-17.4.6-24.8 4.2 7.6 3.4 17.4-.6 24.8z'
const SPRIG_LEAF_LEFT = 'M30.4 41.6c-8.6-1.4-16.6-7.4-21-16.2 9.4.2 17.4 5.8 21 16.2z'
const SPRIG_LEAF_RIGHT = 'M33.6 35.4c3.2-10.4 11.4-16.4 21.2-17-4.2 8.8-12.4 14.8-21.2 17z'

/**
 * The wordmark: two leaves and a bud.
 *
 * ## Why this and not simply "a tea leaf"
 *
 * A single leaf was the obvious mark and it was unavailable, because the app already
 * spends it: `LeafMark` is the "no photograph yet" placeholder and renders up to
 * twenty-four times on the catalog grid. A single-leaf logo would put the brand mark in
 * the header and the *same picture* in every card missing a photo, on the same screen.
 * A mark that also means "nothing here" is not a mark.
 *
 * So: the plucking standard. Fine tea is picked as the terminal bud plus the two
 * youngest leaves under it — 一芽二叶, two leaves and a bud — and everything below that
 * is coarse. It is the one arrangement of leaves that means *tea* specifically rather
 * than foliage generally, which is exactly the job a logo has here, and its silhouette —
 * an upright bud flanked by two blades — cannot be confused with the placeholder's single
 * diagonal one.
 *
 * ## The drawing
 *
 * Three decisions that are botany rather than taste:
 *
 *  - **The bud is paler than the leaves.** An unopened tip is silvery — it is where
 *    "silver needle" gets its name. Here it takes the same wash at roughly half the
 *    opacity, so it reads pale in both themes without needing a colour of its own.
 *  - **The two leaves sit at different heights** and lean apart at different angles. On
 *    a real shoot they alternate up the stem; drawn level and symmetrical they read as a
 *    pair of wings.
 *  - **The stem runs past the lower leaf.** A sprig has a cut end. Stopping the stem at
 *    the leaf junction turns the whole thing into a fleur-de-lis.
 *
 * Below about 20px the veins and the stem go and what is left is bud-plus-two-blades,
 * which is the part that had to survive. The favicon is a separate, chunkier drawing
 * again — see `public/favicon.svg`.
 */
export function TeaSprigMark({ className, style }: MarkProps) {
  return (
    <Drawing viewBox="0 0 64 64" className={className} style={style}>
      <path d={SPRIG_BUD} fill={WASH_LEAF} opacity="0.38" transform="translate(1.4 -1.5)" />
      <path d={SPRIG_LEAF_LEFT} fill={WASH_LEAF} opacity="0.8" transform="translate(1.4 -1.6)" />
      <path d={SPRIG_LEAF_RIGHT} fill={WASH_LEAF} opacity="0.8" transform="translate(1.4 -1.6)" />

      {/* Stem first, so the three blades sit over the top of it and the junctions close. */}
      <path d="M32.2 54.2c-1-8-1.3-16-.8-24" {...INK} strokeWidth={1.9} />
      <path d={SPRIG_LEAF_LEFT} {...INK} strokeWidth={1.8} />
      <path d="M30.4 41.6c-6-4.2-12.4-9.6-21-16.2" {...INK} strokeWidth={1} />
      <path d={SPRIG_LEAF_RIGHT} {...INK} strokeWidth={1.8} />
      <path d="M33.6 35.4c5.6-5.2 12.6-10.8 21.2-17" {...INK} strokeWidth={1} />
      <path d={SPRIG_BUD} {...INK} strokeWidth={1.8} />
      <path d="M32.2 31c-.4-8.2-.2-16.4.6-24.8" {...INK} strokeWidth={1} />
    </Drawing>
  )
}

/**
 * A cut branch with four leaves, for the edges of a hero and the seam between
 * two sections. Wider than it is tall so it can lie along a boundary.
 *
 * `flip` mirrors it rather than there being a second drawing: a branch on the
 * right of the hero wants to grow inwards, and a maintained pair of mirrored
 * paths is a pair that eventually stops matching.
 */
export function TeaBranch({ className, style, flip }: MarkProps & { flip?: boolean }) {
  return (
    <Drawing
      viewBox="0 0 132 84"
      className={className}
      style={{ ...style, transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <g fill={WASH_LEAF} opacity="0.55" transform="translate(1.8 -2)">
        <path d="M40 44c-2-9 2.5-17.5 10-20.5-.5 9.5-4 16.5-10 20.5z" />
        <path d="M58 34c4.5-8 13-11.5 20.5-8.5-5.5 7.5-12.5 11-20.5 8.5z" />
        <path d="M74 52c-1-9.5 4-17 12-19-.5 9.5-4.5 16.5-12 19z" />
        <path d="M96 40c5-7.5 13.5-10 20.5-6.5-6 7-13 9.5-20.5 6.5z" />
      </g>
      <path d="M6 76c14-6.5 27-14 38.5-22.5C62 40.5 82 27 118 20" {...INK} strokeWidth={1.9} />
      <path d="M40 44c-2-9 2.5-17.5 10-20.5-.5 9.5-4 16.5-10 20.5z" {...INK} />
      <path d="M58 34c4.5-8 13-11.5 20.5-8.5-5.5 7.5-12.5 11-20.5 8.5z" {...INK} />
      <path d="M74 52c-1-9.5 4-17 12-19-.5 9.5-4.5 16.5-12 19z" {...INK} />
      <path d="M96 40c5-7.5 13.5-10 20.5-6.5-6 7-13 9.5-20.5 6.5z" {...INK} />
      <path d="M44 40.5c1.5-5 3.5-9.5 6-13" {...INK} strokeWidth={0.9} />
      <path d="M62.5 32.5c4-4 8.5-6.5 13-7.5" {...INK} strokeWidth={0.9} />
      <path d="M78 48.5c1.5-5.5 4-10.5 7-14" {...INK} strokeWidth={0.9} />
      <path d="M100 37.5c4-3.5 8.5-5.5 13-6.5" {...INK} strokeWidth={0.9} />
    </Drawing>
  )
}

/* --------------------------------------------------------------------------
   Teaware
   -------------------------------------------------------------------------- */

/**
 * A bowl of tea on a saucer — the app's wordmark, and the centre of the hero.
 *
 * `steam` is off by default and switched on in exactly one place. Three drifting
 * strokes on the hero cup is atmosphere; the same thing on every cup in a list
 * is a screensaver. The animation is CSS (`steam-drift` in `index.css`), so it
 * stops with `prefers-reduced-motion` along with everything else, and the three
 * strokes are staggered by hand because three identical loops in lockstep read
 * as a machine rather than as steam.
 */
export function TeaCupMark({ className, style, steam }: MarkProps & { steam?: boolean }) {
  return (
    <Drawing viewBox="0 0 64 64" className={className} style={style}>
      {steam && (
        <g {...INK} strokeWidth={1.3} opacity="0">
          <path
            d="M25.5 12c-3-4 2-7 -1-11"
            style={{ animation: 'steam-drift 7.5s ease-out infinite' }}
          />
          <path
            d="M32 10c-3-4 2-7.5 -1-10.5"
            style={{ animation: 'steam-drift 8.5s ease-out infinite 1.1s' }}
          />
          <path
            d="M38.5 12c-3-4 2-7 -1-11"
            style={{ animation: 'steam-drift 9.5s ease-out infinite 2.4s' }}
          />
        </g>
      )}

      {/* A chawan, not a teacup with a handle — the reference is a tea house, and the
          bowl is the shape that says so at 24px without needing the handle to be legible.

          The proportions were wrong twice, in a way worth recording because both
          mistakes look reasonable in the path data and only fail on screen at 24px:

            1. a shallow bowl sitting on a wide flat saucer reads as a top hat;
            2. deepening the bowl but keeping it tapering to a narrow foot made it
               worse — a narrow crown over a wide brim is *more* hat-like, not less.

          What fixed it was the ratio rather than the depth: sides that fall almost
          straight (a foot 23 units across under a 36-unit rim) and a saucer barely wider
          than the rim it holds. Which is, not coincidentally, what a chawan on a small
          plate actually looks like. */}
      <path
        d="M12 49.2c0-2.4 9-4.4 20-4.4s20 2 20 4.4-9 4.8-20 4.8-20-2.4-20-4.8z"
        fill={WASH_WOOD}
        opacity="0.5"
        transform="translate(1.4 -1.4)"
      />
      <path d="M14 22c.6 11.4 3.2 19 6.6 21.8h22.8C46.8 41 49.4 33.4 50 22z" fill={WASH_WOOD} opacity="0.3" />
      <path
        d="M17.5 22c0-2.3 6.5-4.2 14.5-4.2s14.5 1.9 14.5 4.2-6.5 4.2-14.5 4.2S17.5 24.3 17.5 22z"
        fill={WASH_BREW}
        opacity="0.85"
      />

      <path
        d="M12 49.2c0-2.4 9-4.4 20-4.4s20 2 20 4.4-9 4.8-20 4.8-20-2.4-20-4.8z"
        {...INK}
      />
      <path d="M14 22c.6 11.4 3.2 19 6.6 21.7" {...INK} strokeWidth={1.8} />
      <path d="M50 22c-.6 11.4-3.2 19-6.6 21.7" {...INK} strokeWidth={1.8} />
      <path d="M20.6 43.7c3 1.4 7 2.1 11.4 2.1s8.4-.7 11.4-2.1" {...INK} strokeWidth={1.5} />
      <path
        d="M14 22c0-3.2 8-5.8 18-5.8s18 2.6 18 5.8-8 5.8-18 5.8-18-2.6-18-5.8z"
        {...INK}
        strokeWidth={1.8}
      />
      <path d="M18.5 32c1 4.2 2.4 7.6 4.2 9.8" {...INK} strokeWidth={0.9} opacity="0.7" />
    </Drawing>
  )
}

const POT_BODY = 'M17 35c0-9.5 9.4-16 21-16s21 6.5 21 16c0 10-7 19.6-21 19.6S17 45 17 35z'
const POT_SPOUT =
  'M56.5 28.6c6.6-1.3 12.4-4.7 16.4-10 1.6-2.1 3.6-.6 2.6 1.7-3.4 7.6-9.6 12.9-17.4 14.7z'

/**
 * A squat pot with a bail lid. Shelf furniture — it appears in the hero and on the empty
 * states, never attached to a piece of data.
 *
 * The first version had a spout and a handle of roughly equal size, drawn as two small
 * loops on either side of a round body, and it read unmistakably as a sugar bowl with two
 * handles. A pot is only legible when the two are *different* — a long tapered spout that
 * leaves the silhouette, and a handle that is a thin arc — so the spout is now a filled
 * tapering shape and the handle is a single open stroke. Asymmetry is the whole drawing.
 */
export function TeapotMark({ className, style }: MarkProps) {
  return (
    <Drawing viewBox="0 0 80 64" className={className} style={style}>
      <path d={POT_BODY} fill={WASH_WOOD} opacity="0.42" transform="translate(1.6 -1.6)" />
      <path d={POT_SPOUT} fill={WASH_WOOD} opacity="0.42" transform="translate(1.6 -1.6)" />

      <path d={POT_SPOUT} {...INK} strokeWidth={1.7} />
      <path d="M18.5 27.5c-7-1.4-12.4 1.7-12.4 7.2s5.4 9.2 12.4 8.1" {...INK} strokeWidth={1.7} />
      <path d={POT_BODY} {...INK} strokeWidth={1.9} />
      <path d="M25 52.4c3.6 1.7 8.2 2.6 13 2.6s9.4-.9 13-2.6" {...INK} strokeWidth={1.3} />
      <path d="M27 19.6c1.6-4.2 6.1-6.8 11-6.8s9.4 2.6 11 6.8" {...INK} strokeWidth={1.5} />
      <path d="M35.4 13c0-2.1 1.2-3.6 2.6-3.6s2.6 1.5 2.6 3.6" {...INK} strokeWidth={1.2} />
      <path d="M25 31c2.7-2.7 6-4.4 9.6-4.9" {...INK} strokeWidth={0.9} opacity="0.7" />
    </Drawing>
  )
}

/* --------------------------------------------------------------------------
   Brewing instruments
   -------------------------------------------------------------------------- */

export type BrewGlyph = 'temperature' | 'time' | 'leaf' | 'cup'

/**
 * The four instruments on a brewing card: a thermometer, a sand timer, a spoon
 * of leaf and a cup. Drawn rather than pulled from an icon set, because a
 * geometric line icon beside a hand-drawn leaf is the one thing that would make
 * the leaf look like an accident.
 *
 * They are `aria-hidden` and every one of them sits next to a `<dt>` naming the
 * measurement in words. An icon is never the only thing saying what a number is.
 */
export function BrewIcon({ glyph, className, style }: MarkProps & { glyph: BrewGlyph }) {
  return (
    <Drawing viewBox="0 0 32 32" className={className} style={style}>
      {glyph === 'temperature' && (
        <>
          <path d="M13 20V7.5a3 3 0 0 1 6 0V20" {...INK} strokeWidth={1.7} />
          <path
            d="M16 18.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"
            fill={WASH_BREW}
            opacity="0.55"
            transform="translate(0.9 -0.9)"
          />
          <path d="M16 18.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" {...INK} strokeWidth={1.7} />
          <path d="M21.5 10h3M21.5 14h2M21.5 18h3" {...INK} strokeWidth={1.2} />
        </>
      )}

      {glyph === 'time' && (
        <>
          <path d="M9 15.5c4-3.5 10-3.5 14 0-4 3.5-10 3.5-14 0z" fill={WASH_BREW} opacity="0.6" />
          <path d="M8.5 4.5h15M8.5 27.5h15" {...INK} strokeWidth={1.7} />
          <path d="M10.5 4.5c0 6 5.5 8.5 5.5 11.5s-5.5 5.5-5.5 11.5" {...INK} strokeWidth={1.6} />
          <path d="M21.5 4.5c0 6-5.5 8.5-5.5 11.5s5.5 5.5 5.5 11.5" {...INK} strokeWidth={1.6} />
        </>
      )}

      {glyph === 'leaf' && (
        <>
          <path
            d="M7 22c1.5-8 7-14 15.5-16.5C21 14 15.5 20 7 22z"
            fill={WASH_LEAF}
            opacity="0.62"
            transform="translate(0.9 -0.9)"
          />
          <path d="M7 22c1.5-8 7-14 15.5-16.5C21 14 15.5 20 7 22z" {...INK} strokeWidth={1.7} />
          <path d="M7 22C12 17.5 17 11.5 22 5.5" {...INK} strokeWidth={1.2} />
          <path d="M18 22.5c2.5 2.5 5 4.5 7.5 6" {...INK} strokeWidth={1.3} />
        </>
      )}

      {glyph === 'cup' && (
        <>
          <path d="M8 13h16c0 8-3.5 13-8 13s-8-5-8-13z" fill={WASH_BREW} opacity="0.5" />
          <path d="M8 13h16c0 8-3.5 13-8 13s-8-5-8-13z" {...INK} strokeWidth={1.7} />
          <path d="M24 15.5c3-1.5 5.5 0 5.5 2.5s-2.5 4-5 3.5" {...INK} strokeWidth={1.4} />
          <path d="M5.5 29h21" {...INK} strokeWidth={1.5} />
          <path d="M12.5 8.5c-1.5-2 1-3.5-.5-5.5M19 8.5c-1.5-2 1-3.5-.5-5.5" {...INK} strokeWidth={1.2} opacity="0.8" />
        </>
      )}
    </Drawing>
  )
}

/* --------------------------------------------------------------------------
   The sky
   -------------------------------------------------------------------------- */

/** Daylight. Eight rays at deliberately uneven lengths — a sun with eight
 *  identical spokes is a compass rose. */
export function SunMark({ className, style }: MarkProps) {
  return (
    <Drawing viewBox="0 0 24 24" className={className} style={style}>
      <path
        d="M12 6.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8z"
        fill="currentColor"
        opacity="0.28"
        transform="translate(0.7 -0.7)"
      />
      <path d="M12 6.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8z" {...INK} strokeWidth={1.7} />
      <path
        d="M12 1.8v2.6M12 19.5v2.7M1.9 12h2.5M19.7 12h2.4M4.9 4.9l1.9 1.9M17.3 17.3l1.7 1.8M19.1 4.9l-1.8 1.9M6.8 17.3l-1.9 1.8"
        {...INK}
        strokeWidth={1.6}
      />
    </Drawing>
  )
}

/** Evening. A crescent with two small stars, drawn as a filled shape rather than
 *  as a circle with a circle punched out of it — a boolean-subtracted moon has a
 *  mathematically perfect inner arc, which is exactly the thing the rest of this
 *  file is avoiding. */
export function MoonMark({ className, style }: MarkProps) {
  const crescent =
    'M15.6 3.2A9.2 9.2 0 1 0 20.4 15 7.4 7.4 0 0 1 15.6 3.2z'
  return (
    <Drawing viewBox="0 0 24 24" className={className} style={style}>
      <path d={crescent} fill="currentColor" opacity="0.26" transform="translate(-0.7 0.7)" />
      <path d={crescent} {...INK} strokeWidth={1.7} />
      <path d="M18.6 6.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" {...INK} strokeWidth={1.1} />
      <path d="M21 12.4l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" {...INK} strokeWidth={1} />
    </Drawing>
  )
}

/**
 * How Tesseract's per-line confidence is read, and what colour it is drawn in.
 *
 * Its own file rather than living beside `RangeField`: a module that exports both a
 * component and the constants two other components need breaks React Fast Refresh, which
 * oxlint flags and which this repo is otherwise clean of.
 */

export type ConfidenceBand = 'high' | 'medium' | 'low'

/** Tesseract's confidence is a 0–100 per line and the useful reading of it is coarse:
 *  above 80 is usually right, 60–80 is worth checking, below 60 is usually a mis-read.
 *  Three bands rather than a gradient, because a continuous colour ramp on top of a
 *  photograph is unreadable — nobody can tell 62 from 71 by hue. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 80) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}

/** Modelled on `BADGE_TONES` in `components/ui/page.tsx` — the same idea of one shape in
 *  three tones, and the same convention that the `dark:` half of each pair is the half
 *  that renders. */
export const BAND_BORDER: Record<ConfidenceBand, string> = {
  high: 'border-leaf-500 dark:border-leaf-600',
  medium: 'border-amber-500 dark:border-amber-300',
  low: 'border-rose-500 dark:border-rose-400',
}

export const BAND_TEXT: Record<ConfidenceBand, string> = {
  high: 'text-leaf-700 dark:text-leaf-600',
  medium: 'text-amber-700 dark:text-amber-300',
  low: 'text-rose-600 dark:text-rose-400',
}

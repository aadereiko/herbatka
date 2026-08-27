import { SCORES } from '../../lib/review'

/**
 * The bits of a rating form that are neither markup nor state: the option lists both
 * forms feed to a `<select>`, and the two readers that turn a text box back into
 * something the API will accept.
 *
 * They live here rather than in either form because M8 gives shops the same score box and
 * the same notes box, and a second copy of "'' means null" is a second place for the rule
 * to be got wrong. Same reasoning as `shop/draft.ts`.
 */

export const SCORE_OPTIONS = [
  { value: '', label: 'Pick a score' },
  ...SCORES.map((score) => ({ value: String(score), label: String(score) })),
]

/** The subscores get their own "—" rather than reusing "Pick a score": leaving aroma
 *  unscored is a legitimate answer, not an unfinished field. */
export const SUBSCORE_OPTIONS = [
  { value: '', label: '—' },
  ...SCORES.map((score) => ({ value: String(score), label: String(score) })),
]

/** `''` is "not given" and travels as an explicit null — see the note on `ReviewInput`
 *  about why a PUT that omits the key cannot express clearing a subscore. */
export function toScore(raw: string): number | null {
  return raw === '' ? null : Number(raw)
}

export function toText(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

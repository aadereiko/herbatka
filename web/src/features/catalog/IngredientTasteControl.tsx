import { useState } from 'react'

import { SelectField } from '../../components/ui/form'
import { describeApiError } from '../../lib/api'
import type { IngredientTaste } from '../../lib/catalog'
import { SCORES } from '../../lib/review'
import { useViewer } from '../auth/viewer'
import { useClearIngredientRating, useRateIngredient } from './queries'

/** "—" rather than "Pick a score": having no opinion on hibiscus is a real answer, and the
 *  one most rows are sitting on, not an unfinished field. Same reasoning as the subscore
 *  options in `review/draft.ts`. */
const TASTE_OPTIONS = [
  { value: '', label: '—' },
  ...SCORES.map((score) => ({ value: String(score), label: String(score) })),
]

const asDraft = (score: number | null) => (score === null ? '' : String(score))

/** What the crowd thinks, in half a line. Null and 0 are different answers: an ingredient
 *  nobody has rated has no average, and printing "0.0" for it would read as "universally
 *  hated" rather than "not yet asked about". */
function describeTaste(ingredient: IngredientTaste): string | null {
  if (ingredient.average_score === null || ingredient.rating_count === 0) return null
  const people = ingredient.rating_count === 1 ? '1 person' : `${ingredient.rating_count} people`
  return `${ingredient.average_score.toFixed(1)} from ${people}`
}

/**
 * How much you like an ingredient, on the same 1–10 as everything else in the app.
 *
 * A `<select>` and not a row of ten buttons: this control appears once per ingredient, so
 * on a five-ingredient blend a button row would be fifty targets stacked down the tea
 * page, and on a phone it would wrap into a wall. The select is one target, it matches
 * the score control on both review forms, and a screen reader announces it as the single
 * question it is.
 *
 * Choosing "—" *deletes* the rating rather than storing a zero. That distinction is the
 * point of the feature: "I have no opinion on hibiscus" and "I actively dislike hibiscus"
 * are different facts about a blend, and a control that could only say the second one
 * would make the first unsayable.
 *
 * Signed out, the control is not rendered at all — only the average. An input that
 * bounces you to a login the moment you touch it is worse than one never offered, and the
 * average is still worth reading.
 */
export function IngredientTasteControl({
  ingredient,
  idPrefix,
  label,
}: {
  ingredient: IngredientTaste
  idPrefix: string
  /**
   * A visible caption, which also switches the layout to the stacked one.
   *
   * The two places this appears are different shapes, and pretending otherwise is what
   * pushed the select out through the side of an ingredient card: a tea page row is the
   * full width of the page and fits caption, average and control on one line, while a
   * card is a third of that and cannot. Rather than have each caller lay out three
   * fixed-width pieces and get it wrong differently, the control owns both arrangements —
   * caption given, it stacks; caption omitted, it stays on one line beside whatever the
   * row already says.
   */
  label?: string
}) {
  // `isSignedIn`, not `viewer`: the viewer segment is the string 'anon' for a signed-out
  // visitor — it is a cache-key component, and it is always truthy.
  const { isSignedIn } = useViewer()
  const rate = useRateIngredient()
  const clear = useClearIngredientRating()

  /**
   * The select shows the draft, not the server's answer, so that picking 7 reads as 7
   * immediately instead of sitting on the old number until the invalidated query has
   * refetched. `settled` is the sync half of the pattern: when the server's own value
   * changes underneath us — the refetch landing, or another tab — the draft is replaced
   * rather than left stale. Adjusting state during render like this is the documented
   * alternative to an effect, and it costs one extra render rather than a paint.
   */
  const [draft, setDraft] = useState(() => asDraft(ingredient.my_score))
  const [settled, setSettled] = useState(ingredient.my_score)
  if (settled !== ingredient.my_score) {
    setSettled(ingredient.my_score)
    setDraft(asDraft(ingredient.my_score))
  }

  const crowd = describeTaste(ingredient)

  if (!isSignedIn) {
    if (!crowd) return null
    const average = (
      <span
        data-testid={`ingredient-average-${ingredient.slug}`}
        className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400"
      >
        Liked {crowd}
      </span>
    )
    // No control to caption, so the caption is dropped rather than left labelling
    // nothing: "How much you like it" above a read-only average is a question with no
    // way to answer it.
    return average
  }

  function handleChange(next: string) {
    const previous = draft
    setDraft(next)
    // Revert to what was on screen before, not to `ingredient.my_score`: a failed save
    // means the server never heard, so the truthful thing to show is the value the row
    // had a moment ago.
    const onError = () => setDraft(previous)

    if (next === '') {
      // Guarded: the API answers 404 to a delete of a rating that was never made, and
      // firing one on every "—" would turn an idle change of mind into a red error note.
      if (ingredient.my_score !== null) clear.mutate(ingredient.slug, { onError })
      return
    }
    rate.mutate({ slug: ingredient.slug, score: Number(next) }, { onError })
  }

  const error = rate.error ?? clear.error

  const average = crowd ? (
    <span
      data-testid={`ingredient-average-${ingredient.slug}`}
      className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400"
    >
      {crowd}
    </span>
  ) : null

  const select = (
    <div className="w-20 shrink-0">
      <SelectField
        id={`${idPrefix}-taste-${ingredient.slug}`}
        label={`How much you like ${ingredient.name}`}
        labelHidden
        value={draft}
        onChange={handleChange}
        options={TASTE_OPTIONS}
      />
    </div>
  )

  const failure = error ? (
    <span
      role="alert"
      data-testid={`ingredient-taste-error-${ingredient.slug}`}
      className="text-xs text-rose-600 dark:text-rose-400"
    >
      {describeApiError(error)}
    </span>
  ) : null

  if (label) {
    return (
      <div data-testid={`ingredient-taste-${ingredient.slug}`}>
        {/* The crowd figure goes *above* the control rather than below it, which is not
            where it reads most naturally but is where it stops the grid looking broken.
            These cards are bottom-aligned in their row, and a line that appears under the
            select on some cards and not others lifts those selects by exactly one line —
            so a row of six cards ends up with the controls at two different heights for a
            reason nobody can see. Above the row, the variable-height part absorbs into
            the description's slack and every card ends on the same line. */}
        {(average || failure) && (
          <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {average}
            {failure}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {/* `min-w-0 truncate` so a long caption gives way rather than shouldering the
              select out through the side of the card. */}
          <span className="min-w-0 truncate text-sm text-neutral-600 dark:text-neutral-400">
            {label}
          </span>
          {select}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2" data-testid={`ingredient-taste-${ingredient.slug}`}>
      {average}
      {select}
      {failure}
    </div>
  )
}

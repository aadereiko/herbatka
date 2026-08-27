import { useState } from 'react'
import type { FormEvent } from 'react'

import { SelectField, TextAreaField, TextField } from '../../components/ui/form'
import type { Review, ReviewInput, Subscore } from '../../lib/review'
import { SUBSCORES, SUBSCORE_LABELS } from '../../lib/review'
import { SCORE_OPTIONS, SUBSCORE_OPTIONS, toScore, toText } from './draft'
import { useDeleteReview, useUpsertReview } from './queries'
import { ReviewFormShell } from './ReviewFormShell'

type SubscoreDraft = Record<Subscore, string>

function initialSubscores(review: Review | null): SubscoreDraft {
  return {
    aroma: review?.aroma == null ? '' : String(review.aroma),
    flavour: review?.flavour == null ? '' : String(review.flavour),
    aftertaste: review?.aftertaste == null ? '' : String(review.aftertaste),
  }
}

/**
 * Your rating of one tea: the same form whether you are writing it or changing it,
 * because the endpoint is an upsert and pretending otherwise would mean two components
 * that must be kept identical.
 *
 * Everything that is not about *tea* — the error note, the button wording, the two-step
 * delete — lives in `ReviewFormShell`, which the shop form uses too. What is left here is
 * the four fields a cup has and a shop does not, and the input they build.
 */
export function ReviewForm({ slug, mine }: { slug: string; mine: Review | null }) {
  // `!= null`, not `!== null`: a server that has not shipped `my_review` yet sends the
  // key as absent, and reading that as "you have a review" would offer to delete one
  // that does not exist.
  const editing = mine != null

  const [score, setScore] = useState(mine ? String(mine.score) : '')
  const [subscores, setSubscores] = useState<SubscoreDraft>(() => initialSubscores(mine))
  const [body, setBody] = useState(mine?.body ?? '')
  const [brewedAt, setBrewedAt] = useState(mine?.brewed_at ?? '')
  const [scoreError, setScoreError] = useState<string | undefined>(undefined)

  const save = useUpsertReview(slug)
  const remove = useDeleteReview(slug)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const value = Number(score)
    if (score === '' || !Number.isInteger(value)) {
      setScoreError('Give it a score from 1 to 10.')
      return
    }
    setScoreError(undefined)

    const input: ReviewInput = {
      score: value,
      aroma: toScore(subscores.aroma),
      flavour: toScore(subscores.flavour),
      aftertaste: toScore(subscores.aftertaste),
      body: toText(body),
      brewed_at: toText(brewedAt),
    }
    save.mutate(input)
  }

  /** After a delete the review is gone, so the controls have to stop showing it. The
   *  fields are local state seeded once from `mine`, and a refetched `my_review: null`
   *  cannot reach back into them. `save.reset()` goes with it, or the "your review is
   *  updated" note outlives the review it is about. */
  function clearAfterDelete() {
    setScore('')
    setSubscores(initialSubscores(null))
    setBody('')
    setBrewedAt('')
    setScoreError(undefined)
    save.reset()
  }

  return (
    <ReviewFormShell
      idPrefix="review"
      editing={editing}
      save={save}
      remove={{
        isPending: remove.isPending,
        isError: remove.isError,
        error: remove.error,
        run: (onDeleted) =>
          remove.mutate(undefined, {
            onSuccess: () => {
              clearAfterDelete()
              onDeleted()
            },
          }),
      }}
      onSubmit={handleSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="review-score"
          label="Your score"
          value={score}
          onChange={setScore}
          options={SCORE_OPTIONS}
          error={scoreError}
          hint="Out of 10. The only part that is required."
        />
        <TextField
          id="review-brewed-at"
          label="Brewed on"
          type="date"
          value={brewedAt}
          onChange={setBrewedAt}
          hint="Optional — when you last had it."
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          The details (optional)
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {SUBSCORES.map((key) => (
            <SelectField
              key={key}
              id={`review-${key}`}
              label={SUBSCORE_LABELS[key]}
              value={subscores[key]}
              onChange={(next) => setSubscores((prev) => ({ ...prev, [key]: next }))}
              options={SUBSCORE_OPTIONS}
            />
          ))}
        </div>
      </fieldset>

      <TextAreaField
        id="review-body"
        label="Notes (optional)"
        value={body}
        onChange={setBody}
        rows={3}
        placeholder="How did it taste? How did you brew it?"
      />
    </ReviewFormShell>
  )
}

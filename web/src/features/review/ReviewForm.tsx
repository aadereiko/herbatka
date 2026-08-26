import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  FormError,
  FormNote,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '../../components/ui/form'
import { describeApiError } from '../../lib/api'
import type { Review, ReviewInput, Subscore } from '../../lib/review'
import { SCORES, SUBSCORES, SUBSCORE_LABELS } from '../../lib/review'
import { useDeleteReview, useUpsertReview } from './queries'

const SCORE_OPTIONS = [
  { value: '', label: 'Pick a score' },
  ...SCORES.map((score) => ({ value: String(score), label: String(score) })),
]

/** The subscores get their own "—" rather than reusing "Pick a score": leaving aroma
 *  unscored is a legitimate answer here, not an unfinished field. */
const SUBSCORE_OPTIONS = [
  { value: '', label: '—' },
  ...SCORES.map((score) => ({ value: String(score), label: String(score) })),
]

type SubscoreDraft = Record<Subscore, string>

function initialSubscores(review: Review | null): SubscoreDraft {
  return {
    aroma: review?.aroma == null ? '' : String(review.aroma),
    flavour: review?.flavour == null ? '' : String(review.flavour),
    aftertaste: review?.aftertaste == null ? '' : String(review.aftertaste),
  }
}

/** `''` is "not given" and travels as an explicit null — see the note on `ReviewInput`
 *  about why a PUT that omits the key cannot express clearing a subscore. */
function toScore(raw: string): number | null {
  return raw === '' ? null : Number(raw)
}

function toText(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Your rating of one tea: the same form whether you are writing it or changing it,
 * because the endpoint is an upsert and pretending otherwise would mean two components
 * that must be kept identical.
 *
 * The only things that change once a review exists are the words on the buttons and the
 * presence of the delete pair — the reader needs to know they are editing something
 * rather than adding a second opinion.
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
   *  cannot reach back into them — clearing here is what stops the form sitting there
   *  pre-filled with a review that no longer exists. `save.reset()` goes with it, or the
   *  "your review is updated" note outlives the review it is about. */
  function handleDeleted() {
    setScore('')
    setSubscores(initialSubscores(null))
    setBody('')
    setBrewedAt('')
    setScoreError(undefined)
    setConfirmingDelete(false)
    save.reset()
  }

  return (
    <div className="space-y-3">
      <form noValidate onSubmit={handleSubmit} data-testid="review-form" className="space-y-4">
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

        {save.isError && <FormError testId="review-error">{describeApiError(save.error)}</FormError>}
        {save.isSuccess && !save.isPending && (
          <FormNote testId="review-saved">
            {editing ? 'Your review is updated.' : 'Thanks — your rating is in.'}
          </FormNote>
        )}

        <div className="sm:w-56">
          <SubmitButton pending={save.isPending}>
            {save.isPending
              ? 'Saving…'
              : editing
                ? 'Save changes to your review'
                : 'Post your rating'}
          </SubmitButton>
        </div>
      </form>

      {/* Two steps, and no `window.confirm`: a native dialog cannot be styled, cannot be
          read by the tests, and on a phone it lands somewhere nobody is looking. */}
      {editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-brand-100 pt-3 dark:border-neutral-800">
          {confirmingDelete ? (
            <>
              <Button
                variant="danger"
                testId="confirm-delete-review"
                disabled={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: handleDeleted })}
              >
                Really delete my review
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="danger" testId="delete-review" onClick={() => setConfirmingDelete(true)}>
              Delete my review
            </Button>
          )}
          {remove.isError && (
            <FormError testId="review-delete-error">{describeApiError(remove.error)}</FormError>
          )}
        </div>
      )}
    </div>
  )
}

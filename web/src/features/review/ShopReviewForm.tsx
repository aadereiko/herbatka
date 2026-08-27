import { useState } from 'react'
import type { FormEvent } from 'react'

import { SelectField, TextAreaField } from '../../components/ui/form'
import type { ShopReview, ShopReviewInput } from '../../lib/shop'
import { SCORE_OPTIONS, toText } from './draft'
import { useDeleteShopReview, useUpsertShopReview } from './queries'
import { ReviewFormShell } from './ReviewFormShell'

/**
 * Your rating of one shop.
 *
 * Two fields, because a shop has two things worth saying about it: a number and a
 * sentence. There are no subscores and no brew date — aroma is a fact about a cup, and
 * "when did you last brew this shop" is not a question. Everything else on screen comes
 * from `ReviewFormShell`, which is the same component the tea form is built out of, so
 * the two cannot drift apart in their error handling, their button wording or their
 * two-step delete.
 */
export function ShopReviewForm({ slug, mine }: { slug: string; mine: ShopReview | null }) {
  // `!= null` rather than `!== null`, as on the tea form: a server that has not shipped
  // `my_review` yet sends the key as absent, and reading that as "you have a review"
  // would offer to delete one that does not exist.
  const editing = mine != null

  const [score, setScore] = useState(mine ? String(mine.score) : '')
  const [body, setBody] = useState(mine?.body ?? '')
  const [scoreError, setScoreError] = useState<string | undefined>(undefined)

  const save = useUpsertShopReview(slug)
  const remove = useDeleteShopReview(slug)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const value = Number(score)
    if (score === '' || !Number.isInteger(value)) {
      setScoreError('Give it a score from 1 to 10.')
      return
    }
    setScoreError(undefined)

    const input: ShopReviewInput = { score: value, body: toText(body) }
    save.mutate(input)
  }

  function clearAfterDelete() {
    setScore('')
    setBody('')
    setScoreError(undefined)
    save.reset()
  }

  return (
    <ReviewFormShell
      idPrefix="shop-review"
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
      <SelectField
        id="shop-review-score"
        label="Your score"
        value={score}
        onChange={setScore}
        options={SCORE_OPTIONS}
        error={scoreError}
        hint="Out of 10. The only part that is required."
      />

      <TextAreaField
        id="shop-review-body"
        label="Notes (optional)"
        value={body}
        onChange={setBody}
        rows={3}
        placeholder="What is it like to buy from? Range, prices, whether they let you smell things."
      />
    </ReviewFormShell>
  )
}

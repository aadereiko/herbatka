import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { Button } from '../../components/ui/button'
import { FormError, FormNote, SubmitButton } from '../../components/ui/form'
import { describeApiError } from '../../lib/api'

/** What the shell needs to know about the save, and nothing more. Structural rather than
 *  react-query's own `UseMutationResult`, so this file does not have to care which
 *  library the caller's hook came from. */
export type ReviewSaveState = {
  isPending: boolean
  isError: boolean
  error: unknown
  isSuccess: boolean
}

export type ReviewRemoveState = {
  isPending: boolean
  isError: boolean
  error: unknown
  /**
   * Run the delete. The shell hands in a callback to fire once it lands, so that its own
   * confirmation state and the caller's now-stale form fields are cleared together — a
   * refetched `my_review: null` cannot reach back into the caller's `useState`, and a
   * form left sitting pre-filled with a review that no longer exists is the bug this
   * exists to prevent.
   */
  run: (onDeleted: () => void) => void
}

/**
 * Everything a rating form does that has nothing to do with what is being rated.
 *
 * The tea form and the shop form differ in three fields and one endpoint; they agree on
 * the error note, the "your review is updated" note, the pending label, the wording of
 * the two buttons, and the whole two-step delete. That agreement is not a coincidence to
 * be maintained by hand in two files — it is one component, and the fields go in as
 * children.
 *
 * `idPrefix` is what keeps the two sets of hooks apart: `review` gives the tea page the
 * ids it has always had (`review-form`, `delete-review`), and `shop-review` gives the shop
 * page its own without either having to know the other exists.
 */
export function ReviewFormShell({
  idPrefix,
  editing,
  save,
  remove,
  onSubmit,
  children,
}: {
  idPrefix: string
  /** True once you have one of these, which changes the words on both buttons and is the
   *  only thing that puts the delete pair on screen. */
  editing: boolean
  save: ReviewSaveState
  remove: ReviewRemoveState
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="space-y-3">
      <form noValidate onSubmit={onSubmit} data-testid={`${idPrefix}-form`} className="space-y-4">
        {children}

        {save.isError && (
          <FormError testId={`${idPrefix}-error`}>{describeApiError(save.error)}</FormError>
        )}
        {save.isSuccess && !save.isPending && (
          <FormNote testId={`${idPrefix}-saved`}>
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
                testId={`confirm-delete-${idPrefix}`}
                disabled={remove.isPending}
                onClick={() => remove.run(() => setConfirmingDelete(false))}
              >
                Really delete my review
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              testId={`delete-${idPrefix}`}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete my review
            </Button>
          )}
          {remove.isError && (
            <FormError testId={`${idPrefix}-delete-error`}>
              {describeApiError(remove.error)}
            </FormError>
          )}
        </div>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'

import { Button } from '../../components/ui/button'
import type { ButtonVariant } from '../../components/ui/button'
import type { UserRef } from '../../lib/household'

/**
 * Name over email, truncating. Every list on /friends shows the same two lines, and the
 * email is the load-bearing half: display names are not unique, so "Ada Lovelace" alone
 * is not enough to tell you which Ada you are about to hand your reading history to.
 */
export function PersonIdentity({ user, note }: { user: UserRef; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-brand-900 dark:text-brand-100">
        {user.display_name}
      </p>
      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
        {user.email}
        {note != null && <> · {note}</>}
      </p>
    </div>
  )
}

/**
 * A destructive button that asks first, inline.
 *
 * Not `window.confirm`: it cannot be styled, cannot be dismissed by keyboard the way the
 * rest of the page can, and is a no-op under jsdom — so an action guarded by it is one
 * no test can cover. The M3 and M4 screens each grew their own copy of this two-step;
 * /friends needs three of them on one page (unfriend, block from the friends list, block
 * from a search result), so here it is once.
 *
 * `open` is owned by the parent rather than by this component, which is what stops two
 * confirmations sitting open at the same time on the same row and asks the reader to
 * work out which "Really" belongs to which verb.
 */
export function ConfirmAction({
  open,
  onOpen,
  onCancel,
  onConfirm,
  label,
  confirmLabel,
  cancelLabel = 'Keep',
  ariaLabel,
  pending,
  testId,
  confirmTestId,
  variant = 'danger',
}: {
  open: boolean
  onOpen: () => void
  onCancel: () => void
  onConfirm: () => void
  label: string
  confirmLabel: string
  cancelLabel?: string
  /** The row-specific name, because "Remove" repeated eight times tells a screen-reader
   *  user nothing about which of the eight they have landed on. */
  ariaLabel: string
  pending?: boolean
  testId: string
  confirmTestId: string
  variant?: ButtonVariant
}) {
  if (!open) {
    return (
      <Button variant={variant} size="sm" ariaLabel={ariaLabel} testId={testId} onClick={onOpen}>
        {label}
      </Button>
    )
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        testId={confirmTestId}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </>
  )
}

/** The per-row failure line. Kept next to the row it belongs to rather than at the top
 *  of the panel: "could not remove" above a list of six is a sentence about nobody. */
export function RowError({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p
      role="alert"
      data-testid={testId}
      className="mt-1 text-xs text-rose-600 dark:text-rose-400"
    >
      {children}
    </p>
  )
}

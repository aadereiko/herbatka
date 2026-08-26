import type { ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary:
    'border border-brand-200 bg-white text-brand-800 hover:bg-brand-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-brand-200 dark:hover:bg-neutral-800',
  danger:
    'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-neutral-900 dark:text-rose-300 dark:hover:bg-rose-950',
  ghost: 'text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-neutral-800',
}

/** One button, four looks. Always an explicit `type` — a bare <button> inside a form
 *  submits it, which is how "Add ingredient" ends up creating a tea. */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
  disabled,
  title,
  testId,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
  testId?: string
  ariaLabel?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${BASE} ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}

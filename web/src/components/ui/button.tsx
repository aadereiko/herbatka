import type { ReactNode } from 'react'
import { Link } from 'react-router'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60'

/**
 * `md` reproduces exactly what every M2 call site already had, so nothing moves by adding
 * this. `lg` exists for the stock screen: the brew presets are tapped with a thumb while
 * the kettle is boiling, and a 24px-tall button is a miss waiting to happen.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'min-h-11 px-4 py-2.5 text-base',
}

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
  size = 'md',
  type = 'button',
  disabled,
  title,
  testId,
  ariaLabel,
  ariaPressed,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
  testId?: string
  ariaLabel?: string
  /** For toggles. The control keeps one name and reports its state, rather than swapping
   *  its label between "Show low" and "Show all" and leaving a screen reader to guess
   *  which of the two it is looking at. */
  ariaPressed?: boolean
  /** Layout only — width, flex behaviour. Colour and padding belong to the variant and
   *  the size, or the four looks stop being four looks. */
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-testid={testId}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  )
}


/**
 * A link that looks like a button. A separate component rather than an `as` prop on
 * Button, because the two are different elements with different semantics: this one
 * navigates and belongs in the tab order as a link, and it must never grow `onClick`,
 * `type` or `disabled` — a disabled link is not a thing.
 */
export function LinkButton({
  to,
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  testId,
}: {
  to: string
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  testId?: string
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Every button is a small board you can push down — and the paint is not in this file.
 *
 * `btn`, `btn-sm|md|lg` and `btn-primary|secondary|danger|ghost` are defined once in
 * index.css, next to the tokens they are made of. That is not indirection for its own
 * sake: most of a button is state (hover, active, disabled, and a dark version of each),
 * which as a Tailwind string means a pile of `hover:`/`dark:` prefixes repeated per
 * variant and re-typed by every other component that needs to look like a button. The
 * nav's active tile, `SubmitButton` and the file picker in `ImageUploadField` all wear
 * the same three words now, and there is exactly one place to change the look.
 *
 * What stays here is the mapping from this component's vocabulary to those classes, so
 * the props are still `variant` and `size` and no call site learns a class name.
 */
const BASE = 'btn'

const SIZES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
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

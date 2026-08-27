import type { ReactNode } from 'react'

/**
 * The form primitives the whole app shares.
 *
 * M1 grew these inside `features/auth/auth-ui.tsx` because /login and /register were the
 * only forms in existence. M2 adds five more, so the implementation moved here and
 * `auth-ui` now re-exports it — one set of label/error/aria wiring rather than two that
 * drift apart. The auth pages' own prop shapes are unchanged.
 */

/**
 * A field is a slot cut into the board: timber inside a drawn edge, sunk half a step
 * below the paper it sits on.
 *
 * Two changes worth naming. The fill is `brand-50`/`neutral-950` rather than paper white —
 * once cards are paper, a paper input inside a paper card has nothing but its border to
 * say it is an input, and a border alone is not enough at a glance. And the focus ring
 * moved from `brand-200` to `brand-500/35`: `brand-200` used to be a pale green and is now
 * the mid-brown the borders are drawn in, so a ring in it would have been invisible
 * against the border it surrounds.
 */
const CONTROL_CLASS =
  'w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/35 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/35'

/** The bit every field has in common: a real `<label for>`, and an error paragraph the
 *  control points at with `aria-describedby` so it is announced with the field rather
 *  than as loose text somewhere on the page. */
export function Field({
  id,
  label,
  error,
  hint,
  labelHidden,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  /** For dense rows where the visible column heading already says what this is. The
   *  label still exists for screen readers and for `getByLabelText`. */
  labelHidden?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={
          labelHidden
            ? 'sr-only'
            : 'block text-sm font-medium text-neutral-700 dark:text-neutral-300'
        }
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} data-testid={`${id}-error`} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  placeholder,
  autoComplete,
  labelHidden,
  min,
  max,
  step,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'number' | 'date'
  error?: string
  hint?: string
  placeholder?: string
  autoComplete?: string
  labelHidden?: boolean
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint} labelHidden={labelHidden}>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      />
    </Field>
  )
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  labelHidden,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  error?: string
  hint?: string
  labelHidden?: boolean
  disabled?: boolean
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint} labelHidden={labelHidden}>
      <select
        id={id}
        name={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 3,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  rows?: number
  placeholder?: string
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        name={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      />
    </Field>
  )
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  ariaLabel,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** For repeated checkboxes in a list, where the visible word ("Primary") is the same
   *  on every row and only the accessible name can say which row it belongs to. Keep the
   *  visible label inside it, so speech input still matches what is on screen. */
  ariaLabel?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded-sm border-brand-300 text-brand-600 focus:ring-2 focus:ring-brand-500/35 dark:border-neutral-600 dark:focus:ring-brand-400/35"
      />
      <label htmlFor={id} className="text-sm text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
    </div>
  )
}

/** Server-side failures — a 401, a 409, an unreachable API — as opposed to per-field
 *  validation. `testId` defaults to the M1 value so the auth pages keep their hook. */
export function FormError({
  children,
  testId = 'form-error',
}: {
  children: ReactNode
  testId?: string
}) {
  return (
    <p
      role="alert"
      data-testid={testId}
      className="note-error"
    >
      {children}
    </p>
  )
}

export function FormNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p
      role="status"
      data-testid={testId}
      className="note-info"
    >
      {children}
    </p>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      // Not a `Button` — this one is always `type="submit"`, always full width, and takes
      // `pending` rather than `disabled`. It wears the same three utilities `Button` does
      // so the two cannot drift; only the width and the heavier weight are its own.
      className="btn btn-md btn-primary w-full font-semibold"
    >
      {children}
    </button>
  )
}

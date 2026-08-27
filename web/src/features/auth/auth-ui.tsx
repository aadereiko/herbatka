import type { ReactNode } from 'react'

import { TextField } from '../../components/ui/form'

// The label/error/aria wiring these three used to own moved to components/ui/form.tsx
// in M2, when the catalog and admin screens needed the same primitives plus selects,
// textareas and checkboxes. Re-exported rather than re-implemented, so /login and
// /register keep the exact imports they had and there is still only one of each.
export { FormError, SubmitButton } from '../../components/ui/form'

/** The shared shell for /login and /register: same card as the rest of the app, one h1. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main className="page-ground grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <span className="text-3xl" role="img" aria-label="teacup">
            🍵
          </span>
          <div>
            <h1 className="text-xl font-semibold text-brand-900 dark:text-brand-100">{title}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}

/**
 * The auth pages' text field. It is now a thin adapter over the shared `TextField` —
 * narrower on purpose: a credential field is always one of three types and always wants
 * an autocomplete token, and keeping that shape stops /login from sprouting a number
 * input by accident.
 */
export function AuthField({
  id,
  label,
  type,
  value,
  autoComplete,
  error,
  onChange,
}: {
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  autoComplete: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <TextField
      id={id}
      label={label}
      type={type}
      value={value}
      autoComplete={autoComplete}
      error={error}
      onChange={onChange}
    />
  )
}

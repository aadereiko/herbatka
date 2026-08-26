import type { ReactNode } from 'react'

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
    <main className="grid min-h-dvh place-items-center bg-brand-50 p-6 dark:bg-neutral-950">
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
 * A real <label for> tied to a real id, plus aria-invalid/aria-describedby so a screen
 * reader hears the error with the field rather than as loose text somewhere on the page.
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
  const errorId = `${id}-error`
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-brand-900"
      />
      {error && (
        <p id={errorId} data-testid={errorId} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}

/** Server-side failures — a 401 or a 409 — as opposed to per-field validation. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      data-testid="form-error"
      className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
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
      className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

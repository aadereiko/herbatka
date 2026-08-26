import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { describeApiError } from '../../lib/api'
import { useAuth } from './auth-context'
import { AuthCard, AuthField, FormError, SubmitButton } from './auth-ui'

const MIN_PASSWORD_LENGTH = 8

type FieldErrors = { displayName?: string; email?: string; password?: string }

export function RegisterPage() {
  const { register } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Client-side checks are a courtesy, not a guarantee — the API validates the same
  // rules and answers 422. They exist so the user is told before a round trip.
  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!displayName.trim()) errors.displayName = 'Tell us what to call you.'
    if (!email.trim()) errors.email = 'Enter your email address.'
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    return errors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFormError(null)
    setPending(true)
    try {
      // As on the login page, the router's RedirectIfSignedIn owns the navigation.
      await register({
        email: email.trim(),
        password,
        display_name: displayName.trim(),
      })
    } catch (error) {
      setFormError(describeApiError(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Create an account" subtitle="Start tracking what you brew">
      <form
        noValidate
        onSubmit={handleSubmit}
        data-testid="register-page"
        className="mt-6 space-y-4"
      >
        <AuthField
          id="display-name"
          label="Display name"
          type="text"
          value={displayName}
          autoComplete="name"
          error={fieldErrors.displayName}
          onChange={setDisplayName}
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          error={fieldErrors.email}
          onChange={setEmail}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          autoComplete="new-password"
          error={fieldErrors.password}
          onChange={setPassword}
        />
        {formError && <FormError>{formError}</FormError>}
        <SubmitButton pending={pending}>{pending ? 'Creating…' : 'Create account'}</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 dark:text-brand-300">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}

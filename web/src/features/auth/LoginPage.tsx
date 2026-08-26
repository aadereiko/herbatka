import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { describeApiError } from '../../lib/api'
import { useAuth } from './auth-context'
import { AuthCard, AuthField, FormError, SubmitButton } from './auth-ui'

type FieldErrors = { email?: string; password?: string }

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Sign-in deliberately does not enforce the 8-character minimum that registration
  // does: the rule guards the password being *chosen*, and applying it here would lock
  // out anyone whose existing password predates it. Empty is still empty.
  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = 'Enter your email address.'
    if (!password) errors.password = 'Enter your password.'
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
      // No navigate() here on purpose. /login is wrapped in the router's
      // RedirectIfSignedIn, which sends a signed-in visitor to wherever they were
      // headed. One place decides the destination, so the two cannot race.
      await login(email.trim(), password)
    } catch (error) {
      setFormError(describeApiError(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to your shelf">
      <form
        noValidate
        onSubmit={handleSubmit}
        data-testid="login-page"
        className="mt-6 space-y-4"
      >
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
          autoComplete="current-password"
          error={fieldErrors.password}
          onChange={setPassword}
        />
        {formError && <FormError>{formError}</FormError>}
        <SubmitButton pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No account yet?{' '}
        <Link to="/register" className="font-medium text-brand-700 dark:text-brand-300">
          Create one
        </Link>
      </p>
    </AuthCard>
  )
}

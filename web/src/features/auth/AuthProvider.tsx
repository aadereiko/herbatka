import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { User } from '../../lib/api'
import {
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  register as registerRequest,
} from '../../lib/api'
import { subscribeToAccessToken } from '../../lib/token'
import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // The reason the httpOnly refresh cookie exists. A hard reload wipes the in-memory
  // access token, so before deciding the visitor is signed out we spend one request
  // asking the cookie for a new one. `isLoading` stays true until it answers, and the
  // route guards render nothing meanwhile — so a signed-in reload never shows /login.
  useEffect(() => {
    let cancelled = false
    void refreshSession().then((session) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // A background query whose silent refresh failed clears the token from outside React.
  // Without this the UI would keep rendering a signed-in shell over a dead session.
  useEffect(
    () =>
      subscribeToAccessToken((token) => {
        if (token === null) setUser(null)
      }),
    [],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (email, password) => {
        const session = await loginRequest(email, password)
        setUser(session.user)
        return session.user
      },
      register: async (input) => {
        const session = await registerRequest(input)
        setUser(session.user)
        return session.user
      },
      logout: async () => {
        // A logout that the server rejects still signs you out here: the access token is
        // already gone (api.logout clears it in a finally), so surfacing the failure
        // would only strand the user on a page they no longer have credentials for.
        await logoutRequest().catch(() => undefined)
        setUser(null)
      },
    }),
    [user, isLoading],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

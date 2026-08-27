import { createContext, useContext } from 'react'

import type { RegisterInput, User } from '../../lib/api'

export type AuthContextValue = {
  /** null once we know nobody is signed in — never during the first refresh. */
  user: User | null
  /** True until the silent refresh on mount settles. Guards against a login-page flash. */
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  /**
   * Replace the signed-in user with a fresher copy of the same person.
   *
   * `PATCH /auth/me` answers with the whole `UserOut`, and the nav is showing your avatar
   * and your display name on every page. Without this, saving your settings changes the
   * form and nothing else until the next hard reload, which reads as a save that did not
   * take. Not a general setter: it is for the one endpoint that returns you.
   */
  updateUser: (user: User) => void
}

// The context lives apart from the provider component so that importing `useAuth` into a
// page does not drag a component export into a hooks-only module (and vice versa) —
// which keeps both Fast Refresh and react/only-export-components happy.
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

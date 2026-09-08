import { createContext, useContext } from 'react'

/** Daylight or evening — what is actually on screen. */
export type Theme = 'light' | 'dark'

/** What was *chosen*. `null` means "follow the operating system", which is a
 *  real state rather than a gap: it is what everybody starts in, it is what the
 *  stylesheet honours on its own, and clearing the stored key returns to it. */
export type ThemePreference = Theme | null

/** Shared with the inline script in `index.html`, which cannot import it. If you
 *  rename this, rename it there too — they are two readers of one key and
 *  nothing type-checks that they agree. */
export const THEME_STORAGE_KEY = 'herbatka-theme'

export type ThemeContextValue = {
  /** What is on screen, whether it was chosen or inherited from the OS. */
  theme: Theme
  /** What was chosen, if anything. `null` while following the OS. */
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  /** Always writes an explicit preference, including when the new value happens
   *  to match the OS — see the note in `ThemeProvider`. */
  toggle: () => void
}

// The context lives apart from the provider component for the same reason
// `features/auth/auth-context.ts` does: importing `useTheme` into a page should
// not drag a component export into a hooks-only module, which keeps both Fast
// Refresh and react/only-export-components happy.
export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Throws outside a provider rather than guessing. Unlike the menu's context —
 *  which no-ops, because a stray menu item should not be able to white-screen
 *  the app — a theme hook with no provider is a wiring mistake, and the only way
 *  that reaches production is by being silent in development. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { MoonMark, SunMark } from './botanical'
import { THEME_STORAGE_KEY, ThemeContext, useTheme } from './theme-context'
import type { Theme, ThemePreference } from './theme-context'

/**
 * Daylight or evening, and which of the two this tea house is currently in.
 *
 * ## The division of labour, which is the only surprising thing here
 *
 * **CSS owns the default. This file owns the choice.**
 *
 * `index.css` gives `<html>` `color-scheme: light dark` and writes every token
 * as `light-dark(day, night)`. That means a visitor who has never touched the
 * toggle gets their operating system's preference *from the stylesheet*, on the
 * first paint, with no script involved — so there is no window in which the
 * wrong theme can be on screen, and nothing for this component to do on mount.
 *
 * All this provider does is the other half: remember an explicit choice and
 * write it as `data-theme`, which the two attribute rules in `index.css` turn
 * into a hard `color-scheme: light` or `dark` that overrides the OS.
 *
 * Consequently `preference` is genuinely three-valued — light, dark, or *no
 * opinion* — even though the toggle only offers two. `null` is not "unset yet",
 * it is a real state meaning "follow the room", and clearing the key restores it.
 *
 * ## The two things that would otherwise go wrong
 *
 * **The stored-preference flash.** CSS handles the no-preference case, but it
 * cannot know about localStorage. Somebody who chose dark on a light machine
 * would get one frame of daylight before this component ran. The fix is not
 * here — it is the four-line script in `index.html`, which sets the attribute
 * before the first paint. This provider reads what that script already wrote,
 * so the two never disagree and there is no second flash when React hydrates.
 *
 * **The stale repaint.** Chrome does not reliably invalidate already-composited
 * layers when `color-scheme` changes: the computed values flip correctly and
 * the pixels do not, which looks like half the page failing to switch. The
 * `theme-shifting` class below is the fix as well as the animation — a live
 * `background-color` transition forces the invalidation that the attribute
 * change alone does not.
 */

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** Wrapped rather than feature-checked, because `localStorage` fails in two
 *  different shapes and `typeof localStorage !== 'undefined'` only catches one
 *  of them:
 *
 *    - the global is **missing** — which is not hypothetical, it is the state of
 *      this repo's own jsdom test environment, and was how the tests found out;
 *    - the global is **present and the getter throws** — a browser configured to
 *      block site data, and Safari's private mode historically.
 *
 *  A try/catch covers both. A theme toggle is not worth a white screen. */
function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [system, setSystem] = useState<Theme>(systemTheme)

  // Somebody can change their OS theme while the tab is open, and with no stored
  // preference this app is supposed to follow it. The stylesheet already does;
  // this only keeps `theme` — which the toggle's label is derived from — honest.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const theme: Theme = preference ?? system

  // Skipped on the first run. On mount the attribute is already whatever the
  // inline script wrote, so re-applying it would be a no-op — but arming the
  // transition would not be, and the app would fade in its own colours on every
  // page load.
  const mounted = useRef(false)

  useEffect(() => {
    const root = document.documentElement

    if (!mounted.current) {
      mounted.current = true
      return
    }

    root.classList.add('theme-shifting')
    if (preference) root.setAttribute('data-theme', preference)
    else root.removeAttribute('data-theme')

    // Reading a layout property between the two writes forces the style
    // recalculation that makes the transition actually run, rather than the
    // browser coalescing both changes into one frame and cutting straight to the
    // new colours. It is also the repaint nudge described in the header comment.
    void root.offsetHeight

    const timer = window.setTimeout(() => root.classList.remove('theme-shifting'), 420)
    return () => window.clearTimeout(timer)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      if (next) localStorage.setItem(THEME_STORAGE_KEY, next)
      else localStorage.removeItem(THEME_STORAGE_KEY)
    } catch {
      // A blocked store means the choice lasts for this tab only, which is a
      // better outcome than an exception escaping a click handler.
    }
  }, [])

  // Toggling always writes an explicit preference, including when it happens to
  // match the OS. Anything else produces a button that appears to do nothing the
  // first time somebody presses it.
  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark')
  }, [setPreference, theme])

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * The switch itself: a sun for the daylit tea house, a moon for the evening one.
 *
 * ## Why it shows the destination rather than the current state
 *
 * Both readings are defensible and the app has to pick one, so: the icon is the
 * theme you will get, and the label says so out loud — "Light the evening
 * lamps", not "Currently daylight". A control that shows its *current* state
 * reads as a status light, and people press status lights expecting them to
 * describe rather than to act.
 *
 * ## What a screen reader gets
 *
 * A `<button>` with a real accessible name, and that is all it needs to be.
 * Deliberately *not* `role="switch"` with `aria-checked`: a switch announces
 * "on" and "off", and neither of these two themes is the off one.
 *
 * The name changes when the button is pressed, which is what announces the
 * result — the control the user is still focused on renames itself. `title`
 * carries the same sentence for a mouse, since the button has no visible text
 * at any width.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const goingDark = theme === 'light'
  const label = goingDark ? 'Light the evening lamps' : 'Open the shutters for daylight'

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
      className={`btn btn-sm sm:btn-md btn-quiet px-1.5 sm:px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}
    >
      {goingDark ? (
        <MoonMark className="size-4 text-brand-300 sm:size-5" />
      ) : (
        <SunMark className="size-4 text-amber-300 sm:size-5" />
      )}
    </button>
  )
}

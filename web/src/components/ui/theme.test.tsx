import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { THEME_STORAGE_KEY } from './theme-context'
import { ThemeProvider, ThemeToggle } from './theme'

/* --------------------------------------------------------------------- harness */

/**
 * jsdom has no `matchMedia` at all, which is not a detail to paper over: the whole
 * "no preference means follow the room" branch reads it, and a stub that always answers
 * `false` would quietly test only half of this file. So it is installed per test with the
 * OS preference as an argument.
 */
function stubSystemTheme(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('dark') ? prefersDark : !prefersDark,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

/**
 * An in-memory `localStorage`, because this project's jsdom does not provide one.
 *
 * That is not a quirk to work around silently — it is the exact situation
 * `ThemeProvider` wraps every storage access in a try/catch for. Under vitest 4 + jsdom
 * 30 the global is *undefined*, so `localStorage.getItem` throws a `TypeError` rather
 * than returning null, and the provider treats that the same way it treats a browser
 * with site data blocked: no stored preference, follow the room. The `runs without
 * storage at all` test below pins that behaviour; everything else needs a real store to
 * assert against, and this is it.
 */
function installMemoryStorage() {
  let data: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    removeItem: (key: string) => {
      delete data[key]
    },
    clear: () => {
      data = {}
    },
  })
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

const root = () => document.documentElement

beforeEach(() => {
  installMemoryStorage()
  root().removeAttribute('data-theme')
  root().classList.remove('theme-shifting')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/* ------------------------------------------------------------------------ tests */

test('with no stored preference the attribute is left off, so the stylesheet decides', () => {
  stubSystemTheme(true)
  renderToggle()

  // The absence of `data-theme` is the feature, not an oversight: `index.css` puts
  // `color-scheme: light dark` on <html>, so no attribute means the OS preference is
  // honoured by CSS alone, on the first paint, with no script involved.
  expect(root().hasAttribute('data-theme')).toBe(false)
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
})

test('the button names the theme it will switch to, not the one you are in', () => {
  stubSystemTheme(false)
  renderToggle()

  expect(screen.getByRole('button', { name: 'Light the evening lamps' })).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('theme-toggle'))

  // The control renames itself, which is what announces the result to a screen reader
  // user whose focus is still on it.
  expect(
    screen.getByRole('button', { name: 'Open the shutters for daylight' }),
  ).toBeInTheDocument()
})

test('choosing a theme writes the attribute and remembers it', () => {
  stubSystemTheme(false)
  renderToggle()

  fireEvent.click(screen.getByTestId('theme-toggle'))

  expect(root().getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
})

test('a stored preference wins over the operating system', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'light')
  stubSystemTheme(true)
  renderToggle()

  expect(screen.getByRole('button', { name: 'Light the evening lamps' })).toBeInTheDocument()
})

test('toggling to the theme the OS already prefers still records a choice', () => {
  // The interesting case, and the one that is wrong in most implementations. Somebody on
  // a dark machine presses the button once: without an explicit write, the preference
  // would go from "follow the OS" to "dark", the attribute would match what CSS was
  // already doing, and the button would look like it did nothing.
  stubSystemTheme(true)
  localStorage.setItem(THEME_STORAGE_KEY, 'light')
  renderToggle()

  fireEvent.click(screen.getByTestId('theme-toggle'))

  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  expect(root().getAttribute('data-theme')).toBe('dark')
})

test('a change arms the transition class, so the swap is animated rather than cut', () => {
  stubSystemTheme(false)
  renderToggle()

  // Not armed on mount: the attribute is already whatever the inline script in index.html
  // wrote, and arming here would make the app fade in its own colours on every page load.
  expect(root().classList.contains('theme-shifting')).toBe(false)

  fireEvent.click(screen.getByTestId('theme-toggle'))

  expect(root().classList.contains('theme-shifting')).toBe(true)
})

test('a blocked localStorage does not stop the theme changing', () => {
  stubSystemTheme(false)
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    removeItem: () => {},
    clear: () => {},
  })

  renderToggle()
  fireEvent.click(screen.getByTestId('theme-toggle'))

  // The choice does not survive a reload, which is the correct degradation for a browser
  // with site data turned off. An exception escaping a click handler is not.
  expect(root().getAttribute('data-theme')).toBe('dark')
})

test('runs with no localStorage at all — the global simply missing', () => {
  // Not a hypothetical: this is the state of the global in this repo's own test
  // environment, and it is why every access in the provider is wrapped rather than
  // guarded with a feature check. `typeof localStorage` is cheap to write and misses the
  // case where the property exists and the *getter* throws, which is what a browser with
  // site data blocked actually does.
  stubSystemTheme(true)
  vi.stubGlobal('localStorage', undefined)

  expect(() => renderToggle()).not.toThrow()
  expect(screen.getByRole('button', { name: 'Open the shutters for daylight' })).toBeInTheDocument()
})

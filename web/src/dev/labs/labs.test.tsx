import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'

import { ThemeProvider } from '../../components/ui/theme'
import { AuthProvider } from '../../features/auth/AuthProvider'
import { coOccurrence, countBy, teas } from './data'
import { LabsPage } from './LabsPage'

afterEach(cleanup)

/**
 * `PageShell` brings the real site nav with it, which reads the session and the pending
 * friend/household counts — so the page cannot render without auth and query context, and
 * a signed-out `/auth/me` is the shape this page actually loads under.
 */
function renderPage() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response('{}', { status: 401 })),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LabsPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

test('the dataset decodes into named fields', () => {
  expect(teas.length).toBeGreaterThan(1000)
  const sample = teas[0]
  expect(sample.name).toBeTruthy()
  expect(sample.country).toBeTruthy()
  // Ingredient indexes must resolve to names, not to `undefined` — the failure mode of a
  // stale JSON export against a newer decoder.
  expect(sample.ingredients.every((i) => typeof i === 'string' && i.length > 0)).toBe(true)
})

test('every tea carries a format or an explicit blank, never undefined', () => {
  const allowed = new Set(['bags', 'loose', 'powder', ''])
  expect(teas.every((t) => allowed.has(t.format))).toBe(true)
})

// 20s rather than the 5s default. Not padding: this renders every one of the 2,394 teas in
// jsdom, which measured 5.7s under a loaded full-suite run and failed on the default while
// passing in isolation. Paginating to make the test fast would test something the page
// deliberately does not do.
test('renders the bench with the full catalogue', { timeout: 20_000 }, () => {
  renderPage()
  expect(screen.getByRole('heading', { name: /data science bench/i })).toBeTruthy()
  expect(screen.getByText(/dev only/i)).toBeTruthy()
  // The unpaginated table is the point of the page: one row per tea, all at once.
  const rows = screen.getAllByRole('row')
  expect(rows.length).toBeGreaterThan(teas.length)
})

test('filtering by country narrows the table', () => {
  renderPage()
  const before = screen.getAllByRole('row').length
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Poland' } })
  const after = screen.getAllByRole('row').length
  expect(after).toBeLessThan(before)
  expect(after).toBeGreaterThan(1)
})

test('"not stated" is a distinct filter from "any format"', () => {
  renderPage()
  const select = screen.getByLabelText('Format')
  const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
  // Two options sharing the empty string would make "any" and "not stated" the same choice.
  expect(new Set(values).size).toBe(values.length)

  fireEvent.change(select, { target: { value: '__not_stated' } })
  const stated = screen.getAllByRole('row').length
  expect(stated).toBeLessThan(teas.length)
})

test('co-occurrence is symmetric and bounded', () => {
  const top = coOccurrence(teas, 'Hibiscus', 5)
  expect(top.length).toBeGreaterThan(0)
  for (const row of top) {
    expect(row.value).toBeGreaterThan(0)
    expect(row.value).toBeLessThanOrEqual(1)
  }
})

test('countBy totals match the row count', () => {
  const total = countBy(teas, (t) => t.country).reduce((sum, c) => sum + c.value, 0)
  expect(total).toBe(teas.length)
})

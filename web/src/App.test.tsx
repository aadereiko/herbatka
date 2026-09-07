import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import App from './App'
import { ThemeProvider } from './components/ui/theme'

afterEach(() => vi.restoreAllMocks())

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

test('shows ok once the API reports a healthy database', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', database: 'ok', version: '0.1.0' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  renderApp()
  await waitFor(() => expect(screen.getByTestId('status-api')).toHaveTextContent('ok'))
  expect(screen.getByTestId('status-database')).toHaveTextContent('ok')
  expect(screen.getByTestId('status-version')).toHaveTextContent('0.1.0')
})

test('surfaces the error when the API is unreachable', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'))
  renderApp()
  await waitFor(() =>
    expect(screen.getByTestId('status-api')).toHaveTextContent('unreachable'),
  )
  expect(screen.getByText(/connection refused/)).toBeInTheDocument()
})

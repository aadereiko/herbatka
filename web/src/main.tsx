import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppRouter } from './app/router'
import { createQueryClient } from './app/query-client'
import { AuthProvider } from './features/auth/AuthProvider'
import { ThemeProvider } from './components/ui/theme'
import './index.css'

const queryClient = createQueryClient()

// AuthProvider sits inside QueryClientProvider and outside the router: queries fired by
// the provider's own refresh need the client, and every route guard needs the session.
//
// ThemeProvider wraps everything because the toggle lives in the nav, which every page
// renders. It is outermost of the three because it depends on nothing — no query, no
// session — and because a theme that only applied inside the router would leave the
// three full-bleed pages that render outside it painting themselves.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

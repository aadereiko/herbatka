import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppRouter } from './app/router'
import { createQueryClient } from './app/query-client'
import { AuthProvider } from './features/auth/AuthProvider'
import './index.css'

const queryClient = createQueryClient()

// AuthProvider sits inside QueryClientProvider and outside the router: queries fired by
// the provider's own refresh need the client, and every route guard needs the session.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

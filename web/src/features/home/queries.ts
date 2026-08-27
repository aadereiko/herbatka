import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { HomeSummary, PublicSummary } from '../../lib/home'
import { useViewer } from '../auth/viewer'

export const homeKeys = {
  all: ['home'] as const,
  mine: ['home', 'mine'] as const,
  public: ['home', 'public'] as const,
}

/**
 * Keyed by viewer and gated on auth settling, for the same reason the catalog queries
 * are: this response is entirely about who is asking, and a cold load would otherwise
 * cache one person's shelves under a key the next person reads.
 */
export function useHomeSummary() {
  const { viewer, authReady, isSignedIn } = useViewer()
  return useQuery({
    queryKey: [...homeKeys.mine, viewer],
    queryFn: () => api<HomeSummary>('/home'),
    enabled: authReady && isSignedIn,
  })
}

export function usePublicSummary() {
  const { authReady, isSignedIn } = useViewer()
  return useQuery({
    queryKey: homeKeys.public,
    queryFn: () => api<PublicSummary>('/home/public'),
    // Nothing in it varies by viewer, so it needs no viewer in the key — only the
    // certainty that we are not about to render the signed-in page instead.
    enabled: authReady && !isSignedIn,
  })
}

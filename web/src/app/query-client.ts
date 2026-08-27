import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '../lib/api'

/**
 * Whether a failed query is worth trying again.
 *
 * **A 4xx is an answer, not a failure.** The server understood the request and said no:
 * a tea that does not exist will not exist a second later, and 404, 403 and 422 are all
 * final. Retrying them buys a duplicate request, a second of skeleton on a page that has
 * already been answered, and — see `networkMode` below — a way to hang forever.
 *
 * 5xx and genuine transport failures are worth one more go, because those are the ones a
 * retry actually fixes. `describeApiError` already separates the two for display; this is
 * the same distinction applied to whether we ask again at all.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

/**
 * The app's query defaults.
 *
 * Extracted from `main.tsx` so the retry rule above can be tested. The tests build their
 * own `QueryClient` with `retry: false` — which is right for them and is exactly why this
 * policy needs a test of its own, since no rendering test will ever exercise it.
 *
 * `networkMode: 'always'` is deliberate and was a real bug, not a precaution. React Query
 * pauses retries when it believes the browser is offline, and a paused retry leaves the
 * query at `status: 'pending'` — indistinguishable, to a component, from a first load
 * still in flight. A 404 detail page therefore sat on its loading skeleton forever, with
 * no console error and no second request to hint at why. `navigator.onLine` is not
 * trustworthy enough to gate a same-origin API on: it reports false behind captive
 * portals and in some automation profiles, and being wrong costs a permanently frozen
 * page. Let the request go and let it fail honestly.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryQuery,
        networkMode: 'always',
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: { networkMode: 'always' },
    },
  })
}

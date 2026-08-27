import { expect, test } from 'vitest'

import { ApiError } from '../lib/api'
import { createQueryClient, retryQuery } from './query-client'

/**
 * These exist because the rendering tests cannot reach this code: every one of them
 * builds its own `QueryClient` with `retry: false`, which is right for a test and means
 * the real policy has never been exercised by anything but the browser.
 *
 * The bug that prompted them: a detail page for a slug that does not exist sat on its
 * loading skeleton forever. The 404 came back, React Query queued the retry, and then
 * paused it because it believed the browser was offline — leaving the query at
 * `status: 'pending'`, which a component cannot tell apart from a first load still in
 * flight. No console error, no second request, nothing to explain the frozen page.
 */

test('a 4xx is an answer, not a failure — it is never retried', () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    expect(retryQuery(0, new ApiError(status, 'no'))).toBe(false)
  }
})

test('a 5xx gets exactly one more go, then stops', () => {
  expect(retryQuery(0, new ApiError(500, 'boom'))).toBe(true)
  expect(retryQuery(1, new ApiError(503, 'boom'))).toBe(false)
})

test('a transport failure, which carries no status, is also worth one retry', () => {
  // `describeApiError` calls this one "could not reach the server" — the case a retry
  // actually fixes.
  expect(retryQuery(0, new TypeError('Failed to fetch'))).toBe(true)
  expect(retryQuery(1, new TypeError('Failed to fetch'))).toBe(false)
})

test('queries and mutations both ignore the browser’s offline claim', () => {
  // The whole point of the fix. `navigator.onLine` reports false behind captive portals
  // and in some automation profiles, and React Query's response to it — pausing — is
  // indistinguishable from loading. For a same-origin API, attempting and failing
  // honestly beats hanging.
  const defaults = createQueryClient().getDefaultOptions()
  expect(defaults.queries?.networkMode).toBe('always')
  expect(defaults.mutations?.networkMode).toBe('always')
})

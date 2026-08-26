import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import type { FeedItem, FeedParams } from '../../lib/friend'
import { toQuery } from '../../lib/query-string'
import { useViewer } from '../auth/viewer'

/**
 * Query keys as data, same as everywhere else.
 *
 *   ['feed']                    every page of the feed
 *   ['feed', params]            one of them
 *   ['feed', params, viewer]    …as actually cached
 *
 * `all` is the prefix the friends feature invalidates through: accepting a request,
 * unfriending and blocking each change *whose* posts belong in the stream, and there is
 * no page of it that survives that. This module deliberately exports no mutations — the
 * feed is a read of things done elsewhere, and nothing writes to it directly.
 */
export const feedKeys = {
  all: ['feed'] as const,
  page: (params: FeedParams) => ['feed', params] as const,
}

export const fetchFeed = (params: FeedParams) => api<Page<FeedItem>>(`/feed${toQuery(params)}`)

/**
 * No `enabled`: `/feed` only renders behind `RequireAuth`, which holds the whole subtree
 * back until the silent refresh has settled — so there is no cold-load window to guard
 * against, unlike the public catalog. The viewer still belongs in the key, because two
 * people signing in one after another in the same tab must not read each other's feed.
 *
 * `keepPreviousData` keeps the current page on screen, dimmed, while the next one lands.
 * A stream that blanks to skeletons on every "Next" reads as a page load rather than as
 * paging through one list.
 */
export function useFeed(params: FeedParams) {
  const { viewer } = useViewer()
  return useQuery({
    queryKey: [...feedKeys.page(params), viewer],
    queryFn: () => fetchFeed(params),
    placeholderData: keepPreviousData,
  })
}

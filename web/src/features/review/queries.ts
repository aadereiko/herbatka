import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Page } from '../../lib/catalog'
import { toQuery } from '../../lib/query-string'
import type { MyReview, Review, ReviewInput, ReviewListParams } from '../../lib/review'
import { catalogKeys } from '../catalog/queries'

/**
 * Query keys as data, same as `catalog/queries.ts` and `stock/queries.ts`.
 *
 *   ['reviews', 'tea', slug]           every page of one tea's reviews
 *   ['reviews', 'tea', slug, params]   one of them
 *   ['reviews', 'mine']                every page of your own list
 *   ['reviews', 'mine', params]        one of them
 *
 * The `'tea', slug` segment sits above the params so one invalidation covers whichever
 * page of reviews happens to be on screen, and rating a *different* tea leaves this
 * one's cache alone.
 */
export const reviewKeys = {
  all: ['reviews'] as const,
  teaLists: (slug: string) => ['reviews', 'tea', slug] as const,
  teaList: (slug: string, params: ReviewListParams) => ['reviews', 'tea', slug, params] as const,
  mineLists: ['reviews', 'mine'] as const,
  mineList: (params: ReviewListParams) => ['reviews', 'mine', params] as const,
}

const teaPath = (slug: string) => `/catalog/teas/${encodeURIComponent(slug)}`

/** Singular: the one review that is yours. The plural path below is everybody's. */
const reviewPath = (slug: string) => `${teaPath(slug)}/review`

export const fetchTeaReviews = (slug: string, params: ReviewListParams) =>
  api<Page<Review>>(`${teaPath(slug)}/reviews${toQuery(params)}`)

export const fetchMyReviews = (params: ReviewListParams) =>
  api<Page<MyReview>>(`/reviews/mine${toQuery(params)}`)

/** Public: no `enabled` on a session, because the list is the part of this feature a
 *  signed-out visitor is here for. */
export function useTeaReviews(slug: string, params: ReviewListParams) {
  return useQuery({
    queryKey: reviewKeys.teaList(slug, params),
    queryFn: () => fetchTeaReviews(slug, params),
    enabled: slug !== '',
    // The reviews already on screen stay there, dimmed, while the next page lands.
    placeholderData: keepPreviousData,
  })
}

export function useMyReviews(params: ReviewListParams) {
  return useQuery({
    queryKey: reviewKeys.mineList(params),
    queryFn: () => fetchMyReviews(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * What one rating changes, and why each of the four is here rather than three:
 *
 * - the tea's detail, because the average, `my_score` and `my_review` all moved;
 * - every cached tea list, because the card for this tea carries the average and your
 *   badge too — and the list is usually *not* mounted while you are rating, so this is
 *   the invalidation that is easiest to forget and hardest to notice missing;
 * - this tea's reviews, because yours has just joined or changed;
 * - `/reviews/mine`, for the same reason from the other end.
 *
 * Deliberately four calls rather than one broad `['catalog']` sweep: invalidating the
 * ingredient and brand lists as well would refetch two queries that a rating cannot
 * possibly have changed.
 */
function useInvalidateAfterReview(slug: string) {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: catalogKeys.teaDetail(slug) })
    void client.invalidateQueries({ queryKey: catalogKeys.teaLists })
    void client.invalidateQueries({ queryKey: reviewKeys.teaLists(slug) })
    void client.invalidateQueries({ queryKey: reviewKeys.mineLists })
  }
}

/**
 * One review per person per tea, so PUT and there is nothing to decide: the server
 * creates or replaces, and the form is the same form either way.
 *
 * Not optimistic, unlike the M3 brew tap. A rating is typed into a form and submitted
 * once; the round trip costs nothing anybody notices, and guessing at the new *average*
 * — which is what the page mostly shows — would mean reimplementing the server's
 * arithmetic in order to display a number that is about to be corrected anyway.
 */
export function useUpsertReview(slug: string) {
  const invalidate = useInvalidateAfterReview(slug)
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      api<Review>(reviewPath(slug), { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

/** 404 here means "you have no review on this tea" — which, after a delete that raced
 *  with another tab, is a state the caller should read as done rather than broken. */
export function useDeleteReview(slug: string) {
  const invalidate = useInvalidateAfterReview(slug)
  return useMutation({
    mutationFn: () => api<void>(reviewPath(slug), { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

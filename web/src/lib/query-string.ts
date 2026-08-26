export type QueryValue = string | number | boolean | null | undefined

/**
 * Turns a params object into `?a=1&b=2`, dropping anything empty.
 *
 * Dropping matters: `?q=` is not the same request as no `q` at all, and a filter the
 * user has just cleared should vanish from the URL rather than linger as an empty
 * parameter that the API then has to decide how to interpret. `false` is a real value
 * and survives — `approved=false` is the whole point of the admin queue.
 */
export function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

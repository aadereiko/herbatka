import { useEffect, useRef, useState } from 'react'

/** Long enough that ordinary typing produces one request, short enough that the list
 *  feels like it is keeping up. */
export const SEARCH_DEBOUNCE_MS = 300

/** Plain value debounce, for search boxes whose state is local to a component. */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

/**
 * Binds a text box to a value that lives in the URL, without a navigation — and a
 * request — per keystroke.
 *
 * The box stays responsive because the draft is local state; the URL, and therefore the
 * query key, and therefore the shareable link, is only rewritten once typing pauses.
 *
 * The `committed` ref is what keeps those two honest. An *external* change to the URL —
 * the back button, a "clear filters" button, a fresh link — has to overwrite whatever is
 * in the box. Our own commit coming back around through the URL must not, or every
 * character typed during the 300 ms would be thrown away the moment the first one
 * landed. Comparing against the last value we ourselves committed distinguishes them.
 */
export function useDebouncedParam(
  value: string,
  commit: (next: string) => void,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(commit)

  // Kept current so a fired timer calls today's closure, not the one from the render
  // that happened to schedule it.
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    if (value === committed.current) return
    committed.current = value
    if (timer.current) clearTimeout(timer.current)
    setDraft(value)
  }, [value])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function change(next: string) {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      committed.current = next
      commitRef.current(next)
    }, delayMs)
  }

  return [draft, change]
}

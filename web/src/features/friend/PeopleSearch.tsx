import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Badge, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useDebouncedValue } from '../../lib/debounce'
import type { FriendRequest, SearchResult } from '../../lib/friend'
import { SEND_REQUEST_FAILED, USER_SEARCH_MIN_LENGTH } from '../../lib/friend'
import { useAuth } from '../auth/auth-context'
import { ConfirmAction, PersonIdentity, RowError } from './PersonRow'
import {
  useAcceptFriendRequest,
  useBlockUser,
  useFriendRequests,
  useSendFriendRequest,
  useUserSearch,
} from './queries'

/**
 * The one action a result's state leaves open, and nothing else.
 *
 * A row that offers "Add friend" to somebody who is already a friend is not a cosmetic
 * slip — it is a button whose only possible outcome is a 409, so the state decides the
 * control rather than decorating it.
 *
 * `blocked` gets neither a verb nor an explanation beyond the badge: unblocking belongs
 * in one place, the Blocked section, where the consequence is spelled out. And it never
 * gets a *second* block affordance — see `SearchRow`.
 */
function ResultAction({
  result,
  isYou,
  incomingId,
  pending,
  onAdd,
  onAccept,
}: {
  result: SearchResult
  isYou: boolean
  /** The open request's own id, which `SearchResult` does not carry — see `SearchRow`. */
  incomingId: string | null
  pending: boolean
  onAdd: () => void
  onAccept: (requestId: string) => void
}) {
  const testId = `search-state-${result.user.id}`

  // Before the state, because the server has no idea this row is you and will happily
  // report `none`. Sending yourself a request is a 400 the UI should never let you find.
  if (isYou) {
    return (
      <span data-testid={testId} className="text-xs text-neutral-500 dark:text-neutral-400">
        This is you
      </span>
    )
  }

  switch (result.state) {
    case 'none':
      return (
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          ariaLabel={`Add ${result.user.display_name} as a friend`}
          testId={`add-${result.user.id}`}
          onClick={onAdd}
        >
          Add friend
        </Button>
      )

    case 'outgoing':
      return (
        <span data-testid={testId}>
          <Badge>Requested</Badge>
        </span>
      )

    case 'incoming':
      // They asked first, so the useful button is Accept, not "Add friend" — which would
      // be a second request crossing the first, and a 409.
      return incomingId ? (
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          ariaLabel={`Accept ${result.user.display_name}`}
          testId={`search-accept-${result.user.id}`}
          onClick={() => onAccept(incomingId)}
        >
          Accept
        </Button>
      ) : (
        <span data-testid={testId}>
          <Badge tone="amber">Wants to be friends</Badge>
        </span>
      )

    case 'friends':
      return (
        <span data-testid={testId}>
          <Badge tone="brand">Friends</Badge>
        </span>
      )

    case 'blocked':
      return (
        <span data-testid={testId} className="text-xs text-neutral-500 dark:text-neutral-400">
          —
        </span>
      )
  }
}

function SearchRow({
  result,
  isYou,
  incomingId,
  confirmingBlock,
  onConfirmBlock,
  onCancelBlock,
  error,
  pending,
  onAdd,
  onAccept,
  onBlock,
}: {
  result: SearchResult
  isYou: boolean
  incomingId: string | null
  confirmingBlock: boolean
  onConfirmBlock: () => void
  onCancelBlock: () => void
  error?: string
  pending: boolean
  onAdd: () => void
  onAccept: (requestId: string) => void
  onBlock: () => void
}) {
  // Two conditions, and both are the point of this line. Not yourself, because blocking
  // your own account is nonsense the server would have to refuse. And not somebody
  // already blocked: offering "Block" to a row that reads `blocked` is at best a no-op
  // button, and at worst it reads as "the last block did not take".
  const canBlock = !isYou && result.state !== 'blocked'

  return (
    <li
      data-testid="search-result"
      data-state={result.state}
      className="flex flex-wrap items-center gap-2 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <PersonIdentity user={result.user} />
        {error && <RowError testId={`search-error-${result.user.id}`}>{error}</RowError>}
      </div>
      <span className="flex items-center gap-2">
        <ResultAction
          result={result}
          isYou={isYou}
          incomingId={incomingId}
          pending={pending}
          onAdd={onAdd}
          onAccept={onAccept}
        />
        {canBlock && (
          <ConfirmAction
            open={confirmingBlock}
            onOpen={onConfirmBlock}
            onCancel={onCancelBlock}
            onConfirm={onBlock}
            label="Block"
            confirmLabel="Really block"
            ariaLabel={`Block ${result.user.display_name}`}
            pending={pending}
            testId={`search-block-${result.user.id}`}
            confirmTestId={`confirm-search-block-${result.user.id}`}
          />
        )}
      </span>
    </li>
  )
}

/**
 * Finding somebody to add.
 *
 * Two rules the server owns and this box only explains: a display name matches on any
 * part of it, an email has to be exact. That asymmetry is a privacy decision — partial
 * email matching turns this endpoint into an address-book scraper — so the hint says it
 * plainly rather than letting people conclude the search is broken.
 *
 * Debounced, like every other search in the app, and short queries are not sent at all.
 */
export function PeopleSearch() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const settled = useDebouncedValue(query)
  const results = useUserSearch(settled.trim())
  const requests = useFriendRequests()

  const send = useSendFriendRequest()
  const accept = useAcceptFriendRequest()
  const block = useBlockUser()

  const [confirmingBlock, setConfirmingBlock] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const items = results.data ?? []
  const pending = send.isPending || accept.isPending || block.isPending
  const tooShort = settled.trim().length < USER_SEARCH_MIN_LENGTH

  /** `SearchResult` carries a state but not a request id, and accept addresses the
   *  request. The pending list is already loaded on this page for the panel above, so
   *  the id is a lookup rather than a fifth endpoint. */
  function incomingIdFor(userId: string): string | null {
    const match = (requests.data ?? []).find(
      (request: FriendRequest) => request.direction === 'incoming' && request.user.id === userId,
    )
    return match?.id ?? null
  }

  function handleAdd(result: SearchResult) {
    setError(null)
    send.mutate(result.user.id, {
      // Every failure, one sentence. A 404 from this endpoint means they blocked you,
      // and an error message that differs from the others is a block that tells them.
      // See `SEND_REQUEST_FAILED` in `lib/friend.ts`.
      onError: () => setError({ id: result.user.id, message: SEND_REQUEST_FAILED }),
    })
  }

  function handleAccept(result: SearchResult, requestId: string) {
    setError(null)
    accept.mutate(requestId, {
      onError: (cause) => setError({ id: result.user.id, message: describeApiError(cause) }),
    })
  }

  function handleBlock(result: SearchResult) {
    setError(null)
    block.mutate(result.user.id, {
      onSuccess: () => setConfirmingBlock(null),
      onError: (cause) => {
        setConfirmingBlock(null)
        setError({ id: result.user.id, message: describeApiError(cause) })
      },
    })
  }

  return (
    <Panel ariaLabel="Find people" testId="people-search">
      <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">Find people</h2>

      <TextField
        id="people-search-q"
        label="Search for somebody"
        type="search"
        value={query}
        onChange={setQuery}
        placeholder="Ada, or ada@example.com"
        hint="Part of a name is enough. An email address has to be exact."
      />

      {results.isError && (
        <div className="mt-2">
          <RowError testId="search-failed">{describeApiError(results.error)}</RowError>
        </div>
      )}

      {tooShort && (
        <p data-testid="search-hint" className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {settled.trim().length === 0
            ? 'Type a name or an email address to look somebody up.'
            : `Keep going — ${USER_SEARCH_MIN_LENGTH} characters at least.`}
        </p>
      )}

      {!tooShort && results.isPending && (
        <div role="status" aria-live="polite" data-testid="search-loading" className="mt-2">
          <span className="sr-only">Searching…</span>
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!tooShort && !results.isPending && !results.isError && items.length === 0 && (
        <p data-testid="search-empty" className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Nobody matches “{settled.trim()}”. Names match on part of them; an email address
          has to be typed in full.
        </p>
      )}

      {items.length > 0 && (
        <ul
          data-testid="search-results"
          className={`mt-2 divide-y divide-brand-100 dark:divide-neutral-800 ${
            results.isFetching ? 'opacity-60' : ''
          }`}
        >
          {items.map((result) => (
            <SearchRow
              key={result.user.id}
              result={result}
              isYou={result.user.id === user?.id}
              incomingId={incomingIdFor(result.user.id)}
              confirmingBlock={confirmingBlock === result.user.id}
              onConfirmBlock={() => {
                setError(null)
                setConfirmingBlock(result.user.id)
              }}
              onCancelBlock={() => setConfirmingBlock(null)}
              error={error?.id === result.user.id ? error.message : undefined}
              pending={pending}
              onAdd={() => handleAdd(result)}
              onAccept={(requestId) => handleAccept(result, requestId)}
              onBlock={() => handleBlock(result)}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

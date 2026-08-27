import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { SEND_REQUEST_FAILED } from '../../lib/friend'
import type { ProfileFriendState, PublicProfile } from '../../lib/profile'
import { ConfirmAction, RowError } from '../friend/PersonRow'
import {
  useAcceptFriendRequest,
  useDismissFriendRequest,
  useFriendRequests,
  useSendFriendRequest,
  useUnblockUser,
  useUnfriend,
} from '../friend/queries'
import { profileKeys } from './queries'

/**
 * The one thing you can do about this person from here.
 *
 * Every state gets exactly one verb, for the reason `/friends` gives at length: a button
 * whose only possible outcome is a 409 is worse than no button. The mutations are the
 * ones the friends page already uses — nothing about a request changes because it was
 * sent from a profile rather than from a search result.
 *
 * Never rendered for `'self'` (the page offers editing instead) or for a signed-out
 * visitor (`friend_state` is null, and there is nothing to offer somebody with no
 * account). That the component is not mounted at all in the second case is the point:
 * `useFriendRequests` would otherwise fire an authenticated request on a public page.
 *
 * `incoming` and `outgoing` need the *request's* id, which `PublicProfile` does not carry
 * — accept and cancel both address the request, not the person. `GET /friends/requests`
 * is small, unpaginated and already cached for the nav badge, so it is a lookup rather
 * than a sixth endpoint. Until it lands, the state is shown as a badge rather than as a
 * button that would post to `/friends/requests/null/accept`.
 */
export function FriendAction({
  profile,
  state,
}: {
  profile: PublicProfile
  /** Passed separately so the caller has already ruled out null and `'self'`, and this
   *  switch is exhaustive over what is left. */
  state: Exclude<ProfileFriendState, 'self'>
}) {
  const client = useQueryClient()
  const requests = useFriendRequests()
  const send = useSendFriendRequest()
  const accept = useAcceptFriendRequest()
  const dismiss = useDismissFriendRequest()
  const unfriend = useUnfriend()
  const unblock = useUnblockUser()

  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'unfriend' | null>(null)

  const pending =
    send.isPending ||
    accept.isPending ||
    dismiss.isPending ||
    unfriend.isPending ||
    unblock.isPending

  /** The friend mutations invalidate `['friends']`, which this page is not part of —
   *  and `friend_state` is the field that has just changed. Without this the button
   *  stays on "Add friend" after the request has gone. */
  function refreshProfile() {
    void client.invalidateQueries({ queryKey: profileKeys.detail(profile.id) })
  }

  const options = {
    onSuccess: () => {
      setConfirming(null)
      refreshProfile()
    },
    onError: (cause: unknown) => {
      setConfirming(null)
      setError(describeApiError(cause))
    },
  }

  const requestId =
    (requests.data ?? []).find((request) => request.user.id === profile.id)?.id ?? null

  function action() {
    switch (state) {
      case 'none':
        return (
          <Button
            variant="primary"
            disabled={pending}
            testId="profile-add-friend"
            ariaLabel={`Add ${profile.display_name} as a friend`}
            onClick={() => {
              setError(null)
              // Every failure, one sentence: a 404 here means they have blocked you, and
              // an error that reads differently is a block that announces itself.
              send.mutate(profile.id, {
                onSuccess: refreshProfile,
                onError: () => setError(SEND_REQUEST_FAILED),
              })
            }}
          >
            Add friend
          </Button>
        )

      case 'incoming':
        return requestId ? (
          <Button
            variant="primary"
            disabled={pending}
            testId="profile-accept"
            ariaLabel={`Accept ${profile.display_name}`}
            onClick={() => {
              setError(null)
              accept.mutate(requestId, options)
            }}
          >
            Accept friend request
          </Button>
        ) : (
          <Badge tone="amber">Wants to be friends</Badge>
        )

      case 'outgoing':
        return requestId ? (
          <Button
            disabled={pending}
            testId="profile-cancel-request"
            ariaLabel={`Cancel your request to ${profile.display_name}`}
            onClick={() => {
              setError(null)
              dismiss.mutate(requestId, options)
            }}
          >
            Cancel request
          </Button>
        ) : (
          <Badge>Request sent</Badge>
        )

      case 'friends':
        return (
          <>
            <Badge tone="brand">Friends</Badge>
            <ConfirmAction
              open={confirming === 'unfriend'}
              onOpen={() => {
                setError(null)
                setConfirming('unfriend')
              }}
              onCancel={() => setConfirming(null)}
              onConfirm={() => unfriend.mutate(profile.id, options)}
              label="Unfriend"
              confirmLabel="Really unfriend"
              ariaLabel={`Unfriend ${profile.display_name}`}
              pending={pending}
              testId="profile-unfriend"
              confirmTestId="profile-confirm-unfriend"
            />
          </>
        )

      case 'blocked':
        // One step, unlike blocking: unblocking restores nothing and endangers nothing —
        // you are strangers again, not friends again.
        return (
          <Button
            disabled={pending}
            testId="profile-unblock"
            ariaLabel={`Unblock ${profile.display_name}`}
            onClick={() => {
              setError(null)
              unblock.mutate(profile.id, options)
            }}
          >
            Unblock
          </Button>
        )
    }
  }

  return (
    <div data-testid="profile-friend-action" className="flex flex-wrap items-center gap-2">
      {action()}
      {error && <RowError testId="profile-friend-error">{error}</RowError>}
    </div>
  )
}

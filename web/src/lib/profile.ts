/**
 * The M8 profiles contract.
 *
 * Aliases of the API's own OpenAPI schemas, like every other file in `lib/` — a renamed
 * Pydantic field breaks this build rather than a component at runtime.
 *
 * Two things worth reading twice before touching a profile screen:
 *
 *  - **`PublicProfile` has no email, and that is deliberate.** The endpoint is public: a
 *    signed-out stranger with a user id can read it. `UserRef` carries an address because
 *    it only appears once the two of you are connected — a friends list, a household —
 *    and there it is how you tell two people with the same display name apart. A profile
 *    is at a different distance, so there is no address to render, and the fact that
 *    `useAuth().user.email` is to hand on your *own* profile is not a reason to put one
 *    there.
 *  - **`friend_state` is null when nobody is signed in**, and `'self'` when the profile is
 *    yours. Both are "show no friend buttons", but for opposite reasons, and the page
 *    treats them as two branches rather than one falsy check — `'self'` gets an edit link
 *    where a signed-out visitor gets nothing at all.
 */
import type { components } from './generated/api'

export type ProfileReview = components['schemas']['ProfileReview']

export type PublicProfile = components['schemas']['PublicProfile']

/**
 * `PATCH /auth/me`. Every field optional and every one nullable, which is the usual
 * distinction: omitted means "leave it alone", `null` means "clear it". The settings form
 * sends only the keys that actually changed, so an untouched bio is never re-sent — two
 * tabs editing different halves of one profile then do not overwrite each other.
 *
 * `display_name` is nullable in the schema because every field on the body is, but
 * clearing it is not a thing a person can be: the form refuses to submit an empty one and
 * never sends null for it.
 */
export type ProfileUpdate = components['schemas']['ProfileUpdate']

/** The six values `friend_state` takes when somebody is signed in. Null — nobody is — is
 *  excluded here so a `switch` over it has to handle the six and nothing else. */
export type ProfileFriendState = NonNullable<PublicProfile['friend_state']>

/* ------------------------------------------------------------------------- limits */

/**
 * The server's own `max_length` on the bio, repeated here so the counter under the box
 * agrees with the thing that will refuse it. The server remains the authority; this is
 * what turns "422 Unprocessable Entity" into a number somebody can see while typing.
 */
export const BIO_MAX_LENGTH = 1000

export const DISPLAY_NAME_MAX_LENGTH = 80

export const PRONOUNS_MAX_LENGTH = 40

export const LOCATION_MAX_LENGTH = 120

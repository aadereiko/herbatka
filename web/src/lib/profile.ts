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

/* --------------------------------------------------------- who they are connected to */

/**
 * Somebody named on a profile — one of their friends.
 *
 * A face and a name and nothing else, and in particular no email, where the `UserRef` a
 * friends list or a members list carries does have one. Same reason the profile itself
 * has none: those lists only ever describe people you are already connected to, and this
 * one can name a friend-of-a-friend you have never met.
 */
export type ProfilePerson = components['schemas']['ProfilePerson']

/**
 * One of their households, as much of it as you are allowed to know about.
 *
 * `shared` is the load-bearing field, and it is about *you*, not about the household:
 * true means you are a member of it too. False means it is theirs and not yours — you
 * may see that it exists and what it is called, and `GET /households/{id}` will answer
 * you 404 by design. Anything that turns one of those into a link is offering a link to
 * a "not found" page.
 */
export type ProfileHousehold = components['schemas']['ProfileHousehold']

/**
 * **`households` and `friends` arrive already filtered, and the client must not try to
 * filter them again.** The server decides what this viewer may see — everything on your
 * own profile and on a friend's, only the households you are both in and the friends you
 * have in common for anybody else signed in, and nothing at all for a signed-out
 * visitor. What you are not allowed to see never reaches the browser, so there is
 * nothing here to re-derive and no way to re-derive it correctly if you tried.
 *
 * That is also what `household_count` and `friend_count` now mean: the size of what *you*
 * were shown, not the person's real totals. The API deliberately does not send the
 * totals, because "showing 2 of 5" would publish the very number the rule exists to
 * withhold — so never render one of these against a total, and never invent one.
 */
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

export const CITY_MAX_LENGTH = 120

export const STATUS_MAX_LENGTH = 140

/**
 * A country as the API hands it out: the stored code plus a label to print.
 *
 * The app stores and sends the **code** (`PL`), never the name. Codes are stable and
 * names are presentation — `Türkiye` was `Turkey` until 2022 — so a column of labels
 * would need a data migration every time a country renamed itself. Responses carry the
 * name alongside so that rendering one profile does not mean holding all 249.
 */
export type Country = components['schemas']['Country']

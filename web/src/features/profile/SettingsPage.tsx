import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import {
  FormError,
  FormNote,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '../../components/ui/form'
import { IMAGE_UPLOAD_HINT, ImageUploadField } from '../../components/ui/image-upload'
import { PageHeading, PageShell, Panel } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { User } from '../../lib/api'
import { TEA_TYPES, TEA_TYPE_LABELS, isTeaType } from '../../lib/catalog'
import type { TeaType } from '../../lib/catalog'
import {
  BIO_MAX_LENGTH,
  CITY_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  PRONOUNS_MAX_LENGTH,
  STATUS_MAX_LENGTH,
} from '../../lib/profile'
import type { ProfileUpdate } from '../../lib/profile'
import { useAuth } from '../auth/auth-context'
import { useCountries, useUpdateProfile } from './queries'

/** '' is a real option, not a placeholder: "no favourite" is a thing to be, and the only
 *  way to say it again once you have said something else. */
const TEA_TYPE_OPTIONS = [
  { value: '', label: 'No favourite' },
  ...TEA_TYPES.map((type) => ({ value: type, label: TEA_TYPE_LABELS[type] })),
]

/** An empty text field means "I have not said", which the API spells `null`. The empty
 *  string would be a bio of length zero, which is a different claim. */
function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

type Errors = Partial<Record<'display_name' | 'pronouns' | 'status' | 'city' | 'bio', string>>

/**
 * The country picker, and the one thing worth knowing about it.
 *
 * The list is fetched, never bundled, so the options and the server's validator cannot
 * disagree — a country in this dropdown that `PATCH /auth/me` rejects is a form nobody
 * can submit. While it is in flight the select still renders, with the person's *current*
 * country as its only option: the alternative is a control that appears empty for a beat
 * and looks like it has forgotten what you told it.
 *
 * '' is a real choice rather than a placeholder — "not saying" is a thing to be, and
 * without it there would be no way to take a country back off once set.
 */
function CountryField({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const countries = useCountries()
  const { user } = useAuth()

  const options = [
    { value: '', label: 'Not saying' },
    ...(countries.data
      ? countries.data.map((country) => ({ value: country.code, label: country.name }))
      : user?.country
        ? [{ value: user.country.code, label: user.country.name }]
        : []),
  ]

  return (
    <SelectField
      id="country"
      label="Country"
      value={value}
      onChange={onChange}
      options={options}
      disabled={countries.isPending}
      hint={countries.isError ? 'The country list could not be loaded.' : undefined}
    />
  )
}

function SettingsForm({ user }: { user: User }) {
  const save = useUpdateProfile()

  // Seeded once, from the session. Not re-synced afterwards: the only thing that can
  // change `user` while this form is on screen is this form saving, and re-seeding from
  // the response would fight anything typed since.
  const [displayName, setDisplayName] = useState(user.display_name)
  const [pronouns, setPronouns] = useState(user.pronouns ?? '')
  const [status, setStatus] = useState(user.status ?? '')
  const [city, setCity] = useState(user.city ?? '')
  const [countryCode, setCountryCode] = useState(user.country?.code ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [favourite, setFavourite] = useState<TeaType | ''>(user.favourite_tea_type ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url)

  const [errors, setErrors] = useState<Errors>({})
  const [note, setNote] = useState<string | null>(null)

  /** The server's own limits, checked here so a 422 becomes a sentence beside the field
   *  that caused it. The server is still the authority. */
  function validate(): Errors {
    const found: Errors = {}
    const name = displayName.trim()
    if (name === '') found.display_name = 'Tell us what to call you.'
    else if (name.length > DISPLAY_NAME_MAX_LENGTH) {
      found.display_name = `${DISPLAY_NAME_MAX_LENGTH} characters at most.`
    }
    if (pronouns.trim().length > PRONOUNS_MAX_LENGTH) {
      found.pronouns = `${PRONOUNS_MAX_LENGTH} characters at most.`
    }
    if (status.trim().length > STATUS_MAX_LENGTH) {
      found.status = `${STATUS_MAX_LENGTH} characters at most.`
    }

    if (city.trim().length > CITY_MAX_LENGTH) {
      found.city = `${CITY_MAX_LENGTH} characters at most.`
    }
    if (bio.trim().length > BIO_MAX_LENGTH) {
      found.bio = `${BIO_MAX_LENGTH} characters at most.`
    }
    return found
  }

  /** Only the keys whose value is not already the one the server holds. */
  function changes(): ProfileUpdate {
    const patch: ProfileUpdate = {}

    const name = displayName.trim()
    if (name !== user.display_name) patch.display_name = name

    const nextPronouns = trimmedOrNull(pronouns)
    if (nextPronouns !== user.pronouns) patch.pronouns = nextPronouns

    const nextStatus = trimmedOrNull(status)
    if (nextStatus !== user.status) patch.status = nextStatus

    const nextCity = trimmedOrNull(city)
    if (nextCity !== user.city) patch.city = nextCity

    // '' is "no country", which the API spells null — the same distinction the text
    // fields make. Compared against the *code*, never the name: the name is presentation
    // and can change without the person having touched this form.
    const nextCountry = countryCode === '' ? null : countryCode
    if (nextCountry !== (user.country?.code ?? null)) patch.country_code = nextCountry

    const nextBio = trimmedOrNull(bio)
    if (nextBio !== user.bio) patch.bio = nextBio

    const nextFavourite = favourite === '' ? null : favourite
    if (nextFavourite !== user.favourite_tea_type) patch.favourite_tea_type = nextFavourite

    if (avatarUrl !== user.avatar_url) patch.avatar_url = avatarUrl

    return patch
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setNote(null)
    save.reset()

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const patch = changes()
    if (Object.keys(patch).length === 0) {
      setNote('Nothing to save — that is already what we have.')
      return
    }

    save.mutate(patch, { onSuccess: () => setNote('Saved.') })
  }

  return (
    <form data-testid="settings-form" onSubmit={onSubmit} className="space-y-4">
      <TextField
        id="display-name"
        label="Display name"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="name"
        error={errors.display_name}
      />

      <TextField
        id="pronouns"
        label="Pronouns"
        value={pronouns}
        onChange={setPronouns}
        placeholder="she/her"
        hint="Shown beside your name. Leave it empty to say nothing."
        error={errors.pronouns}
      />

      <TextField
        id="status"
        label="Status"
        value={status}
        onChange={setStatus}
        placeholder="Working through a kilo of dan cong"
        hint="One line about what you are drinking lately. Shown under your name."
        error={errors.status}
      />

      {/* City free, country from a list. A city is a place as you describe it and there
          is no canonical list of those worth arguing with; a country typed freehand gives
          you "UK", "U.K.", "United Kingdom" and "England" in one column, and then no
          filter can ever group them. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="city"
          label="City"
          value={city}
          onChange={setCity}
          placeholder="Kraków"
          error={errors.city}
        />
        <CountryField value={countryCode} onChange={setCountryCode} />
      </div>

      <TextAreaField
        id="bio"
        label="About you"
        value={bio}
        onChange={setBio}
        rows={5}
        hint={`${bio.trim().length} of ${BIO_MAX_LENGTH} characters.`}
        error={errors.bio}
      />

      <SelectField
        id="favourite-tea-type"
        label="Favourite kind of tea"
        value={favourite}
        onChange={(value) => setFavourite(isTeaType(value) ? value : '')}
        options={TEA_TYPE_OPTIONS}
      />

      <ImageUploadField
        id="avatar"
        label="Picture"
        value={avatarUrl}
        onChange={setAvatarUrl}
        hint={IMAGE_UPLOAD_HINT}
        previewAlt="Your profile picture"
        disabled={save.isPending}
      />

      {save.isError && <FormError>{describeApiError(save.error)}</FormError>}
      {note && <FormNote testId="settings-note">{note}</FormNote>}

      <SubmitButton pending={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </SubmitButton>
    </form>
  )
}

/**
 * Your own profile, edited. `/settings`, behind `RequireAuth`.
 *
 * No user id in the URL, because `PATCH /auth/me` has no version that edits somebody
 * else — a route shaped like `/users/:id/edit` would suggest one exists.
 *
 * **It sends only what changed.** Every field on the body is optional, so the diff is
 * expressible, and it buys more than tidiness: two tabs open on this form, one fixing a
 * typo in the bio and one setting a picture, do not overwrite each other. "Nothing
 * changed" is its own outcome and makes no request at all, rather than a PATCH that
 * rewrites six fields to the values they already hold.
 */
export function SettingsPage() {
  const { user } = useAuth()

  return (
    <PageShell>
      <PageHeading
        title="Settings"
        subtitle="How you appear to everybody else."
        actions={
          user && (
            <Link
              to={`/users/${user.id}`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              View your profile →
            </Link>
          )
        }
      />

      {/* RequireAuth renders nothing until the session settles, so the null branch is
          unreachable in practice. Keying on the id remounts the form if the account
          somehow changes underneath it, rather than leaving one person's bio in another
          person's boxes. */}
      <Panel>{user && <SettingsForm key={user.id} user={user} />}</Panel>
    </PageShell>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import { FormError, TextAreaField, TextField } from '../../components/ui/form'
import { BrewIcon } from '../../components/ui/botanical'
import type { BrewGlyph } from '../../components/ui/botanical'
import { Badge, Panel } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { BrewingInput, BrewingNote, TeaDetail } from '../../lib/catalog'
import { useAuth } from '../auth/auth-context'
import { formatBrewTime } from './format'
import { useDeleteBrewing, useSetBrewing } from './queries'

/** The catalog's three numbers, lifted off a tea so the two sources can be compared
 *  field by field rather than as two opaque blobs. */
type Figures = {
  brew_temp_c: number | null
  brew_seconds: number | null
  grams_per_100ml: number | null
}

function hasAny(figures: Figures): boolean {
  return (
    figures.brew_temp_c !== null ||
    figures.brew_seconds !== null ||
    figures.grams_per_100ml !== null
  )
}

const formatTemp = (value: number) => `${value}°C`
const formatDose = (value: number) => `${value} g / 100 ml`

/** "80°C · 3 min 30 s · 1.5 g / 100 ml", skipping whatever is missing. One line rather
 *  than a second grid: the catalog's numbers are the footnote once you have your own. */
function describeFigures(figures: Figures): string {
  return [
    figures.brew_temp_c === null ? null : formatTemp(figures.brew_temp_c),
    figures.brew_seconds === null ? null : formatBrewTime(figures.brew_seconds),
    figures.grams_per_100ml === null ? null : formatDose(figures.grams_per_100ml),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * One figure, and — when there are two possible sources for it — whose it is.
 *
 * The caption is the whole point of the personal-notes feature: a page that silently
 * swaps 80°C for 95°C leaves you unable to tell whether you set that or the catalog did.
 * It is absent entirely when you have no note of your own, because then there is only one
 * source and labelling it every time is noise.
 */
function SpecRow({
  label,
  value,
  source,
  glyph,
}: {
  label: string
  value: string
  source?: string
  /** The drawn instrument above the number. */
  glyph: BrewGlyph
}) {
  return (
    // A fact tile is set *into* the card, not raised off it: the fill is the page
    // ground with a 1px rule round it. It used to be `neutral-800`, which is the rule
    // colour and so has to stay bright — and the eyebrow inside it is `neutral-400`,
    // which measures 3.82 on that fill and 6.75 on this one.
    <div className="rounded-sm border border-brand-200 bg-brand-50 p-3 text-center dark:border-neutral-800 dark:bg-neutral-950">
      {/* A thermometer, a sand timer and a spoon of leaf — this is the one screen in the
          app that reads as a page out of a tea merchant's notebook, and three drawn
          instruments over three numbers is what makes it read that way rather than as a
          stats row.

          `aria-hidden`, and the `<dt>` under it still says "Water" in words. The icon is
          never the only thing naming the measurement: at a glance a thermometer and a
          timer are distinguishable, and at 20px in a hurry they are not. */}
      <BrewIcon glyph={glyph} className="mx-auto mb-1.5 size-6 text-leaf-600" />
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-brand-900 dark:text-brand-100">{value}</dd>
      {source && (
        <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {source}
        </p>
      )}
    </div>
  )
}

function numberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

/** `''` means "no opinion about this one" and is not an error — it is how you keep the
 *  catalog's temperature while overriding its steep time. Anything else has to be a real
 *  non-negative number, because "abt 90" silently becoming NaN is worse than a refusal. */
function readOptionalNumber(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return { value: null, error: 'Use a number, or leave it blank.' }
  return { value }
}

type FieldErrors = { temp?: string; seconds?: string; dose?: string }

/** The four boxes, and the two ways out of them. Split from the panel so that opening the
 *  form re-seeds every field from `mine` — a remount is the cheapest correct reset after
 *  a save or a removal. */
function BrewingForm({
  slug,
  mine,
  onClose,
}: {
  slug: string
  mine: BrewingNote | null
  onClose: () => void
}) {
  const [temp, setTemp] = useState(numberInput(mine?.brew_temp_c ?? null))
  const [seconds, setSeconds] = useState(numberInput(mine?.brew_seconds ?? null))
  const [dose, setDose] = useState(numberInput(mine?.grams_per_100ml ?? null))
  const [note, setNote] = useState(mine?.note ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const save = useSetBrewing(slug)
  const remove = useDeleteBrewing(slug)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedTemp = readOptionalNumber(temp)
    const parsedSeconds = readOptionalNumber(seconds)
    const parsedDose = readOptionalNumber(dose)

    const next: FieldErrors = {}
    if (parsedTemp.error) next.temp = parsedTemp.error
    if (parsedSeconds.error) next.seconds = parsedSeconds.error
    if (parsedDose.error) next.dose = parsedDose.error
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // All four keys, every time, as explicit nulls where a box was left empty. Omitting
    // one would leave the server to decide what "unmentioned" means, and clearing a
    // temperature you had set has to be expressible as something other than silence.
    const input: BrewingInput = {
      brew_temp_c: parsedTemp.value,
      brew_seconds: parsedSeconds.value,
      grams_per_100ml: parsedDose.value,
      note: note.trim() === '' ? null : note.trim(),
    }
    save.mutate(input, { onSuccess: onClose })
  }

  return (
    <div className="mt-4 space-y-3 border-t border-brand-100 pt-4 dark:border-neutral-800">
      <form noValidate onSubmit={handleSubmit} data-testid="brewing-form" className="space-y-3">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Leave a box empty to keep the catalog’s number for it.
        </p>
        <TextField
          id="brewing-temp"
          label="Water"
          type="number"
          min={0}
          value={temp}
          onChange={setTemp}
          error={errors.temp}
          hint="Degrees C."
        />
        <TextField
          id="brewing-seconds"
          label="Steep"
          type="number"
          min={0}
          value={seconds}
          onChange={setSeconds}
          error={errors.seconds}
          hint="Seconds."
        />
        <TextField
          id="brewing-dose"
          label="Leaf"
          type="number"
          min={0}
          step={0.1}
          value={dose}
          onChange={setDose}
          error={errors.dose}
          hint="Grams per 100 ml."
        />
        <TextAreaField
          id="brewing-note"
          label="Note (optional)"
          value={note}
          onChange={setNote}
          rows={2}
          placeholder="Second steep is the good one."
        />

        {save.isError && (
          <FormError testId="brewing-error">{describeApiError(save.error)}</FormError>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending} testId="save-brewing">
            {save.isPending ? 'Saving…' : 'Save my numbers'}
          </Button>
          <Button variant="ghost" testId="cancel-brewing" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>

      {/* Two steps and no `window.confirm`, as everywhere else that throws something
          away: this is the only control on the page that can lose what you typed. */}
      {mine && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmingRemove ? (
            <>
              <Button
                variant="danger"
                testId="confirm-remove-brewing"
                disabled={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
              >
                Really use the catalog’s
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingRemove(false)}>
                Keep mine
              </Button>
            </>
          ) : (
            <Button variant="danger" testId="remove-brewing" onClick={() => setConfirmingRemove(true)}>
              Use the catalog’s instead
            </Button>
          )}
          {remove.isError && (
            <FormError testId="brewing-remove-error">{describeApiError(remove.error)}</FormError>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * How to brew it — the catalog's answer, and yours where you have one.
 *
 * Your numbers are the ones in the big type, because they are the ones you are going to
 * follow; the catalog's stay on the page, one line down and labelled as the catalog's,
 * because "what does the tin say" is exactly the question you ask right after deciding
 * your own 95°C was too hot. Neither is ever silently substituted for the other: every
 * figure in the grid says whose it is as soon as there are two sources to confuse.
 *
 * The fallback is per *field*, not per note. Somebody who only disagrees about the water
 * temperature sets one box and leaves the rest, and the grid then reads "yours, the
 * catalog's, the catalog's" — which is both the honest description and the one that makes
 * the empty boxes in the form mean what they look like they mean.
 *
 * Signed out there is no form and no invitation to make one: just the catalog's figures,
 * exactly as before M8. The panel disappears entirely when there is nothing to say and
 * nobody who could say it — an empty bordered box captioned "no brewing guidance" is a
 * hole in the page rather than an answer.
 */
export function BrewingPanel({ tea }: { tea: TeaDetail }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)

  const catalog: Figures = {
    brew_temp_c: tea.brew_temp_c,
    brew_seconds: tea.brew_seconds,
    grams_per_100ml: tea.grams_per_100ml,
  }
  // `?? null` rather than a bare read: a server that has not shipped `my_brewing` yet
  // sends the key as absent, and `undefined` must land in the same branch as "you have
  // no note" rather than rendering a panel about one.
  const mine = tea.my_brewing ?? null

  // What is actually in force, field by field. `??` and not `||`: a deliberate 0 g of
  // leaf is nonsense, but a deliberate 0 seconds is not, and neither should be swallowed
  // by a falsy check.
  const inForce: Figures = {
    brew_temp_c: mine?.brew_temp_c ?? catalog.brew_temp_c,
    brew_seconds: mine?.brew_seconds ?? catalog.brew_seconds,
    grams_per_100ml: mine?.grams_per_100ml ?? catalog.grams_per_100ml,
  }

  const showSources = mine !== null
  const yours = 'yours'
  const theirs = 'the catalog’s'

  // Nothing to show and nobody to ask: no panel. A signed-in visitor always gets one,
  // because for them the panel is also the way to record the first set of numbers.
  if (!user && !hasAny(inForce)) return null

  return (
    <Panel ariaLabel="How to brew it" className="h-fit">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-900 dark:text-brand-100">How to brew it</h2>
        {showSources && (
          <span data-testid="brewing-yours-badge">
            <Badge tone="brand">Your numbers</Badge>
          </span>
        )}
      </div>

      {hasAny(inForce) ? (
        <dl className="grid grid-cols-3 gap-2 lg:grid-cols-1" data-testid="tea-brewing">
          {inForce.brew_temp_c !== null && (
            <SpecRow
              glyph="temperature"
              label="Water"
              value={formatTemp(inForce.brew_temp_c)}
              source={showSources ? (mine?.brew_temp_c != null ? yours : theirs) : undefined}
            />
          )}
          {inForce.brew_seconds !== null && (
            <SpecRow
              glyph="time"
              label="Steep"
              value={formatBrewTime(inForce.brew_seconds)}
              source={showSources ? (mine?.brew_seconds != null ? yours : theirs) : undefined}
            />
          )}
          {inForce.grams_per_100ml !== null && (
            <SpecRow
              glyph="leaf"
              label="Leaf"
              value={formatDose(inForce.grams_per_100ml)}
              source={showSources ? (mine?.grams_per_100ml != null ? yours : theirs) : undefined}
            />
          )}
        </dl>
      ) : (
        <p data-testid="brewing-none" className="text-sm text-neutral-500 dark:text-neutral-400">
          Nobody has recorded how to brew this one. Yours can be the first.
        </p>
      )}

      {/* The catalog's own line, kept whenever yours is covering it — and only then,
          because otherwise the grid above already *is* the catalog's answer. */}
      {showSources && hasAny(catalog) && (
        <p
          data-testid="tea-brewing-catalog"
          className="mt-3 text-xs text-neutral-500 dark:text-neutral-400"
        >
          The catalog says {describeFigures(catalog)}.
        </p>
      )}

      {mine?.note && (
        <p
          data-testid="tea-brewing-note"
          className="mt-3 border-t border-brand-100 pt-3 text-sm leading-relaxed text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
        >
          {mine.note}
        </p>
      )}

      {user &&
        (editing ? (
          // Keyed on the note, so saving or removing one re-seeds every box from what
          // came back rather than from what was there when the form first opened.
          <BrewingForm
            key={mine?.updated_at ?? 'none'}
            slug={tea.slug}
            mine={mine}
            onClose={() => setEditing(false)}
          />
        ) : (
          <div className="mt-4">
            <Button size="sm" testId="toggle-brewing-form" onClick={() => setEditing(true)}>
              {mine ? 'Edit your numbers' : 'Use your own numbers'}
            </Button>
          </div>
        ))}
    </Panel>
  )
}

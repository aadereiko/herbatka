import { Field } from '../../components/ui/form'

/**
 * A slider, which the shared form primitives do not have.
 *
 * Here rather than in `components/ui/form.tsx` deliberately: nothing the app ships needs a
 * range input, and adding one to the shared file for a dev-only workbench would push a
 * component nobody maintains into the set every screen imports. It borrows `Field`, so the
 * label, hint and `aria-describedby` wiring are the app's and not a second version of them.
 */
export function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  readOut,
  hint,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** The number, formatted. Shown beside the label rather than under the track, because
   *  a value that moves under the thumb is a value you cannot read while dragging. */
  readOut: string
  hint?: string
}) {
  return (
    <Field id={id} label={`${label} — ${readOut}`} hint={hint}>
      <input
        id={id}
        name={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        // `accent-brand-600` for the same reason `CheckboxField` needs it: a native range
        // ignores `text-*` and would otherwise draw its track in Chrome's own blue, the
        // only cold colour on the page.
        className="w-full accent-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 dark:accent-brand-400"
      />
    </Field>
  )
}

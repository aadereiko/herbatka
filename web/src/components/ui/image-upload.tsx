import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_LABEL,
  describeRejectedFile,
  describeUploadError,
  uploadImage,
} from '../../lib/upload'
import { Button } from './button'
import { Field } from './form'

/**
 * Pick a picture, see it, keep it or drop it.
 *
 * Three screens need this — a household's photo, a shop's, a tea's — and they need the
 * same five things, which is why it is one component rather than three near-copies:
 *
 *  1. **The check happens before the upload.** `describeRejectedFile` runs on the `File`
 *     the moment it is chosen, and a rejection returns without touching the network. A
 *     40 MB photo on a phone tether must not cost forty seconds and then a 413. The
 *     server still enforces both limits — this is a courtesy, not the gate.
 *  2. **A preview**, because "did that work?" is otherwise unanswerable until save.
 *  3. **A pending state** on the button and the input, since the upload is the one part
 *     of any of these forms slow enough to be worth reporting.
 *  4. **A clear button**, and it clears to `null` rather than `''` — the PATCH shapes
 *     distinguish "remove the picture" from "leave it alone", and only null says the
 *     first.
 *  5. **413 and 415 in words**, via `describeUploadError`.
 *
 * The parent owns the URL. This component never holds it in state, so a form that
 * remounts to reset itself resets this too, and the value that gets submitted is always
 * the one on screen.
 *
 * The file input is uncontrolled and reset by hand after every attempt. Without that,
 * choosing the same file twice — the obvious thing to do after a transient failure —
 * fires no `change` event at all, and the retry silently does nothing.
 */
export function ImageUploadField({
  id,
  label,
  value,
  onChange,
  hint,
  /** What the picture is *of*, for the preview's alt text. "Preview" alone tells a
   *  screen-reader user nothing about which of three forms they are in. */
  previewAlt,
  disabled,
}: {
  id: string
  label: string
  value: string | null
  onChange: (url: string | null) => void
  hint?: string
  previewAlt: string
  disabled?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: uploadImage,
    onSuccess: (result) => {
      setError(null)
      onChange(result.url)
    },
    onError: (cause) => setError(describeUploadError(cause)),
  })

  function reset() {
    // The input's value, not the preview: see the note above about re-picking the same
    // file after a failure.
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleFile(file: File | undefined) {
    if (!file) return

    const rejection = describeRejectedFile(file)
    if (rejection) {
      setError(rejection)
      reset()
      return
    }

    setError(null)
    upload.mutate(file, { onSettled: reset })
  }

  function clear() {
    setError(null)
    upload.reset()
    reset()
    onChange(null)
  }

  return (
    <Field id={id} label={label} error={error ?? undefined} hint={hint}>
      <div className="space-y-2">
        {value ? (
          <img
            src={value}
            alt={previewAlt}
            data-testid={`${id}-preview`}
            className="h-28 w-28 rounded-xl object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            data-testid={`${id}-placeholder`}
            className="grid h-28 w-28 place-items-center rounded-xl bg-brand-100 text-3xl dark:bg-neutral-800"
          >
            🍃
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={id}
            name={id}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            disabled={disabled || upload.isPending}
            data-testid={`${id}-input`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-300"
          />

          {value && !upload.isPending && (
            <Button variant="ghost" size="sm" testId={`${id}-clear`} onClick={clear}>
              Remove
            </Button>
          )}
        </div>

        {upload.isPending && (
          <p
            role="status"
            aria-live="polite"
            data-testid={`${id}-pending`}
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            Uploading…
          </p>
        )}
      </div>
    </Field>
  )
}

/** The sentence every caller puts under the control, so all three say the same thing. */
export const IMAGE_UPLOAD_HINT = `JPEG, PNG or WebP, up to ${MAX_IMAGE_LABEL}.`

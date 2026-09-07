import type { RefObject } from 'react'

import { Button } from '../../components/ui/button'
import { CheckboxField, SelectField } from '../../components/ui/form'
import { SectionLabel } from '../../components/ui/page'
import { RangeField } from './controls'
import { NO_PREPROCESS } from './preprocess'
import type { BinariseMode, PreprocessOptions } from './preprocess'

/**
 * The knobs, and the before/after that justifies them.
 *
 * Side by side rather than a toggle between the two, and at the same width: the question
 * being asked here is "did that make the lettering crisper *or* did it eat it", and an
 * A/B you have to flip between answers that badly. On a phone they stack, which is fine —
 * this is a workbench and it is used at a desk.
 *
 * Every step is independently switchable because the point is attribution. A single
 * "clean up the image" button that did all six would tell the maintainer that OCR got
 * better and nothing about which knob did it.
 */

const BINARISE_OPTIONS: readonly { value: BinariseMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'otsu', label: 'Otsu (one global threshold)' },
  { value: 'adaptive', label: 'Adaptive (Bradley, local mean)' },
]

export function PreprocessPanel({
  options,
  onChange,
  originalRef,
  processedRef,
  hasImage,
  sourceSize,
  processedSize,
  msPreprocess,
}: {
  options: PreprocessOptions
  onChange: (options: PreprocessOptions) => void
  originalRef: RefObject<HTMLCanvasElement | null>
  processedRef: RefObject<HTMLCanvasElement | null>
  hasImage: boolean
  sourceSize: { width: number; height: number } | null
  processedSize: { width: number; height: number } | null
  msPreprocess: number | null
}) {
  const set = <K extends keyof PreprocessOptions>(key: K, value: PreprocessOptions[K]) =>
    onChange({ ...options, [key]: value })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2.5">
          <CheckboxField
            id="pp-greyscale"
            label="Greyscale (Rec. 601 luma)"
            checked={options.greyscale}
            onChange={(checked) => set('greyscale', checked)}
          />
          <CheckboxField
            id="pp-contrast"
            label="Contrast stretch (2% tails clipped)"
            checked={options.contrast}
            onChange={(checked) => set('contrast', checked)}
          />
          <CheckboxField
            id="pp-invert"
            label="Invert (white text on a dark tin)"
            checked={options.invert}
            onChange={(checked) => set('invert', checked)}
          />
          <CheckboxField
            id="pp-upscale"
            label="Upscale 2× (Tesseract wants 20–30px tall text)"
            checked={options.upscale}
            onChange={(checked) => set('upscale', checked)}
          />
        </div>

        <div className="space-y-3">
          <SelectField
            id="pp-binarise"
            label="Binarise"
            value={options.binarise}
            onChange={(value) => set('binarise', value as BinariseMode)}
            options={BINARISE_OPTIONS}
            hint="Adaptive is the one to try when half the tin is in shadow — no single threshold can be right for both halves."
          />
          <RangeField
            id="pp-rotate"
            label="Straighten"
            value={options.rotateDegrees}
            min={-30}
            max={30}
            step={0.25}
            readOut={`${options.rotateDegrees.toFixed(2)}°`}
            onChange={(value) => set('rotateDegrees', value)}
            hint="Combined with the upscale into one resample, so straightening does not soften what the upscale sharpened."
          />
          <Button size="sm" variant="ghost" onClick={() => onChange(NO_PREPROCESS)}>
            Reset every knob
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="m-0">
          <SectionLabel as="p">
            Original {sourceSize ? `· ${sourceSize.width}×${sourceSize.height}` : ''}
          </SectionLabel>
          <canvas
            ref={originalRef}
            // `w-full h-auto` on a canvas whose attributes are the image's own pixel
            // dimensions: the bitmap keeps full resolution for `getImageData` while the
            // element scales to the column.
            className={`block h-auto w-full rounded-xl border border-brand-200 dark:border-neutral-700 ${hasImage ? '' : 'hidden'}`}
          />
          {!hasImage && (
            <p className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-6 text-center text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              No image yet.
            </p>
          )}
        </figure>

        <figure className="m-0">
          <SectionLabel as="p">
            Processed {processedSize ? `· ${processedSize.width}×${processedSize.height}` : ''}
            {msPreprocess !== null ? ` · ${msPreprocess.toFixed(0)} ms` : ''}
          </SectionLabel>
          <canvas
            ref={processedRef}
            className={`block h-auto w-full rounded-xl border border-brand-200 dark:border-neutral-700 ${hasImage ? '' : 'hidden'}`}
          />
          {!hasImage && (
            <p className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-6 text-center text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              This is what Tesseract will actually be given.
            </p>
          )}
        </figure>
      </div>
    </div>
  )
}

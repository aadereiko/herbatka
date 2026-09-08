import { Button } from '../../components/ui/button'
import { CheckboxField, FormNote, SelectField, TextAreaField } from '../../components/ui/form'
import { Badge } from '../../components/ui/page'
import { PAGE_SEG_MODES, TIN_WHITELIST, USER_WORDS_NOTE } from './ocr'
import type { OcrParams, OcrProgress, OcrResult, PageSegMode } from './ocr'

/**
 * Tesseract's own knobs, plus the run button and the stopwatch.
 *
 * Two of the three parameters here are honest disappointments and are exposed anyway,
 * because "we tried it and it does nothing" is a finding a bench is supposed to be able
 * to deliver. See `OcrParams.charWhitelist` and `USER_WORDS_NOTE` for what each of them
 * actually does under the LSTM engine — which is: not much. The page segmentation mode is
 * the one that genuinely moves the needle on a tin, so it is first.
 */

const PSM_OPTIONS = Object.entries(PAGE_SEG_MODES).map(([value, label]) => ({ value, label }))

export function TesseractPanel({
  params,
  onChange,
  userWordsEnabled,
  onUserWordsEnabledChange,
  userWordCount,
  onRun,
  onReset,
  busy,
  progress,
  result,
  msPreprocess,
  stale,
  disabled,
}: {
  params: OcrParams
  onChange: (params: OcrParams) => void
  userWordsEnabled: boolean
  onUserWordsEnabledChange: (enabled: boolean) => void
  userWordCount: number
  onRun: () => void
  onReset: () => void
  busy: boolean
  progress: OcrProgress | null
  result: OcrResult | null
  msPreprocess: number | null
  /** True when a knob moved after the last run, so the numbers on screen no longer
   *  describe the image beside them. */
  stale: boolean
  disabled: boolean
}) {
  const total =
    result === null ? null : (msPreprocess ?? 0) + result.msRecognise

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="ts-psm"
          label="Page segmentation mode"
          value={params.pageSegMode}
          onChange={(value) => onChange({ ...params, pageSegMode: value as PageSegMode })}
          options={PSM_OPTIONS}
          hint="The single most useful Tesseract setting on a curved surface."
        />
        <div className="space-y-2.5">
          <CheckboxField
            id="ts-spaces"
            label="preserve_interword_spaces"
            checked={params.preserveInterwordSpaces}
            onChange={(checked) => onChange({ ...params, preserveInterwordSpaces: checked })}
          />
          <CheckboxField
            id="ts-userwords"
            label={`Inject the catalog as user-words (${userWordCount} words)`}
            checked={userWordsEnabled}
            onChange={onUserWordsEnabledChange}
          />
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{USER_WORDS_NOTE}</p>
        </div>
      </div>

      <div className="space-y-2">
        <TextAreaField
          id="ts-whitelist"
          label="tessedit_char_whitelist"
          value={params.charWhitelist}
          onChange={(value) => onChange({ ...params, charWhitelist: value })}
          rows={2}
          hint="Empty means unset. Tesseract 4+ largely ignores this under the LSTM engine — it was a legacy-engine feature. Set it and watch nothing change."
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ ...params, charWhitelist: TIN_WHITELIST })}
        >
          Fill with the tin set
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onRun} disabled={busy || disabled} testId="ocr-run">
          {busy ? 'Recognising…' : 'Run OCR'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
          Drop the worker (force a cold start)
        </Button>
        {stale && !busy && <Badge tone="amber">settings changed since this run</Badge>}
      </div>

      {busy && progress && (
        <FormNote testId="ocr-progress">
          {progress.status} — {Math.round(progress.progress * 100)}%. The first run on a cold
          browser profile fetches ~4 MB of language model; every run after it is served from
          IndexedDB.
        </FormNote>
      )}

      {result && (
        <dl
          data-testid="ocr-timings"
          className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4"
        >
          <Stat label="Preprocess" value={msPreprocess === null ? '—' : `${msPreprocess.toFixed(0)} ms`} />
          <Stat label="Recognise" value={`${result.msRecognise.toFixed(0)} ms`} />
          <Stat label="Total" value={total === null ? '—' : `${total.toFixed(0)} ms`} />
          <Stat label="Mean confidence" value={`${Math.round(result.meanConfidence)}%`} />
          <Stat label="Lines" value={String(result.lines.length)} />
          <Stat label="Worker" value={result.workerSource === 'local' ? 'node_modules' : 'CDN'} />
          <Stat
            label="Language model"
            value={result.langSource === 'local' ? '/tessdata' : 'CDN (cached)'}
          />
          <Stat label="user-words" value={result.userWordsLoaded ? 'loaded' : 'not used'} />
        </dl>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="tabular-nums font-semibold text-brand-900 dark:text-brand-100">{value}</dd>
    </div>
  )
}

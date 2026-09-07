import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { FormNote } from '../../components/ui/form'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Panel,
  SectionLabel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useDebouncedValue } from '../../lib/debounce'
import { RangeField } from './controls'
import { DraftPanel } from './DraftPanel'
import { buildDraft } from './draft'
import { LineOverlay } from './LineOverlay'
import { LinesTable } from './LinesTable'
import { NO_OCR_PARAMS, resetOcrWorker, runOcr } from './ocr'
import type { OcrParams, OcrProgress, OcrResult } from './ocr'
import { applyPreprocess, NO_PREPROCESS } from './preprocess'
import type { PreprocessOptions } from './preprocess'
import { PreprocessPanel } from './PreprocessPanel'
import { useVocabulary } from './queries'
import { TesseractPanel } from './TesseractPanel'
import { matchLines } from './vocabulary'

/**
 * A workbench for answering one question before the feature that needs it gets built:
 * **how well does client-side OCR actually read a tea tin, and how much of what it gets
 * wrong can this catalog repair by itself?**
 *
 * It is not a feature. It is not in the nav, it is not linked from anywhere, and
 * `app/router.tsx` mounts it behind `import.meta.env.DEV` so it is not in a production
 * bundle at all — see the note there for why that is a stronger gate than a role check.
 *
 * ## The three panels, and what each is for
 *
 * 1. **Preprocessing.** Six independently switchable transforms, original beside
 *    processed, with the cost in milliseconds. The point is attribution: which single knob
 *    rescued this photograph.
 * 2. **Tesseract.** Its own parameters, including the two that turn out not to work under
 *    the LSTM engine. Exposing a knob that does nothing is a finding, not an oversight.
 * 3. **The catalog.** The half that matters. Every line is fuzzy-matched against the real
 *    vocabulary from `/catalog/{ingredients,brands,teas}` and both sides of every repair
 *    are printed, with the threshold on a slider so precision and recall trade off while
 *    you watch.
 *
 * ## Why the preprocessing runs in an effect and not on a button
 *
 * The before/after is the argument for each knob, so it has to move when the knob moves.
 * It is debounced rather than live because the adaptive threshold on a 12 MP phone
 * photograph is a real second of arithmetic, and a slider that fires it per pointer event
 * is a slider you cannot drag. The elapsed figure is left on screen deliberately: slow
 * preprocessing is a result too, given the eventual feature has to run this on a phone.
 */

type Source = {
  name: string
  bitmap: ImageBitmap
  width: number
  height: number
}

type Size = { width: number; height: number }

/** Above this, a match is shown as a repair. 0.78 is the default because it is roughly
 *  where "CHAMOMLE"→Chamomile (0.89) and "ORANCE PEEL"→Orange peel (0.91) are in and
 *  "MINT"→Hint-of-something is out — but the whole point of the slider is that this
 *  number is a guess until the maintainer has looked at their own tins. */
const DEFAULT_THRESHOLD = 0.78

/** Tesseract's own per-line confidence, below which the draft ignores a line entirely.
 *  60 is the conventional "probably a mis-read" line. */
const DEFAULT_MIN_CONFIDENCE = 60

export function OcrBenchPage() {
  const [source, setSource] = useState<Source | null>(null)
  const [options, setOptions] = useState<PreprocessOptions>(NO_PREPROCESS)
  const [params, setParams] = useState<OcrParams>(NO_OCR_PARAMS)
  const [userWordsEnabled, setUserWordsEnabled] = useState(false)
  const [matchThreshold, setMatchThreshold] = useState(DEFAULT_THRESHOLD)
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE)

  const [result, setResult] = useState<OcrResult | null>(null)
  const [ranWith, setRanWith] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [msPreprocess, setMsPreprocess] = useState<number | null>(null)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [processedSize, setProcessedSize] = useState<Size | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [dropping, setDropping] = useState(false)

  const originalRef = useRef<HTMLCanvasElement | null>(null)
  const processedRef = useRef<HTMLCanvasElement | null>(null)
  const objectUrl = useRef<string | null>(null)

  const vocabulary = useVocabulary()
  // Memoised on the query's own data rather than written as a bare `?? []`. That literal
  // is a new array every render, which would make each of the three `useMemo`s below
  // recompute the whole match pass on every keystroke anywhere on the page.
  const entries = useMemo(() => vocabulary.data?.entries ?? [], [vocabulary.data])

  // Debounced, not deferred: `useDeferredValue` would still run the full pipeline for
  // every intermediate slider value, just at a lower priority, and the adaptive threshold
  // is expensive enough that "lower priority" is not the same as "not at all".
  const settledOptions = useDebouncedValue(options, 220)

  /* ------------------------------------------------------------------- the picture */

  // Only setters are closed over, and those are stable, so this needs no `useCallback` —
  // the paste listener below can hold the first instance forever and still be correct.
  async function loadFile(file: File | null | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(`${file.name || 'That file'} is ${file.type || 'not an image'}.`)
      return
    }
    try {
      // `imageOrientation: 'from-image'` is not optional for this bench. A phone stores a
      // portrait photograph as landscape pixels plus an EXIF rotation flag, and a canvas
      // drawn without honouring it hands Tesseract a tin lying on its side — which reads
      // as "OCR is hopeless" rather than as "the image is rotated".
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      setSource({
        name: file.name || 'pasted image',
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
      })
      setResult(null)
      setRanWith(null)
      setSelected(null)
      setError(null)
    } catch {
      setError('That file could not be decoded as an image.')
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) =>
        candidate.type.startsWith('image/'),
      )
      if (item) void loadFile(item.getAsFile())
    }
    // On the document rather than on the drop zone: a paste has to work without having
    // first clicked something, and a div is not focusable.
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  /* -------------------------------------------------------------- the preprocessing */

  useEffect(() => {
    const original = originalRef.current
    const processed = processedRef.current
    if (!source || !original || !processed) return

    original.width = source.width
    original.height = source.height
    const from = original.getContext('2d')
    const to = processed.getContext('2d')
    if (!from || !to) return
    from.drawImage(source.bitmap, 0, 0)

    const startedAt = performance.now()
    const input = from.getImageData(0, 0, source.width, source.height)
    const output = applyPreprocess(input, settledOptions)
    setMsPreprocess(performance.now() - startedAt)

    processed.width = output.width
    processed.height = output.height
    // `createImageData` then `.set`, rather than `new ImageData(output.data, w, h)`: the
    // steps in `preprocess.ts` hand back a plain object, and this is the one place that
    // has to turn it back into the real thing.
    const painted = to.createImageData(output.width, output.height)
    painted.data.set(output.data)
    to.putImageData(painted, 0, 0)
    setProcessedSize({ width: output.width, height: output.height })

    // An object URL rather than `toDataURL`: a 12 MP canvas serialises to a ~10 MB base64
    // string, and holding one of those in React state on every slider settle is how a
    // bench starts stuttering for reasons that have nothing to do with OCR.
    processed.toBlob((blob) => {
      if (!blob) return
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(blob)
      setProcessedUrl(objectUrl.current)
    })
  }, [source, settledOptions])

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    [],
  )

  /* ------------------------------------------------------------------------- the run */

  const signature = JSON.stringify({ settledOptions, params, userWordsEnabled })
  const stale = result !== null && ranWith !== null && ranWith !== signature

  const userWords = useMemo(() => entries.map((item) => item.name), [entries])

  async function run() {
    const canvas = processedRef.current
    if (!canvas || !source) return
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const outcome = await runOcr(
        canvas,
        { ...params, userWords: userWordsEnabled ? userWords : [] },
        setProgress,
      )
      setResult(outcome)
      setRanWith(signature)
      setSelected(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function coldStart() {
    await resetOcrWorker()
    setResult(null)
    setRanWith(null)
  }

  /* ------------------------------------------------------------------- the catalog */

  const matches = useMemo(
    () =>
      result === null
        ? []
        : matchLines(
            result.lines.map((line) => line.text),
            entries,
            matchThreshold,
          ),
    [result, entries, matchThreshold],
  )

  const repairCount = matches
    .flat()
    .filter((match) => match.ocrText !== match.entry.key).length
  const exactCount = matches.flat().length - repairCount

  const draft = useMemo(
    () =>
      result === null || processedSize === null
        ? null
        : buildDraft(result.lines, entries, {
            minConfidence,
            matchThreshold,
            imageHeight: processedSize.height,
          }),
    [result, entries, minConfidence, matchThreshold, processedSize],
  )

  /* ----------------------------------------------------------------------- the page */

  return (
    <PageShell>
      <PageHeading
        title="OCR bench"
        subtitle="Dev only. Not in the nav, not in a production build — a workbench for the photograph-a-tin prefill, not the feature itself."
        actions={<Badge tone="amber">import.meta.env.DEV</Badge>}
      />

      <div className="space-y-6">
        {error && <ErrorNote testId="ocr-error">{error}</ErrorNote>}

        <Panel ariaLabel="The photograph">
          <SectionLabel>The photograph</SectionLabel>
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDropping(true)
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDropping(false)
              void loadFile(event.dataTransfer.files?.[0])
            }}
            className={`rounded-2xl border border-dashed p-6 text-center transition-colors ${
              dropping
                ? 'border-brand-500 bg-brand-100 dark:border-brand-400 dark:bg-neutral-800'
                : 'border-brand-300 bg-brand-50 dark:border-neutral-600 dark:bg-neutral-950'
            }`}
          >
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Drop a photograph here, paste one from the clipboard, or pick a file.
            </p>
            <input
              id="ocr-file"
              name="ocr-file"
              type="file"
              accept="image/*"
              data-testid="ocr-file"
              onChange={(event) => void loadFile(event.target.files?.[0])}
              // The same `btn-file` recipe `ImageUploadField` uses, so the picker on this
              // page is the picker everywhere else in the app.
              className="btn-file mt-3 text-sm text-neutral-700 dark:text-neutral-300"
            />
            {source && (
              <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
                {source.name} · {source.width}×{source.height}
              </p>
            )}
          </div>
        </Panel>

        <Panel ariaLabel="Preprocessing">
          <SectionLabel>Preprocessing</SectionLabel>
          <PreprocessPanel
            options={options}
            onChange={setOptions}
            originalRef={originalRef}
            processedRef={processedRef}
            hasImage={source !== null}
            sourceSize={source ? { width: source.width, height: source.height } : null}
            processedSize={processedSize}
            msPreprocess={msPreprocess}
          />
        </Panel>

        <Panel ariaLabel="Tesseract">
          <SectionLabel>Tesseract</SectionLabel>
          <TesseractPanel
            params={params}
            onChange={setParams}
            userWordsEnabled={userWordsEnabled}
            onUserWordsEnabledChange={setUserWordsEnabled}
            userWordCount={userWords.length}
            onRun={() => void run()}
            onReset={() => void coldStart()}
            busy={busy}
            progress={progress}
            result={result}
            msPreprocess={msPreprocess}
            stale={stale}
            disabled={source === null}
          />
        </Panel>

        <Panel ariaLabel="The catalog vocabulary">
          <SectionLabel>The catalog vocabulary</SectionLabel>
          {vocabulary.isPending && <Skeleton className="h-4 w-64" />}
          {vocabulary.isError && (
            <ErrorNote testId="vocab-error">
              {describeApiError(vocabulary.error)} — the repair column and the caffeine
              derivation both need the live API, so start it and reload.
            </ErrorNote>
          )}
          {vocabulary.data && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {vocabulary.data.counts.ingredients} ingredients,{' '}
                {vocabulary.data.counts.brands} brands and {vocabulary.data.counts.teas} teas —{' '}
                {entries.length} words, fetched live. Nothing here is hardcoded.
              </p>
              {vocabulary.data.truncated && (
                <FormNote testId="vocab-truncated">
                  At least one endpoint has more than one page of 100, so this is matching
                  against a truncated dictionary. Raise the page size in{' '}
                  <code>dev/ocr/queries.ts</code> before trusting a miss.
                </FormNote>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <RangeField
                  id="vocab-threshold"
                  label="Match threshold"
                  value={matchThreshold}
                  min={0.5}
                  max={1}
                  step={0.01}
                  readOut={matchThreshold.toFixed(2)}
                  onChange={setMatchThreshold}
                  hint="Drag it down and watch false matches appear; drag it up and watch real repairs disappear. Both directions are the finding."
                />
                <RangeField
                  id="vocab-confidence"
                  label="Line confidence floor"
                  value={minConfidence}
                  min={0}
                  max={100}
                  step={1}
                  readOut={`${minConfidence}%`}
                  onChange={setMinConfidence}
                  hint="Lines below this are struck through in the table and ignored by the draft."
                />
              </div>
              {result && (
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  <strong className="font-semibold text-brand-900 dark:text-brand-100">
                    {repairCount}
                  </strong>{' '}
                  {repairCount === 1 ? 'repair' : 'repairs'} the catalog made for free, and{' '}
                  {exactCount} {exactCount === 1 ? 'word' : 'words'} OCR already had exactly
                  right.
                </p>
              )}
            </div>
          )}
        </Panel>

        {result === null ? (
          <EmptyState title="Nothing recognised yet" testId="ocr-empty">
            <p>
              Load a photograph, then press <strong>Run OCR</strong>. The first run fetches
              the language model; after that it is served from IndexedDB.
            </p>
          </EmptyState>
        ) : (
          <>
            <Panel ariaLabel="Recognised lines">
              <SectionLabel>
                Recognised lines
                {stale ? ' — settings have changed since this run' : ''}
              </SectionLabel>
              {/* `items-start` is load-bearing. A grid item stretches to the row height by
                  default, which made the overlay's bordered box taller than the image
                  inside it — and since the boxes are positioned as a percentage of that
                  box, every one of them drifted downwards by the difference. The bug
                  looked like bad box arithmetic and was a stretched container. */}
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                {processedUrl && processedSize && (
                  <LineOverlay
                    imageUrl={processedUrl}
                    width={processedSize.width}
                    height={processedSize.height}
                    lines={result.lines}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
                <LinesTable
                  lines={result.lines}
                  matches={matches}
                  minConfidence={minConfidence}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
            </Panel>

            {draft && (
              <Panel ariaLabel="What would be prefilled">
                <SectionLabel>What would be prefilled</SectionLabel>
                <DraftPanel draft={draft} />
              </Panel>
            )}

            <Panel ariaLabel="Raw text" tone="inset">
              <SectionLabel>Tesseract&rsquo;s raw text</SectionLabel>
              <pre
                data-testid="ocr-raw"
                className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-700 dark:text-neutral-200"
              >
                {result.text.trim() === '' ? '(nothing)' : result.text}
              </pre>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard?.writeText(result.text)}
                >
                  Copy the raw text
                </Button>
              </div>
            </Panel>
          </>
        )}
      </div>
    </PageShell>
  )
}

/** `React.lazy` in `app/router.tsx` needs a default export; the named one above is what
 *  keeps this file reading like the forty other page components beside it. */
export default OcrBenchPage

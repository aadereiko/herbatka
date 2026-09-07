/**
 * The tesseract.js side of the bench: one lazily-loaded worker, kept alive between runs.
 *
 * ## Lazy, and why it has to be
 *
 * tesseract.js drags in a 2.9 MB WASM core and a ~4 MB language model. Nothing in this
 * file may be reachable from the app's entry graph, so the *only* import of it is inside
 * the `import.meta.env.DEV` branch in `app/router.tsx`, which Vite folds to `false` and
 * Rollup then drops along with everything it referenced. The `import('tesseract.js')`
 * below is a second layer of the same idea: even on the bench, the WASM is not fetched
 * until the maintainer actually presses the button.
 *
 * ## Where the bytes come from
 *
 * By default tesseract.js fetches its worker script, its WASM core *and* its language
 * data from jsdelivr. The first two are pointed at the copies npm already installed
 * (`?url`, so Vite serves them out of `node_modules`) — `tesseract-core-simd-lstm.wasm.js`
 * rather than the bare `.wasm` because that build has the WASM base64-inlined, which is
 * what lets a single URL work with no sibling file to resolve.
 *
 * `eng.traineddata` is the honest gap: it is ~4 MB of model that does not belong in this
 * repository, so on a cold browser profile the first run fetches it from the CDN and
 * IndexedDB-caches it for every run after. Drop `eng.traineddata.gz` into
 * `web/public/tessdata/` and the probe below finds it and never touches the network at
 * all. Either way the recognition itself is local — no image ever leaves the browser.
 */

import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
// `import type * as`, not a value import. tesseract.js uses `export = Tesseract`, so this
// is the only spelling that reaches its namespace of types, and being type-only it is
// erased entirely — the module graph gains nothing and the WASM stays behind the dynamic
// `import()` in `spawn` below.
import type * as Tesseract from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'

import type { Box, OcrLine } from './draft'

/**
 * Page segmentation modes, the parameter that matters most on a tin and the one nobody
 * thinks to change.
 *
 * A tin is not a page: the name is one large line, the ingredients are a dense block, and
 * the brewing figures are scattered around a curve. `AUTO` runs full layout analysis and
 * on a curved surface it regularly decides the tin is three columns and shuffles the
 * reading order. `SPARSE_TEXT` is usually the one that rescues a bad photograph, and
 * `SINGLE_BLOCK` the one to try on a flat ingredient panel.
 */
export const PAGE_SEG_MODES = {
  '3': 'Auto (3) — full layout analysis',
  '4': 'Single column (4)',
  '6': 'Single block (6) — flat ingredient panels',
  '7': 'Single line (7)',
  '11': 'Sparse text (11) — scattered words on a curve',
  '12': 'Sparse text + OSD (12)',
} as const

export type PageSegMode = keyof typeof PAGE_SEG_MODES

/** Letters, digits and the punctuation that actually appears on a tin. Offered as a
 *  starting point for the whitelist box rather than applied by default — see the note on
 *  `charWhitelist` in `OcrParams`. */
export const TIN_WHITELIST =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;%()-/°&\''

export type OcrParams = {
  /**
   * `tessedit_char_whitelist`. Worth knowing before you reach for it: with the LSTM
   * engine — which is the only engine the default `eng.traineddata` contains — Tesseract
   * 4 and later largely *ignore* this parameter. It was a legacy-engine feature and was
   * never reimplemented for the neural recogniser. It is exposed because the brief asked
   * for it and because seeing it do nothing is itself the answer; empty means unset.
   */
  charWhitelist: string
  pageSegMode: PageSegMode
  /** `preserve_interword_spaces`. Genuinely useful on an ingredient panel, where the
   *  default collapses the spacing that separates one ingredient from the next. */
  preserveInterwordSpaces: boolean
  /**
   * A user dictionary, from the catalog vocabulary. See `USER_WORDS_NOTE` — this is
   * wired up honestly and it does not do much.
   */
  userWords: string[]
}

export const NO_OCR_PARAMS: OcrParams = {
  charWhitelist: '',
  pageSegMode: '3',
  preserveInterwordSpaces: false,
  userWords: [],
}

/**
 * The honest answer on `user-words`, printed in the UI next to its checkbox.
 *
 * It *can* be injected: `worker.writeText` reaches the worker's Emscripten filesystem, and
 * `user_words_suffix` is one of the parameters tesseract.js explicitly documents as
 * settable only through `initialize`'s config argument — so writing `./eng.user-words` and
 * then calling `reinitialize` with that suffix is the supported route, and it initialises
 * without complaint.
 *
 * What it does not do is change the output much, and the reason is structural rather than
 * a bug here. `user-words` feeds Tesseract's dawg dictionary machinery, which the legacy
 * engine used to constrain word recognition. The LSTM recogniser scores whole character
 * sequences and only consults the dictionary as a weak prior during beam search, and the
 * `eng.traineddata` that tesseract.js ships contains the LSTM model *only* — the legacy
 * components are stripped to save several megabytes. So the words are loaded into a
 * mechanism that barely runs.
 *
 * Which is why the post-hoc fuzzy layer in `vocabulary.ts` is where this feature actually
 * lives. Repairing "CHAMOMLE" after the fact is both more effective and vastly easier to
 * see than trying to stop Tesseract producing it.
 */
export const USER_WORDS_NOTE =
  'Injected via writeText + reinitialize(user_words_suffix). It loads without error, but ' +
  'the shipped eng.traineddata is LSTM-only and user-words feeds the legacy dictionary, ' +
  'so expect little or no change. The repair column is where the catalog earns its keep.'

export type OcrProgress = { status: string; progress: number }

export type OcrResult = {
  lines: OcrLine[]
  /** Tesseract's own full-text dump, newlines and all. */
  text: string
  meanConfidence: number
  /** Split out from the total so slow preprocessing is attributable rather than just
   *  felt. `OcrBenchPage` adds its own preprocessing figure beside it. */
  msRecognise: number
  /** Where the language model came from, so a slow first run has an explanation. */
  langSource: 'local' | 'cdn'
  workerSource: 'local' | 'cdn'
  userWordsLoaded: boolean
}

/* ------------------------------------------------------------------ the worker cache */

type Loaded = {
  worker: Tesseract.Worker
  /** What the worker was *initialised* with. `user_words_suffix` cannot be changed by
   *  `setParameters`, so a change here means a `reinitialize`, not a parameter set. */
  initKey: string
  langSource: 'local' | 'cdn'
  workerSource: 'local' | 'cdn'
  userWordsLoaded: boolean
}

let loaded: Loaded | null = null
let localLangPath: string | null | undefined

/**
 * Look for a locally-vendored model, once per page load.
 *
 * A HEAD request rather than trying and catching the real fetch, because tesseract.js
 * caches a failed language load and digging that back out is worse than one cheap probe.
 *
 * And `response.ok` is **not** the test. Vite's dev server answers a request for a file
 * that does not exist with the SPA fallback: 200, `Content-Type: text/html`, the whole of
 * `index.html`. A probe that trusted the status code therefore concluded the model was
 * present, handed tesseract.js `langPath: '/tessdata'`, and it gunzipped an HTML document
 * into `eng.traineddata` — after which `api.Init` returns -1 and the only symptom is
 * "initialization failed", pointing at nothing. Rejecting `text/html` is what makes this a
 * file-existence test on a dev server rather than a status-code test.
 */
async function findLocalLangPath(): Promise<string | null> {
  if (localLangPath !== undefined) return localLangPath
  try {
    const response = await fetch('/tessdata/eng.traineddata.gz', { method: 'HEAD' })
    const contentType = response.headers.get('content-type') ?? ''
    localLangPath = response.ok && !contentType.includes('text/html') ? '/tessdata' : null
  } catch {
    localLangPath = null
  }
  return localLangPath
}

async function spawn(params: OcrParams, onProgress: (p: OcrProgress) => void): Promise<Loaded> {
  const { createWorker } = await import('tesseract.js')
  const langPath = await findLocalLangPath()

  const options = {
    workerPath: workerUrl,
    corePath: coreUrl,
    ...(langPath ? { langPath } : {}),
    logger: (message: { status: string; progress: number }) =>
      onProgress({ status: message.status, progress: message.progress }),
  }

  const initKey = params.userWords.join('\n')
  const wantsUserWords = initKey.length > 0

  // LSTM_ONLY (1) rather than DEFAULT (3), spelled as a number so this file needs no
  // value import from tesseract.js — a static one would put it back in the module graph.
  const worker = await createWorker('eng', 1, options)

  let userWordsLoaded = false
  if (wantsUserWords) {
    try {
      await worker.writeText('./eng.user-words', initKey)
      // The config-file *string* form rather than the object form. tesseract.js accepts
      // either and turns the object into exactly this string; the string is what its own
      // `InitOptions` type does not cover, and `user_words_suffix` is precisely one of the
      // parameters that type omits.
      await worker.reinitialize('eng', 1, 'user_words_suffix user-words')
      userWordsLoaded = true
    } catch {
      // Not fatal, and not worth a red banner: the whole point of the note above is that
      // this path is a curiosity rather than the feature.
      userWordsLoaded = false
    }
  }

  return {
    worker,
    initKey,
    langSource: langPath ? 'local' : 'cdn',
    workerSource: 'local',
    userWordsLoaded,
  }
}

async function getWorker(
  params: OcrParams,
  onProgress: (p: OcrProgress) => void,
): Promise<Loaded> {
  const initKey = params.userWords.join('\n')
  if (loaded && loaded.initKey === initKey) return loaded
  if (loaded) {
    await loaded.worker.terminate()
    loaded = null
  }
  loaded = await spawn(params, onProgress)
  return loaded
}

/** Drops the worker, so the next run reloads the WASM from scratch. Wired to a button:
 *  a bench where you cannot get back to a cold start cannot measure a cold start. */
export async function resetOcrWorker(): Promise<void> {
  if (!loaded) return
  const current = loaded
  loaded = null
  await current.worker.terminate()
}

/* ------------------------------------------------------------------------- the run */

function toLine(
  index: number,
  line: { text: string; confidence: number; bbox: Box },
): OcrLine {
  return {
    index,
    text: line.text.replace(/\s+$/, ''),
    confidence: line.confidence,
    box: line.bbox,
    heightPx: line.bbox.y1 - line.bbox.y0,
  }
}

export async function runOcr(
  image: HTMLCanvasElement,
  params: OcrParams,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const { worker, langSource, workerSource, userWordsLoaded } = await getWorker(params, onProgress)

  await worker.setParameters({
    // The mode is carried as its own string union here so the `<select>` can render the
    // labels; tesseract.js types it as its `PSM` enum, whose members are these same
    // strings.
    tessedit_pageseg_mode: params.pageSegMode as Tesseract.PSM,
    tessedit_char_whitelist: params.charWhitelist,
    preserve_interword_spaces: params.preserveInterwordSpaces ? '1' : '0',
  })

  const startedAt = performance.now()
  // `blocks: true` is not the default in tesseract.js v5+ — without it `data.blocks` comes
  // back null and there are no bounding boxes at all, only the flat text dump.
  const { data } = await worker.recognize(image, {}, { blocks: true, text: true })
  const msRecognise = performance.now() - startedAt

  const lines = (data.blocks ?? [])
    .flatMap((block) => block.paragraphs)
    .flatMap((paragraph) => paragraph.lines)
    .map((line, position) => toLine(position + 1, line))

  return {
    lines,
    text: data.text,
    meanConfidence: data.confidence,
    msRecognise,
    langSource,
    workerSource,
    userWordsLoaded,
  }
}

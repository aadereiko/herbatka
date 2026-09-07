/**
 * The catalog as a spell-checker.
 *
 * This is the half of the bench that is actually interesting. Tesseract's mistakes on a
 * printed tin are almost all *character* mistakes on words that are already in our
 * database — CHAMOMLE for Chamomile, BERGAM0T for Bergamot, RO0IBOS for Rooibos — and the
 * vocabulary they are drawn from is closed and about three hundred words long. Against a
 * closed vocabulary a mis-read is repairable without asking anybody anything.
 *
 * ## Why no fuzzy-search library
 *
 * The obvious pick is Fuse.js and it was rejected for one specific reason: the number it
 * returns is not a distance. Fuse scores with a bitap heuristic that folds in *where* in
 * the string the match landed and how far it is from an expected location, and the result
 * is a relevance figure tuned for ranking search-box results. That is fine when the score
 * is invisible and only the order matters. Here the score is on screen — `OCR said
 * "CHAMOMLE" → catalog has "Chamomile" (0.89)` — and sits behind a threshold slider the
 * maintainer is meant to reason about. A number nobody can predict makes the slider
 * meaningless.
 *
 * Normalised Levenshtein is the right measure for this shape of error, it is twenty lines
 * of textbook, it needs no dependency, and every claim it makes is checkable in a unit
 * test. So: hand-rolled, with two additions that a general-purpose library would not have
 * — an OCR confusion folding, and a token-window search so a vocabulary word can be found
 * *inside* a longer line.
 */

import type { Brand, IngredientTaste, TeaSummary, TeaType } from '../../lib/catalog'

export type VocabKind = 'ingredient' | 'brand' | 'tea'

export type VocabEntry = {
  kind: VocabKind
  id: string
  /** As the catalog spells it, for display. */
  name: string
  /** As we compare it: normalised, and what `wordCount` counts. */
  key: string
  wordCount: number
  /** Ingredients only. The API already returns it, and it is what `caffeine_level` on the
   *  prefilled draft is derived from rather than guessed. */
  isCaffeinated: boolean
  /** Teas only: a confident match on a tea we already stock tells us its type for free. */
  teaType: TeaType | null
}

export type VocabMatch = {
  entry: VocabEntry
  /** 0–1. 1 means the normalised strings are identical. */
  score: number
  /** What OCR actually said, so the repair column can print both halves. */
  ocrText: string
  /** Token span within the line, used to stop two entries claiming the same words. */
  from: number
  to: number
}

/**
 * Lowercase, strip accents, and reduce every run of punctuation to one space.
 *
 * The accent stripping is not cosmetic: the catalog holds "Dammann Frères" and OCR
 * essentially never returns the grave. Comparing the raw strings costs two edits out of
 * fourteen characters before the photograph has made a single real mistake.
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Collapse the glyph pairs Tesseract confuses, on both sides of the comparison.
 *
 * These are not arbitrary: they are the substitutions that dominate OCR error tables,
 * mostly digits standing in for letters of the same silhouette. Folding both the OCR text
 * *and* the catalog word means this stays a proper equivalence rather than a one-way
 * guess, so it can never favour one entry over another by accident.
 *
 * `rn`→`m` and `cl`→`d` come first because they change length, and applying them after
 * the single-character rules would let `l`→`i` eat the `l` out of `cl` first.
 */
export function foldConfusions(text: string): string {
  return text
    .replace(/rn/g, 'm')
    .replace(/cl/g, 'd')
    .replace(/vv/g, 'w')
    .replace(/[0]/g, 'o')
    .replace(/[1l|!]/g, 'i')
    .replace(/[5$]/g, 's')
    .replace(/[8]/g, 'b')
    .replace(/[6]/g, 'g')
    .replace(/[2]/g, 'z')
}

/**
 * Levenshtein distance, two rows rather than a full matrix.
 *
 * `max` is a ceiling, and it is what makes the whole layer fast enough to run on every
 * keystroke of the threshold slider: once every cell in a row is above the ceiling, no
 * later row can come back under it, so the comparison can be abandoned. `matchLine`
 * derives the ceiling from the threshold, which is why raising the threshold makes the
 * search cheaper as well as stricter.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  if (Math.abs(a.length - b.length) > max) return max + 1

  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) previous[j] = j

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (current[j] < rowMin) rowMin = current[j]
    }
    if (rowMin > max) return max + 1
    const swap = previous
    previous = current
    current = swap
  }
  return previous[b.length]
}

/** 1 for identical, 0 for nothing in common. Normalised by the longer string so a
 *  three-character mis-read of a short word is punished harder than the same three
 *  characters in a long one — which is right: "mint" and "hint" really are a coin toss,
 *  and "chamomile"/"chamomlle" really is not. */
export function similarity(a: string, b: string, minimum = 0): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  // The ceiling handed to `editDistance` is the largest distance that could still clear
  // `minimum`; anything worse does not need to be measured accurately.
  const ceiling = Math.floor((1 - minimum) * longest)
  const distance = editDistance(a, b, ceiling)
  return Math.max(0, 1 - distance / longest)
}

/** The score `matchLine` thresholds on: the better of the literal comparison and the
 *  confusion-folded one. `max` rather than folded-only because folding shortens strings
 *  (`rn`→`m`) and can, in odd cases, cost an edit it was meant to save. */
export function ocrSimilarity(a: string, b: string, minimum = 0): number {
  const literal = similarity(a, b, minimum)
  if (literal === 1) return 1
  return Math.max(literal, similarity(foldConfusions(a), foldConfusions(b), minimum))
}

/* ---------------------------------------------------------------------- the corpus */

function entry(
  kind: VocabKind,
  id: string,
  name: string,
  extras: { isCaffeinated?: boolean; teaType?: TeaType | null } = {},
): VocabEntry {
  const key = normalise(name)
  return {
    kind,
    id,
    name,
    key,
    wordCount: key === '' ? 0 : key.split(' ').length,
    isCaffeinated: extras.isCaffeinated ?? false,
    teaType: extras.teaType ?? null,
  }
}

/**
 * Build the corpus out of what the three catalog endpoints returned.
 *
 * Nothing is hardcoded here on purpose: the whole premise is that *this* maintainer's tea
 * data is the dictionary, and a word list baked into the frontend would be a different,
 * worse feature that also went stale the moment somebody added a tea.
 */
export function buildVocabulary(source: {
  ingredients: IngredientTaste[]
  brands: Brand[]
  teas: TeaSummary[]
}): VocabEntry[] {
  return [
    ...source.ingredients.map((item) =>
      entry('ingredient', item.id, item.name, { isCaffeinated: item.is_caffeinated }),
    ),
    ...source.brands.map((item) => entry('brand', item.id, item.name)),
    ...source.teas.map((item) => entry('tea', item.id, item.name, { teaType: item.tea_type })),
  ].filter((item) => item.wordCount > 0)
}

/* --------------------------------------------------------------------- the matcher */

/**
 * Find every vocabulary entry hiding in one line of OCR text.
 *
 * A whole-line comparison would be useless here, because a tin's ingredient line is
 * "INGREDIENTS: rooibos, orange peel, cinnamon bark" and no single catalog entry looks
 * anything like that. So: tokenise, then slide a window over the tokens for each entry,
 * sized to that entry's own word count and one either side. The ±1 is what tolerates the
 * two failures that actually happen — OCR splitting one word in two, or gluing two
 * together.
 *
 * Overlapping matches are resolved greedily by score, highest first, so a line yields a
 * clean set of non-overlapping repairs rather than four competing readings of the same
 * three words.
 */
export function matchLine(line: string, entries: VocabEntry[], threshold: number): VocabMatch[] {
  const tokens = normalise(line).split(' ').filter(Boolean)
  if (tokens.length === 0) return []

  const found: VocabMatch[] = []

  for (const item of entries) {
    let best: VocabMatch | null = null

    for (let size = Math.max(1, item.wordCount - 1); size <= item.wordCount + 1; size += 1) {
      for (let from = 0; from + size <= tokens.length; from += 1) {
        const candidate = tokens.slice(from, from + size).join(' ')
        // An exact bound, not a heuristic: the edit distance is at least the length
        // difference, so a candidate this far off in length cannot clear the threshold
        // however its characters line up. It removes most of the work.
        if (Math.abs(candidate.length - item.key.length) / Math.max(candidate.length, item.key.length) > 1 - threshold) {
          continue
        }
        const score = ocrSimilarity(candidate, item.key, threshold)
        if (score >= threshold && (best === null || score > best.score)) {
          best = { entry: item, score, ocrText: candidate, from, to: from + size }
        }
      }
    }

    if (best !== null) found.push(best)
  }

  found.sort((a, b) => b.score - a.score || a.from - b.from)

  const accepted: VocabMatch[] = []
  for (const match of found) {
    const clashes = accepted.some((taken) => match.from < taken.to && taken.from < match.to)
    if (!clashes) accepted.push(match)
  }
  return accepted.sort((a, b) => a.from - b.from)
}

/** Per-line matches for a whole page, in reading order. One flat list would lose which
 *  line a repair came from, and the repair column is organised by line. */
export function matchLines(
  lines: string[],
  entries: VocabEntry[],
  threshold: number,
): VocabMatch[][] {
  return lines.map((line) => matchLine(line, entries, threshold))
}

/** The single best entry for one short phrase — an ingredient label lifted out of
 *  "Jasmine 8%", say, where there is no surrounding line to window over. */
export function bestMatch(
  phrase: string,
  entries: VocabEntry[],
  threshold: number,
): VocabMatch | null {
  return matchLine(phrase, entries, threshold).reduce<VocabMatch | null>(
    (best, match) => (best === null || match.score > best.score ? match : best),
    null,
  )
}

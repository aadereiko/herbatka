/**
 * "What would this photograph have prefilled?" — the whole bench's payoff, and the file
 * where the interesting decisions are *not* to fill something in.
 *
 * The rule the file is built around: a confidently wrong prefill is worse than an empty
 * one. Somebody who opens a half-filled form fixes it; somebody who opens a form that
 * says 176 °C in a box they were not looking at saves it. So every field is a
 * `DraftField` — a value that may be null, plus a sentence saying why it holds what it
 * holds. The sentence is not a nicety: on a bench, "this field is blank" and "this field
 * is blank *because the only temperature on the tin converted to −9 °C*" are completely
 * different pieces of information, and only the second one tells you what to fix.
 *
 * `OcrLine` lives here rather than in `ocr.ts` on purpose. This module is pure — no
 * canvas, no worker, no WASM — so a test can build lines by hand, and everything that
 * needs the line shape can import it from here without dragging tesseract.js in behind it.
 */

import type { CaffeineLevel, TeaInput, TeaType } from '../../lib/catalog'
import { TEA_TYPES, TEA_TYPE_LABELS } from '../../lib/catalog'
import { extractDoses, extractShares, extractSteepTimes, extractTemperatures } from './extract'
import type { VocabEntry, VocabMatch } from './vocabulary'
import { bestMatch, matchLine, normalise, ocrSimilarity } from './vocabulary'

export type Box = { x0: number; y0: number; x1: number; y1: number }

export type OcrLine = {
  /** 1-based, as printed in the table and quoted in every `why` below. */
  index: number
  text: string
  /** Tesseract's own 0–100, not a fraction. Kept in its native units so the number in the
   *  table is the number Tesseract reported. */
  confidence: number
  box: Box
  /** Cap height in pixels — `box.y1 - box.y0`. The single most useful column on the
   *  table, because it is what the "is the text 20–30px tall?" rule of thumb is about,
   *  and it is also how the name is picked out of the top of the tin. */
  heightPx: number
}

export type DraftField<T> = {
  value: T | null
  /** Why it holds what it holds — or why it does not. Rendered beside the field. */
  why: string
}

export type DraftIngredient = {
  match: VocabMatch
  percentage: number | null
  isPrimary: boolean
  why: string
}

export type TeaDraft = {
  name: DraftField<string>
  teaType: DraftField<TeaType>
  caffeineLevel: DraftField<CaffeineLevel>
  brand: DraftField<{ id: string; name: string }>
  brewTempC: DraftField<number>
  brewSeconds: DraftField<number>
  gramsPer100ml: DraftField<number>
  ingredients: DraftIngredient[]
  ingredientsWhy: string
  /** The body we would actually POST to `/catalog/teas`, or null when something the
   *  schema requires is missing. */
  payload: TeaInput | null
  payloadWhy: string
}

export type DraftOptions = {
  /** Lines Tesseract scored below this are dropped before anything else runs. */
  minConfidence: number
  /** The vocabulary threshold — the same slider the repair column uses. */
  matchThreshold: number
  /** Needed to say "near the top of the tin". Taken from the processed canvas rather than
   *  inferred from the lines' own extent, which would call the top of a half-empty
   *  photograph the middle. */
  imageHeight: number
}

/* --------------------------------------------------------------- small shared bits */

const blank = <T,>(why: string): DraftField<T> => ({ value: null, why })

/** The catalog holds "Earl Grey", not "EARL GREY". A tin shouts; a list of teas should
 *  not, and a name that arrives in caps stays in caps forever once it is saved. Only
 *  applied to lines that are *almost entirely* upper case, so "Pu-erh" and "TeaPigs"
 *  survive untouched. */
function softenCaps(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return text
  const upper = text.replace(/[^A-Z]/g, '').length
  if (upper / letters.length < 0.8) return text
  return text
    .toLowerCase()
    .replace(/(^|[\s(\-/])([a-z])/g, (_all, lead: string, letter: string) => lead + letter.toUpperCase())
}

function lettersFraction(text: string): number {
  const stripped = text.replace(/\s/g, '')
  if (stripped.length === 0) return 0
  return stripped.replace(/[^A-Za-zÀ-ÿ]/g, '').length / stripped.length
}

const quote = (line: OcrLine) => `line ${line.index} ("${line.text.trim()}")`

/* ------------------------------------------------------------------------ tea type */

/**
 * The tea type is the one closed vocabulary that does *not* come from the API — it is an
 * enum in `lib/catalog.ts` and in a CHECK constraint, so reusing it here is reading the
 * app's own contract rather than hardcoding a word list.
 *
 * "Pu-erh" is why this windows over two tokens as well as one: `normalise` turns it into
 * "pu erh", and OCR splits it about as often as it does not.
 */
function findTeaType(
  lines: OcrLine[],
  threshold: number,
): { type: TeaType; line: OcrLine; word: string; score: number } | null {
  let best: { type: TeaType; line: OcrLine; word: string; score: number } | null = null

  for (const line of lines) {
    const tokens = normalise(line.text).split(' ').filter(Boolean)
    for (const type of TEA_TYPES) {
      const key = normalise(TEA_TYPE_LABELS[type])
      for (let size = 1; size <= 2; size += 1) {
        for (let from = 0; from + size <= tokens.length; from += 1) {
          const word = tokens.slice(from, from + size).join(' ')
          const score = ocrSimilarity(word, key, threshold)
          if (score >= threshold && (best === null || score > best.score)) {
            best = { type, line, word, score }
          }
        }
      }
    }
  }
  return best
}

/* --------------------------------------------------------------------- the builder */

export function buildDraft(
  allLines: OcrLine[],
  vocabulary: VocabEntry[],
  options: DraftOptions,
): TeaDraft {
  const { minConfidence, matchThreshold, imageHeight } = options
  const lines = allLines.filter((line) => line.confidence >= minConfidence)
  const text = lines.map((line) => line.text).join('\n')

  const perLine = lines.map((line) => ({
    line,
    matches: matchLine(line.text, vocabulary, matchThreshold),
  }))
  const allMatches = perLine.flatMap((entry) => entry.matches.map((match) => ({ ...entry, match })))

  /* ------------------------------------------------------------------------ brand */

  const brandHits = allMatches
    .filter((hit) => hit.match.entry.kind === 'brand')
    .sort((a, b) => b.match.score - a.match.score)
  const brandHit = brandHits[0]
  const brand: DraftField<{ id: string; name: string }> = brandHit
    ? {
        value: { id: brandHit.match.entry.id, name: brandHit.match.entry.name },
        why: `${quote(brandHit.line)} read "${brandHit.match.ocrText}", which is ${brandHit.match.entry.name} at ${brandHit.match.score.toFixed(2)}`,
      }
    : blank(
        lines.length === 0
          ? 'no line survived the confidence floor'
          : `no line matched a brand in the catalog at ${matchThreshold.toFixed(2)} — a tin from a brand we do not stock yet cannot be matched, only typed`,
      )

  /* ------------------------------------------------------------------------- name */

  // Half the image, not a third: a tin photographed at an angle puts its own name lower
  // than a flat scan would, and the tallest-line rule is doing most of the work anyway.
  const topBand = imageHeight / 2
  const brandSpans = new Set(brandHits.map((hit) => `${hit.line.index}:${hit.match.from}-${hit.match.to}`))

  const nameCandidates = perLine.filter(({ line, matches }) => {
    if (line.box.y0 > topBand) return false
    if (line.text.trim().length < 3) return false
    // Rejects "80°C · 2-3 min" and "500 g", which are frequently the tallest thing on the
    // back of a tin and are never the name.
    if (lettersFraction(line.text) < 0.5) return false
    // A line that is *entirely* a brand match is the brand, not the product.
    const spansWholeLine = matches.some(
      (match) =>
        brandSpans.has(`${line.index}:${match.from}-${match.to}`) &&
        match.from === 0 &&
        match.to === normalise(line.text).split(' ').filter(Boolean).length,
    )
    return !spansWholeLine
  })

  const nameLine = nameCandidates
    .slice()
    .sort((a, b) => b.line.heightPx - a.line.heightPx || b.line.confidence - a.line.confidence)[0]

  let name: DraftField<string>
  if (!nameLine) {
    const inBand = allLines.filter((line) => line.box.y0 <= topBand)
    const best = inBand.slice().sort((a, b) => b.confidence - a.confidence)[0]
    name = blank(
      inBand.length === 0
        ? 'no text at all was found in the top half of the image'
        : best && best.confidence < minConfidence
          ? `nothing in the top half cleared ${minConfidence}% confidence — the best was ${quote(best)} at ${Math.round(best.confidence)}%`
          : 'every line in the top half is mostly digits and units, so none of them is a name',
    )
  } else {
    // The best repair on the bench: if the tallest line is a tea we already stock, the
    // name comes back with the catalog's spelling rather than the photograph's.
    const known = bestMatch(nameLine.line.text, vocabulary, matchThreshold)
    const knownTea = known && known.entry.kind === 'tea' ? known : null
    name = knownTea
      ? {
          value: knownTea.entry.name,
          why: `${quote(nameLine.line)} is the tallest line in the top half at ${Math.round(nameLine.line.heightPx)}px, and "${knownTea.ocrText}" is the catalog's ${knownTea.entry.name} at ${knownTea.score.toFixed(2)} — so the catalog's spelling wins`,
        }
      : {
          value: softenCaps(nameLine.line.text.trim()),
          why: `${quote(nameLine.line)} is the tallest line in the top half at ${Math.round(nameLine.line.heightPx)}px, ${Math.round(nameLine.line.confidence)}% confidence. Nothing in the catalog matches it, so it is taken as typed`,
        }
  }

  /* --------------------------------------------------------------------- tea type */

  const typeWord = findTeaType(lines, matchThreshold)
  const knownTeaMatch = allMatches
    .filter((hit) => hit.match.entry.kind === 'tea' && hit.match.entry.teaType !== null)
    .sort((a, b) => b.match.score - a.match.score)[0]

  let teaType: DraftField<TeaType>
  if (typeWord) {
    teaType = {
      value: typeWord.type,
      why: `${quote(typeWord.line)} says "${typeWord.word}", which is ${TEA_TYPE_LABELS[typeWord.type]} at ${typeWord.score.toFixed(2)}`,
    }
  } else if (knownTeaMatch && knownTeaMatch.match.entry.teaType) {
    teaType = {
      value: knownTeaMatch.match.entry.teaType,
      why: `no type word on the tin, but "${knownTeaMatch.match.ocrText}" matched the catalog's ${knownTeaMatch.match.entry.name}, which is ${TEA_TYPE_LABELS[knownTeaMatch.match.entry.teaType]}`,
    }
  } else {
    teaType = blank(
      'no line contains a tea type, and nothing matched a tea already in the catalog. This one is required by the API, so the draft cannot be posted without it',
    )
  }

  /* ------------------------------------------------------------------ ingredients */

  const shares = extractShares(text)
  const byId = new Map<string, DraftIngredient>()

  for (const hit of allMatches) {
    if (hit.match.entry.kind !== 'ingredient') continue
    const existing = byId.get(hit.match.entry.id)
    if (existing && existing.match.score >= hit.match.score) continue
    byId.set(hit.match.entry.id, {
      match: hit.match,
      percentage: null,
      isPrimary: false,
      why: `${quote(hit.line)} read "${hit.match.ocrText}" → ${hit.match.entry.name} (${hit.match.score.toFixed(2)})`,
    })
  }

  for (const share of shares) {
    // The percentage's label goes through the same matcher, so "Jasmlne 8%" still lands
    // on the jasmine we already have rather than being dropped for the typo.
    const matched = bestMatch(share.value.label, vocabulary, matchThreshold)
    if (!matched || matched.entry.kind !== 'ingredient') continue
    const target = byId.get(matched.entry.id)
    if (!target) continue
    target.percentage = share.value.percent
    target.why += `, and "${share.source}" gives it ${share.value.percent}%`
  }

  const ingredients = [...byId.values()]
  if (ingredients.length > 0) {
    // The largest declared share is the base of the blend; with no shares at all, the
    // first ingredient in reading order is, because that is the order tins print them in.
    // A type predicate rather than a bare filter: `percentage` is nullable on
    // `DraftIngredient`, and the comparison below has to know these are the ones where it
    // is not.
    const withShares = ingredients.filter(
      (item): item is DraftIngredient & { percentage: number } => item.percentage !== null,
    )
    const primary =
      withShares.length > 0
        ? withShares.reduce((best, item) => (item.percentage > best.percentage ? item : best))
        : ingredients[0]
    primary.isPrimary = true
    primary.why +=
      withShares.length > 0
        ? '. Marked primary: the largest declared share'
        : '. Marked primary: no percentages on the tin, so the first one listed'
  }

  const ingredientsWhy =
    ingredients.length > 0
      ? `${ingredients.length} of the catalog's ingredients matched at ${matchThreshold.toFixed(2)} or better`
      : `nothing matched an ingredient at ${matchThreshold.toFixed(2)}. Either the ingredient panel did not survive OCR, or these are ingredients the catalog does not have yet — the form's "suggest an ingredient" path is for the second case, and this draft deliberately does not guess which it is`

  /* ---------------------------------------------------------------- caffeine level */

  const caffeinated = ingredients.filter((item) => item.match.entry.isCaffeinated)
  let caffeineLevel: DraftField<CaffeineLevel>
  if (ingredients.length === 0) {
    caffeineLevel = blank(
      'derived from the matched ingredients\' `is_caffeinated`, and nothing matched. Guessing it from the name is exactly the kind of confident wrong answer this panel exists to avoid',
    )
  } else if (caffeinated.length === 0) {
    caffeineLevel = {
      value: 'none',
      why: `none of the ${ingredients.length} matched ingredients is caffeinated`,
    }
  } else {
    const base = caffeinated.some((item) => item.isPrimary)
    caffeineLevel = {
      value: base ? 'high' : 'medium',
      why: `${caffeinated.map((item) => item.match.entry.name).join(', ')} ${caffeinated.length === 1 ? 'is' : 'are'} caffeinated${base ? ' and one of them is the base of the blend, so: high' : ', but none of them is the base, so: medium'}`,
    }
  }

  /* ----------------------------------------------------------------- the numerics */

  const temperatures = extractTemperatures(text)
  // Midpoint for a range: unlike the steep time below there is no asymmetric penalty —
  // 90 and 95 are equally defensible readings of "90–95°C" — so the middle is the least
  // arbitrary of the three.
  const usableTemperature = temperatures
    .map((hit) => ({
      hit,
      celsius: Math.round((hit.value.celsiusLow + hit.value.celsiusHigh) / 2),
    }))
    .find((candidate) => candidate.celsius >= 40 && candidate.celsius <= 100)

  let brewTempC: DraftField<number>
  if (usableTemperature) {
    const { hit, celsius } = usableTemperature
    const converted = hit.value.unit === 'F' ? `, converted from ${hit.value.unit}` : ''
    const ranged = hit.value.celsiusLow === hit.value.celsiusHigh ? '' : ' (midpoint of the range)'
    brewTempC = { value: celsius, why: `read "${hit.source}"${converted}${ranged}` }
  } else if (temperatures.length > 0) {
    brewTempC = blank(
      `read ${temperatures.map((hit) => `"${hit.source}"`).join(', ')}, but nothing landed inside the 40–100 °C the API accepts — most likely a mis-read digit`,
    )
  } else {
    brewTempC = blank('no temperature pattern matched the text')
  }

  const steeps = extractSteepTimes(text)
  const usableSteep = steeps.find((hit) => hit.value.secondsLow > 0 && hit.value.secondsLow <= 3600)
  let brewSeconds: DraftField<number>
  if (usableSteep) {
    const ranged =
      usableSteep.value.secondsLow === usableSteep.value.secondsHigh
        ? ''
        : '; a range takes its lower end, because over-steeping is the mistake you cannot undo'
    brewSeconds = { value: usableSteep.value.secondsLow, why: `read "${usableSteep.source}"${ranged}` }
  } else {
    brewSeconds = blank(
      steeps.length > 0
        ? `read ${steeps.map((hit) => `"${hit.source}"`).join(', ')}, none of it a plausible steep time`
        : 'no steep time pattern matched the text',
    )
  }

  const doses = extractDoses(text)
  const mass = doses.find((hit) => hit.value.kind === 'mass')
  const spoons = doses.find((hit) => hit.value.kind === 'spoons')
  let gramsPer100ml: DraftField<number>
  if (mass && mass.value.kind === 'mass') {
    gramsPer100ml = { value: mass.value.gramsPer100ml, why: `read "${mass.source}"` }
  } else if (spoons) {
    gramsPer100ml = blank(
      `read "${spoons.source}", and a teaspoon is a volume of leaf rather than a mass — the conversion depends on how coarsely it is cut, anywhere from 1.5 g to 4 g. Left blank rather than assuming one`,
    )
  } else {
    gramsPer100ml = blank('no dose pattern matched the text')
  }

  /* --------------------------------------------------------------------- the body */

  const missing: string[] = []
  if (name.value === null) missing.push('name')
  if (teaType.value === null) missing.push('tea_type')

  const payload: TeaInput | null =
    name.value !== null && teaType.value !== null
      ? {
          name: name.value,
          tea_type: teaType.value,
          // `caffeine_level` is required by `TeaCreate` and defaults to "medium" server
          // side, so there is no way to spell "we do not know" on the wire. Sending
          // medium is therefore not this panel's guess, it is the schema's — and that is
          // worth knowing, because it is the one field where "leave it blank" does not
          // actually mean blank.
          caffeine_level: caffeineLevel.value ?? 'medium',
          brand_id: brand.value?.id ?? null,
          brew_temp_c: brewTempC.value,
          brew_seconds: brewSeconds.value,
          grams_per_100ml: gramsPer100ml.value,
          ingredients: ingredients.map((item) => ({
            ingredient_id: item.match.entry.id,
            percentage: item.percentage,
            is_primary: item.isPrimary,
          })),
        }
      : null

  const payloadWhy =
    payload === null
      ? `not postable: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required by TeaCreate and could not be read`
      : caffeineLevel.value === null
        ? 'postable, but caffeine_level had to be sent as "medium" — the schema has no way to say "unknown"'
        : 'postable as it stands; every blank field below is genuinely optional'

  return {
    name,
    teaType,
    caffeineLevel,
    brand,
    brewTempC,
    brewSeconds,
    gramsPer100ml,
    ingredients,
    ingredientsWhy,
    payload,
    payloadWhy,
  }
}

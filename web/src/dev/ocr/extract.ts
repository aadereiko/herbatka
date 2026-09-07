/**
 * The numbers on a tea tin, pulled out of OCR text with regexes.
 *
 * Every extractor returns a *list* of hits carrying the substring it fired on, never a
 * single value. Two reasons, and the second is the one that shaped the file:
 *
 * - A tin often prints two temperatures ("90–95°C" on the back, "never boiling" on the
 *   side), and a bench is supposed to show you that rather than quietly pick one.
 * - The `source` string is what the prefill panel quotes beside a filled field. A number
 *   with no visible provenance is indistinguishable from a number we invented, and
 *   telling those apart is the entire point of the exercise.
 *
 * Deciding *which* hit becomes the field — and when a hit is too weak to use at all — is
 * `draft.ts`'s job. These functions only read.
 *
 * On tolerance: OCR mangles the degree sign more than any other glyph on a tin. It comes
 * back as `o`, `*`, `º`, a stray superscript, or nothing, so the unit classes below are
 * deliberately loose. The `\b` after the unit letter is what keeps that looseness safe —
 * without it, "100 CUPS" reads as 100°C.
 */

export type Hit<T> = {
  value: T
  /** The exact substring the pattern fired on, quoted verbatim in the UI. */
  source: string
  /** Offset of `source` in the text it was read from. Only used to spot two patterns
   *  claiming the same span; kept on the type because hiding it would mean a second,
   *  near-identical internal hit type. */
  index: number
}

/** A degree sign, or any of the things OCR turns one into. Optional, because plenty of
 *  tins print a bare "80 C". */
const DEGREE = String.raw`[°º^*o]?`

function collect<T>(
  text: string,
  pattern: RegExp,
  read: (match: RegExpExecArray) => T | null,
): Hit<T>[] {
  const hits: Hit<T>[] = []
  // A fresh RegExp per call. These patterns are module-level literals with /g, and a
  // `lastIndex` shared between calls is the classic way to write a function that works
  // the first time and returns nothing the second.
  const scanner = new RegExp(pattern.source, pattern.flags)
  let match = scanner.exec(text)
  while (match !== null) {
    const value = read(match)
    if (value !== null) hits.push({ value, source: match[0].trim(), index: match.index })
    match = scanner.exec(text)
  }
  return hits
}

function toNumber(raw: string): number {
  // European tins write "2,5 g" and OCR keeps the comma.
  return Number(raw.replace(',', '.'))
}

/* ------------------------------------------------------------------- temperature */

export type Temperature = {
  /** Already Celsius: Fahrenheit is converted here so nothing downstream has to remember
   *  which unit it is holding. */
  celsiusLow: number
  celsiusHigh: number
  /** Kept so the panel can say "read as 176°F" rather than pretending the tin said 80. */
  unit: 'C' | 'F'
}

const TEMPERATURE = new RegExp(
  String.raw`(\d{2,3})\s*(?:${DEGREE}\s*[CF]\s*)?(?:[-–—]|to)\s*(\d{2,3})\s*${DEGREE}\s*([CF])\b` +
    String.raw`|(\d{2,3})\s*${DEGREE}\s*([CF])\b`,
  'gi',
)

const fahrenheitToCelsius = (f: number) => Math.round(((f - 32) * 5) / 9)

/**
 * `80°C`, `176°F`, `90-95 C`, `95 to 100°C`.
 *
 * Two digits minimum, three maximum. One digit would fire on every "5%" and four on a
 * barcode; anything of real interest is 40–212 in one unit or the other, and `draft.ts`
 * throws away whatever falls outside the range the API will accept.
 */
export function extractTemperatures(text: string): Hit<Temperature>[] {
  return collect(text, TEMPERATURE, (match) => {
    const isRange = match[1] !== undefined
    const unit = ((isRange ? match[3] : match[5]) ?? 'C').toUpperCase() as 'C' | 'F'
    const low = Number(isRange ? match[1] : match[4])
    const high = Number(isRange ? match[2] : match[4])
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null
    // A "range" that runs backwards is a mis-read, not a range.
    if (high < low) return null
    return unit === 'F'
      ? { celsiusLow: fahrenheitToCelsius(low), celsiusHigh: fahrenheitToCelsius(high), unit }
      : { celsiusLow: low, celsiusHigh: high, unit }
  })
}

/* -------------------------------------------------------------------- steep time */

export type SteepTime = {
  secondsLow: number
  secondsHigh: number
}

const MINUTES =
  /(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s*min(?:ute)?s?\b|(\d{1,2})\s*min(?:ute)?s?\b/gi
const SECONDS = /(\d{2,3})\s*(?:sec(?:ond)?s?|s)\b/gi
/** `2'30"` — the European shorthand. The closing mark is required, because without it the
 *  pattern eats `80'C` and reports an eighty-minute steep. */
const CLOCK = /(\d{1,2})\s*['′]\s*(\d{2})\s*["″]/g

/** `3 min`, `2-3 minutes`, `180 s`, `2'30"`. */
export function extractSteepTimes(text: string): Hit<SteepTime>[] {
  const minutes = collect(text, MINUTES, (match) => {
    const low = Number(match[1] ?? match[3])
    const high = Number(match[2] ?? match[3])
    if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return null
    return { secondsLow: low * 60, secondsHigh: high * 60 }
  })
  const seconds = collect(text, SECONDS, (match) => {
    const value = Number(match[1])
    return Number.isFinite(value) ? { secondsLow: value, secondsHigh: value } : null
  })
  const clock = collect(text, CLOCK, (match) => {
    const total = Number(match[1]) * 60 + Number(match[2])
    return Number.isFinite(total) ? { secondsLow: total, secondsHigh: total } : null
  })
  return [...minutes, ...seconds, ...clock]
}

/* --------------------------------------------------------------------------- dose */

export type Dose =
  | { kind: 'mass'; gramsPer100ml: number }
  /** A spoon is not a mass. Kept as a hit anyway, so the panel can explain the blank
   *  rather than leave the reader wondering whether the pattern simply missed. */
  | { kind: 'spoons'; spoons: number; per: string }

const VOLUME_FACTORS: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 }

/** The joiner between mass and volume is the fiddly half: tins write `2g/100ml`,
 *  `5 g per 250 ml` and `2 g : 200ml`, and a plain `[^0-9]*` between them would happily
 *  span "2g of leaf in a 500ml pot" and call it a dose. */
const MASS_PER_VOLUME =
  /(\d{1,3}(?:[.,]\d{1,2})?)\s*g(?:r|ram)?s?\b[\s/:.,-]{0,4}(?:per|pro|for|je|auf)?[\s/:.,-]{0,4}(\d{1,4}(?:[.,]\d)?)\s*(ml|cl|dl|l)\b/gi
const SPOONS =
  /(\d{1,2}(?:[.,]\d)?|½|¼|¾)\s*(?:tsp|teaspoons?|tbsp|tablespoons?|spoons?)\b(?:\s*(?:per|\/|a)\s*([a-z]{3,6}))?/gi

const SPOON_FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 }

/** `2g/100ml`, `5 g per 250 ml`, `1 tsp per cup`, `½ tsp`. */
export function extractDoses(text: string): Hit<Dose>[] {
  const masses = collect<Dose>(text, MASS_PER_VOLUME, (match) => {
    const grams = toNumber(match[1])
    const volume = toNumber(match[2])
    const factor = VOLUME_FACTORS[match[3].toLowerCase()]
    if (!Number.isFinite(grams) || !Number.isFinite(volume) || volume <= 0 || !factor) return null
    const millilitres = volume * factor
    // Two decimals: the API takes a float, but "0.6666666666666666 g per 100 ml" in a
    // read-out is noise pretending to be precision.
    return { kind: 'mass', gramsPer100ml: Math.round((grams / millilitres) * 10000) / 100 }
  })
  const spoons = collect<Dose>(text, SPOONS, (match) => {
    const count = SPOON_FRACTIONS[match[1]] ?? toNumber(match[1])
    if (!Number.isFinite(count)) return null
    return { kind: 'spoons', spoons: count, per: match[2] ?? 'unstated' }
  })
  return [...masses, ...spoons]
}

/* -------------------------------------------------------------- ingredient shares */

export type IngredientShare = {
  /** The words next to the number, exactly as OCR read them. Matching this against the
   *  catalog is `vocabulary.ts`'s job — this file does not know what a chamomile is. */
  label: string
  percent: number
}

/** Three words at most, on either side. An unbounded run of letters-and-spaces would
 *  swallow "green tea and jasmine blossom" whole and hand the vocabulary matcher a
 *  phrase it has no entry for. */
const WORDS = String.raw`[A-Za-zÀ-ÿ'’]{2,}(?:[ \-][A-Za-zÀ-ÿ'’]{2,}){0,2}`
const SHARE_LABEL_FIRST = new RegExp(
  String.raw`(${WORDS})\s*[(\[]?\s*(\d{1,3}(?:[.,]\d)?)\s*%`,
  'g',
)
const SHARE_NUMBER_FIRST = new RegExp(String.raw`(\d{1,3}(?:[.,]\d)?)\s*%\s+(${WORDS})`, 'g')

/** `Jasmine 8%`, `Hibiscus (12%)`, `8% jasmine blossom`. */
export function extractShares(text: string): Hit<IngredientShare>[] {
  const readShare = (labelGroup: number, percentGroup: number) => (match: RegExpExecArray) => {
    const percent = toNumber(match[percentGroup])
    if (!(percent > 0) || percent > 100) return null
    return { label: match[labelGroup].trim(), percent }
  }

  const labelFirst = collect(text, SHARE_LABEL_FIRST, readShare(1, 2))
  const numberFirst = collect(text, SHARE_NUMBER_FIRST, readShare(2, 1))

  // Label-first wins wherever the two spans overlap. "Jasmine 8% green tea" is a jasmine
  // share, and the number-first reading would credit it to the green tea.
  const overlaps = (hit: Hit<IngredientShare>) =>
    labelFirst.some(
      (taken) =>
        hit.index < taken.index + taken.source.length && taken.index < hit.index + hit.source.length,
    )
  return [...labelFirst, ...numberFirst.filter((hit) => !overlaps(hit))]
}

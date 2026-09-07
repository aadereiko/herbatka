import { expect, test } from 'vitest'

import type { Brand, IngredientTaste, TeaSummary } from '../../lib/catalog'
import type { VocabEntry } from './vocabulary'
import {
  bestMatch,
  buildVocabulary,
  editDistance,
  foldConfusions,
  matchLine,
  normalise,
  ocrSimilarity,
} from './vocabulary'

/**
 * The repair layer, which is the half of this bench with a testable claim: *this* mis-read
 * maps to *that* catalog word at *this* score. A hand-rolled measure was chosen over
 * Fuse.js precisely so these numbers could be asserted, so this file is where that choice
 * has to pay for itself.
 */

const ingredient = (id: string, name: string, isCaffeinated = false) =>
  ({ id, name, is_caffeinated: isCaffeinated }) as IngredientTaste

const vocabulary = buildVocabulary({
  ingredients: [
    ingredient('i-cham', 'Chamomile'),
    ingredient('i-berg', 'Bergamot oil'),
    ingredient('i-black', 'Black tea leaf', true),
    ingredient('i-rooi', 'Rooibos'),
    ingredient('i-peel', 'Orange peel'),
    ingredient('i-mint', 'Peppermint'),
  ],
  brands: [
    { id: 'b-dam', name: 'Dammann Frères' } as Brand,
    { id: 'b-twin', name: 'Twinings' } as Brand,
  ],
  teas: [{ id: 't-eg', name: 'Earl Grey', tea_type: 'black' } as TeaSummary],
})

const find = (id: string) => vocabulary.find((entry) => entry.id === id) as VocabEntry

/* ------------------------------------------------------------------ the primitives */

test('normalise strips accents, because OCR never returns the grave', () => {
  // "Dammann Frères" against "dammann freres" is two edits out of fourteen characters
  // before the photograph has made a single real mistake.
  expect(normalise('Dammann Frères')).toBe('dammann freres')
})

test('normalise collapses punctuation to single spaces', () => {
  expect(normalise('INGREDIENTS:  rooibos,  orange-peel!')).toBe('ingredients rooibos orange peel')
})

test('foldConfusions applies the length-changing pairs before the single characters', () => {
  // `cl`→`d` has to happen before `l`→`i`, or the `l` is eaten out of `cl` first.
  expect(foldConfusions('cl')).toBe('d')
  expect(foldConfusions('rnodern')).toBe('modem')
  expect(foldConfusions('RO0IB0S'.toLowerCase())).toBe('rooibos')
})

test('editDistance is the textbook measure', () => {
  expect(editDistance('kitten', 'sitting')).toBe(3)
  expect(editDistance('', 'abc')).toBe(3)
  expect(editDistance('same', 'same')).toBe(0)
})

test('editDistance abandons a comparison once it cannot come back under the ceiling', () => {
  // The exact value past the ceiling is not meaningful and is not asserted; that it is
  // *above* the ceiling is what the caller relies on.
  expect(editDistance('chamomile', 'twinings', 2)).toBeGreaterThan(2)
})

test('the score is normalised by the longer string, so short words are judged harder', () => {
  // One edit in four characters is a coin toss; one edit in nine is a typo. The measure
  // has to say so, because the threshold slider is one number for both.
  expect(ocrSimilarity('mint', 'hint')).toBeCloseTo(0.75, 2)
  expect(ocrSimilarity('chamomle', 'chamomile')).toBeCloseTo(0.889, 2)
})

test('an l-for-i mis-read costs nothing at all, because the folding covers it', () => {
  // "CHAMOMLLE" is a *free* repair rather than a 0.89 one: `l`→`i` is in the confusion
  // table, so both sides fold to the same string. Worth an assertion of its own — it is
  // the difference between the folded measure and a plain edit distance.
  expect(ocrSimilarity('chamomlle', 'chamomile')).toBe(1)
})

test('the confusion folding is what rescues a digit-for-letter mis-read', () => {
  // Literally three substitutions; nothing at all once folded.
  expect(ocrSimilarity('r00ib0s', 'rooibos')).toBe(1)
  expect(ocrSimilarity('bergam0t', 'bergamot')).toBe(1)
})

/* -------------------------------------------------------------------- the matching */

test('the headline case: a dropped letter is repaired', () => {
  const match = bestMatch('CHAMOMLE', vocabulary, 0.78)
  expect(match?.entry.name).toBe('Chamomile')
  expect(match?.score).toBeCloseTo(0.889, 2)
  // Both halves are carried back, because the repair column prints both.
  expect(match?.ocrText).toBe('chamomle')
})

test('a vocabulary word is found inside a longer ingredient line', () => {
  const matches = matchLine(
    'INGREDIENTS: rooibas, orange peel, bergamot oil',
    vocabulary,
    0.78,
  )
  expect(matches.map((match) => match.entry.name)).toEqual([
    'Rooibos',
    'Orange peel',
    'Bergamot oil',
  ])
})

test('matches come back in reading order, not score order', () => {
  // The table is organised by line, so a repair list that jumped about would not line up
  // with the words it is describing.
  const matches = matchLine('bergamot oil and chamomile', vocabulary, 0.78)
  expect(matches.map((match) => match.from)).toEqual([0, 3])
})

test('a multi-word entry survives OCR splitting one of its words', () => {
  // "BLACKTEA LEAF" is three catalog words in two OCR tokens; the ±1 window is what
  // tolerates it.
  const match = bestMatch('BLACK TEALEAF', vocabulary, 0.7)
  expect(match?.entry.name).toBe('Black tea leaf')
})

test('two entries never claim the same words', () => {
  // "Peppermint" and "Orange peel" both score against "peel"; only the better one lands.
  const matches = matchLine('orange peel', vocabulary, 0.6)
  const spans = matches.map((match) => `${match.from}-${match.to}`)
  expect(new Set(spans).size).toBe(spans.length)
})

test('raising the threshold trades recall for precision, live', () => {
  // The exact behaviour the slider exists to demonstrate.
  const loose = matchLine('CHAMOMLE', vocabulary, 0.7)
  const strict = matchLine('CHAMOMLE', vocabulary, 0.95)
  expect(loose).toHaveLength(1)
  expect(strict).toHaveLength(0)
})

test('a word the catalog does not have matches nothing at a sensible threshold', () => {
  expect(matchLine('LAPSANG SOUCHONG', vocabulary, 0.78)).toEqual([])
})

test('an accented brand matches its unaccented mis-read', () => {
  const match = bestMatch('DAMMANN FRERES', vocabulary, 0.9)
  expect(match?.entry.name).toBe('Dammann Frères')
  expect(match?.entry.kind).toBe('brand')
})

test('a blank line matches nothing rather than throwing', () => {
  expect(matchLine('', vocabulary, 0.78)).toEqual([])
  expect(matchLine('   ', vocabulary, 0.78)).toEqual([])
})

/* ---------------------------------------------------------------------- the corpus */

test('buildVocabulary carries the two payload fields the draft needs', () => {
  expect(find('i-black').isCaffeinated).toBe(true)
  expect(find('i-cham').isCaffeinated).toBe(false)
  expect(find('t-eg').teaType).toBe('black')
  expect(find('t-eg').kind).toBe('tea')
})

test('buildVocabulary precomputes the word count the window search slides on', () => {
  expect(find('i-black').wordCount).toBe(3)
  expect(find('i-cham').wordCount).toBe(1)
})

test('an entry whose name normalises to nothing is dropped rather than matching everything', () => {
  const odd = buildVocabulary({
    ingredients: [ingredient('i-bad', '???')],
    brands: [],
    teas: [],
  })
  expect(odd).toEqual([])
})

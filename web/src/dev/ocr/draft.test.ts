import { expect, test } from 'vitest'

import type { Brand, IngredientTaste, TeaSummary } from '../../lib/catalog'
import type { OcrLine } from './draft'
import { buildDraft } from './draft'
import { buildVocabulary } from './vocabulary'

/**
 * The prefill rules, and mostly the refusals.
 *
 * The interesting assertions in this file are the ones that check a field came back
 * *blank* and that the reason names the actual obstacle. That is the whole design premise
 * — a confidently wrong prefill is worse than an empty one — and it is the only part of it
 * a test can enforce.
 */

const ingredient = (id: string, name: string, isCaffeinated = false) =>
  ({ id, name, is_caffeinated: isCaffeinated }) as IngredientTaste

const vocabulary = buildVocabulary({
  ingredients: [
    ingredient('i-black', 'Black tea leaf', true),
    ingredient('i-berg', 'Bergamot oil'),
    ingredient('i-cham', 'Chamomile'),
    ingredient('i-lav', 'Lavender'),
    ingredient('i-rooi', 'Rooibos'),
    ingredient('i-peel', 'Orange peel'),
  ],
  brands: [
    { id: 'b-twin', name: 'Twinings' } as Brand,
    { id: 'b-ahmad', name: 'Ahmad Tea' } as Brand,
  ],
  teas: [
    { id: 't-eg', name: 'Earl Grey', tea_type: 'black' } as TeaSummary,
    { id: 't-cd', name: 'Chamomile Dream', tea_type: 'herbal' } as TeaSummary,
  ],
})

const IMAGE_HEIGHT = 1000

const OPTIONS = { minConfidence: 60, matchThreshold: 0.78, imageHeight: IMAGE_HEIGHT }

/** A line at a given vertical position, with a cap height and a confidence. */
function line(
  index: number,
  text: string,
  { y = 500, height = 20, confidence = 90 } = {},
): OcrLine {
  return {
    index,
    text,
    confidence,
    box: { x0: 40, y0: y, x1: 400, y1: y + height },
    heightPx: height,
  }
}

/* -------------------------------------------------------------------------- name */

test('the name is the tallest line in the top half', () => {
  const draft = buildDraft(
    [
      line(1, 'TWININGS', { y: 40, height: 30 }),
      line(2, 'LADY GREY', { y: 120, height: 60 }),
      line(3, 'BLACK TEA WITH BERGAMOT', { y: 220, height: 18 }),
    ],
    vocabulary,
    OPTIONS,
  )

  expect(draft.name.value).toBe('Lady Grey')
  expect(draft.name.why).toContain('tallest')
})

test('an all-caps name is softened, because the catalog holds "Earl Grey" not "EARL GREY"', () => {
  const draft = buildDraft([line(1, 'PURE CEYLON', { y: 20, height: 50 })], vocabulary, OPTIONS)
  expect(draft.name.value).toBe('Pure Ceylon')
})

test('a name already in the catalog comes back with the catalog’s spelling', () => {
  // The single best repair on the bench: OCR dropped a letter and the answer is still
  // exactly the row we already have.
  const draft = buildDraft([line(1, 'EARL GRAY', { y: 20, height: 50 })], vocabulary, OPTIONS)
  expect(draft.name.value).toBe('Earl Grey')
  expect(draft.name.why).toContain("catalog's spelling")
})

test('a line that is only the brand is not taken as the name', () => {
  const draft = buildDraft(
    [
      line(1, 'TWININGS', { y: 20, height: 70 }),
      line(2, 'Lady Grey', { y: 130, height: 30 }),
    ],
    vocabulary,
    OPTIONS,
  )
  expect(draft.name.value).toBe('Lady Grey')
  expect(draft.brand.value?.name).toBe('Twinings')
})

test('a line of numbers and units is never the name, however tall it is', () => {
  const draft = buildDraft(
    [line(1, '80°C / 2-3 min / 500 g', { y: 20, height: 80 })],
    vocabulary,
    OPTIONS,
  )
  expect(draft.name.value).toBeNull()
  expect(draft.name.why).toContain('digits and units')
})

test('a blank name says which gate rejected everything', () => {
  const draft = buildDraft(
    [line(1, 'LADY GREY', { y: 20, height: 60, confidence: 41 })],
    vocabulary,
    OPTIONS,
  )
  expect(draft.name.value).toBeNull()
  // Naming the number is the difference between a blank the maintainer can act on and one
  // they cannot.
  expect(draft.name.why).toContain('41%')
  expect(draft.name.why).toContain('60%')
})

test('text only in the bottom half yields no name at all', () => {
  const draft = buildDraft([line(1, 'LADY GREY', { y: 900, height: 40 })], vocabulary, OPTIONS)
  expect(draft.name.value).toBeNull()
  expect(draft.name.why).toContain('top half')
})

/* ---------------------------------------------------------------------- tea type */

test('a type word on the tin wins', () => {
  const draft = buildDraft(
    [line(1, 'LADY GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.teaType.value).toBe('black')
})

test('with no type word, a matched catalog tea supplies the type', () => {
  const draft = buildDraft([line(1, 'EARL GRAY', { y: 20, height: 50 })], vocabulary, OPTIONS)
  expect(draft.teaType.value).toBe('black')
  expect(draft.teaType.why).toContain('no type word')
})

test('with neither, tea_type is blank and the draft is not postable', () => {
  const draft = buildDraft([line(1, 'MYSTERY TIN', { y: 20, height: 50 })], vocabulary, OPTIONS)
  expect(draft.teaType.value).toBeNull()
  expect(draft.payload).toBeNull()
  expect(draft.payloadWhy).toContain('tea_type')
})

/* --------------------------------------------------------------- caffeine level */

test('caffeine comes from the matched ingredients, not from the name', () => {
  const draft = buildDraft(
    [
      line(1, 'LADY GREY', { y: 20, height: 50 }),
      line(2, 'BLACK TEA'),
      line(3, 'Ingredients: black tea leaf, bergamot oil'),
    ],
    vocabulary,
    OPTIONS,
  )
  expect(draft.caffeineLevel.value).toBe('high')
  expect(draft.caffeineLevel.why).toContain('Black tea leaf')
})

test('an all-herbal ingredient list is caffeine-free', () => {
  const draft = buildDraft(
    [
      line(1, 'SLEEPY TIME', { y: 20, height: 50 }),
      line(2, 'HERBAL'),
      line(3, 'chamomile, lavender'),
    ],
    vocabulary,
    OPTIONS,
  )
  expect(draft.caffeineLevel.value).toBe('none')
})

test('with no ingredients matched, caffeine is left blank rather than guessed', () => {
  const draft = buildDraft(
    [line(1, 'GREEN SENCHA', { y: 20, height: 50 }), line(2, 'GREEN TEA')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.caffeineLevel.value).toBeNull()
  expect(draft.caffeineLevel.why).toContain('is_caffeinated')
})

test('the payload still has to send a caffeine level, and the panel says so', () => {
  // `TeaCreate.caffeine_level` is required and defaults to "medium" server side, so there
  // is no way to spell "unknown" on the wire. Worth surfacing rather than hiding.
  const draft = buildDraft(
    [line(1, 'GREEN SENCHA', { y: 20, height: 50 }), line(2, 'GREEN TEA')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.payload?.caffeine_level).toBe('medium')
  expect(draft.payloadWhy).toContain('no way to say "unknown"')
})

/* ------------------------------------------------------------------- ingredients */

test('a mis-read ingredient is repaired and carries its percentage', () => {
  const draft = buildDraft(
    [
      line(1, 'ROOIBOS BLEND', { y: 20, height: 50 }),
      line(2, 'Rooibas 60%, orange peel 25%'),
    ],
    vocabulary,
    OPTIONS,
  )
  const names = draft.ingredients.map((item) => item.match.entry.name)
  expect(names).toContain('Rooibos')
  expect(names).toContain('Orange peel')

  const rooibos = draft.ingredients.find((item) => item.match.entry.id === 'i-rooi')
  expect(rooibos?.percentage).toBe(60)
  // The largest declared share is the base of the blend.
  expect(rooibos?.isPrimary).toBe(true)
})

test('with no percentages, the first ingredient listed is the primary one', () => {
  const draft = buildDraft(
    [
      line(1, 'EARL GREY', { y: 20, height: 50 }),
      line(2, 'black tea leaf, bergamot oil'),
    ],
    vocabulary,
    OPTIONS,
  )
  const primary = draft.ingredients.find((item) => item.isPrimary)
  expect(primary?.match.entry.name).toBe('Black tea leaf')
  expect(primary?.why).toContain('first one listed')
})

test('a low-confidence ingredient line is dropped by the floor', () => {
  const draft = buildDraft(
    [
      line(1, 'EARL GREY', { y: 20, height: 50 }),
      line(2, 'black tea leaf, bergamot oil', { confidence: 30 }),
    ],
    vocabulary,
    OPTIONS,
  )
  expect(draft.ingredients).toEqual([])
  expect(draft.ingredientsWhy).toContain('does not have yet')
})

/* --------------------------------------------------------------------- numerics */

test('a temperature range takes its midpoint', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA 90-95°C')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.brewTempC.value).toBe(93)
  expect(draft.brewTempC.why).toContain('midpoint')
})

test('a Fahrenheit temperature is converted and the conversion is stated', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA 176°F')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.brewTempC.value).toBe(80)
  expect(draft.brewTempC.why).toContain('converted')
})

test('a temperature outside what the API accepts is thrown away, with the reason', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA 016 F')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.brewTempC.value).toBeNull()
  expect(draft.brewTempC.why).toContain('40–100')
})

test('a steep range takes its lower end', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA 2-3 min')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.brewSeconds.value).toBe(120)
  expect(draft.brewSeconds.why).toContain('over-steeping')
})

test('grams per volume are normalised to per 100 ml', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA 5 g per 250 ml')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.gramsPer100ml.value).toBe(2)
})

test('a teaspoon is left blank, and the blank explains the ambiguity', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA — 1 tsp per cup')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.gramsPer100ml.value).toBeNull()
  expect(draft.gramsPer100ml.why).toContain('1.5 g to 4 g')
})

test('a tin with no numbers at all leaves all three blank and says why for each', () => {
  const draft = buildDraft(
    [line(1, 'EARL GREY', { y: 20, height: 50 }), line(2, 'BLACK TEA')],
    vocabulary,
    OPTIONS,
  )
  expect(draft.brewTempC.value).toBeNull()
  expect(draft.brewSeconds.value).toBeNull()
  expect(draft.gramsPer100ml.value).toBeNull()
  for (const field of [draft.brewTempC, draft.brewSeconds, draft.gramsPer100ml]) {
    expect(field.why).toContain('no')
  }
})

/* ---------------------------------------------------------------------- the body */

test('a full tin produces a postable body carrying every field it read', () => {
  const draft = buildDraft(
    [
      line(1, 'TWININGS', { y: 30, height: 24 }),
      line(2, 'LADY GREY', { y: 90, height: 56 }),
      line(3, 'BLACK TEA', { y: 200, height: 20 }),
      line(4, 'Ingredients: black tea leaf 92%, bergamot oil 8%', { y: 600, height: 14 }),
      line(5, 'Brew 95°C for 3 min, 2g/100ml', { y: 700, height: 14 }),
    ],
    vocabulary,
    OPTIONS,
  )

  expect(draft.payload).toEqual({
    name: 'Lady Grey',
    tea_type: 'black',
    caffeine_level: 'high',
    brand_id: 'b-twin',
    brew_temp_c: 95,
    brew_seconds: 180,
    grams_per_100ml: 2,
    ingredients: [
      { ingredient_id: 'i-black', percentage: 92, is_primary: true },
      { ingredient_id: 'i-berg', percentage: 8, is_primary: false },
    ],
  })
})

test('an empty page is not a crash and every field explains itself', () => {
  const draft = buildDraft([], vocabulary, OPTIONS)
  expect(draft.payload).toBeNull()
  expect(draft.name.why.length).toBeGreaterThan(0)
  expect(draft.brand.why).toContain('no line survived')
})

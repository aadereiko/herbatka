import { expect, test } from 'vitest'

import {
  extractDoses,
  extractShares,
  extractSteepTimes,
  extractTemperatures,
} from './extract'

/**
 * The regexes, and specifically their false positives.
 *
 * A tin is a page of numbers that mostly are not brewing figures — a net weight, a
 * barcode, a best-before date, a batch code — so the interesting assertions here are the
 * ones that check a pattern *does not* fire. A temperature extractor that reads "100 CUPS"
 * as 100 °C is worse than one that reads nothing, because the prefill panel would fill the
 * box confidently.
 */

const values = <T,>(hits: { value: T }[]) => hits.map((hit) => hit.value)

/* ------------------------------------------------------------------- temperature */

test('a plain Celsius temperature', () => {
  expect(values(extractTemperatures('Brew at 80°C'))).toEqual([
    { celsiusLow: 80, celsiusHigh: 80, unit: 'C' },
  ])
})

test('Fahrenheit is converted, and the unit is kept so the panel can say so', () => {
  expect(values(extractTemperatures('Water 176°F'))).toEqual([
    { celsiusLow: 80, celsiusHigh: 80, unit: 'F' },
  ])
})

test('a range, with the unit only on the second number', () => {
  expect(values(extractTemperatures('90-95°C'))).toEqual([
    { celsiusLow: 90, celsiusHigh: 95, unit: 'C' },
  ])
})

test('a range written out with "to"', () => {
  expect(values(extractTemperatures('95 to 100 C'))).toEqual([
    { celsiusLow: 95, celsiusHigh: 100, unit: 'C' },
  ])
})

test('a mangled degree sign still reads', () => {
  // OCR turns ° into o, º or * more often than it gets it right.
  expect(values(extractTemperatures('80 o C')).map((t) => t.celsiusLow)).toEqual([80])
  expect(values(extractTemperatures('80*C')).map((t) => t.celsiusLow)).toEqual([80])
})

test('"100 CUPS" is not a temperature', () => {
  // The `\b` after the unit letter is the entire defence, and it is the reason the degree
  // class is allowed to be loose.
  expect(extractTemperatures('MAKES 100 CUPS')).toEqual([])
})

test('a backwards range is a mis-read, not a range', () => {
  expect(extractTemperatures('95-90°C')).toEqual([])
})

test('the matched substring is carried back for the UI to quote', () => {
  expect(extractTemperatures('brew at 90-95°C now')[0].source).toBe('90-95°C')
})

/* -------------------------------------------------------------------- steep time */

test('minutes, singular and plural', () => {
  expect(values(extractSteepTimes('3 min'))).toEqual([{ secondsLow: 180, secondsHigh: 180 }])
  expect(values(extractSteepTimes('3 minutes'))).toEqual([{ secondsLow: 180, secondsHigh: 180 }])
})

test('a range of minutes keeps both ends', () => {
  expect(values(extractSteepTimes('2-3 min'))).toEqual([{ secondsLow: 120, secondsHigh: 180 }])
})

test('seconds', () => {
  expect(values(extractSteepTimes('180 s'))).toEqual([{ secondsLow: 180, secondsHigh: 180 }])
  expect(values(extractSteepTimes('45 seconds'))).toEqual([{ secondsLow: 45, secondsHigh: 45 }])
})

test('the European clock shorthand', () => {
  expect(values(extractSteepTimes(`2'30"`))).toEqual([{ secondsLow: 150, secondsHigh: 150 }])
})

test('a temperature written with a prime is not an eighty-minute steep', () => {
  // Without the required closing mark on CLOCK, `80'C` reads as 80 minutes.
  expect(extractSteepTimes(`80'C`)).toEqual([])
})

test('a temperature is not mistaken for seconds', () => {
  expect(extractSteepTimes('80°C')).toEqual([])
})

/* --------------------------------------------------------------------------- dose */

test('grams per volume, slashed', () => {
  expect(values(extractDoses('2g/100ml'))).toEqual([{ kind: 'mass', gramsPer100ml: 2 }])
})

test('grams per volume, spelled out, normalised to 100 ml', () => {
  expect(values(extractDoses('5 g per 250 ml'))).toEqual([{ kind: 'mass', gramsPer100ml: 2 }])
})

test('litres and centilitres normalise too', () => {
  expect(values(extractDoses('12 g per 1 l'))).toEqual([{ kind: 'mass', gramsPer100ml: 1.2 }])
})

test('a European decimal comma survives', () => {
  expect(values(extractDoses('2,5g / 100 ml'))).toEqual([{ kind: 'mass', gramsPer100ml: 2.5 }])
})

test('a spoon is reported as a spoon, not converted to a mass', () => {
  // Reported rather than dropped, so the prefill panel can explain the blank instead of
  // leaving the reader to wonder whether the pattern simply missed.
  expect(values(extractDoses('1 tsp per cup'))).toEqual([
    { kind: 'spoons', spoons: 1, per: 'cup' },
  ])
})

test('a spoon with nothing after it still reports', () => {
  expect(values(extractDoses('use 1 teaspoon'))).toEqual([
    { kind: 'spoons', spoons: 1, per: 'unstated' },
  ])
})

test('a vulgar fraction reads as a fraction', () => {
  expect(values(extractDoses('½ tsp'))).toEqual([{ kind: 'spoons', spoons: 0.5, per: 'unstated' }])
})

test('a net weight beside an unrelated volume is not a dose', () => {
  // "50 g" and "500 ml" on opposite sides of a sentence must not be multiplied together.
  expect(extractDoses('Net weight 50 g. Serve in a 500 ml pot.')).toEqual([])
})

/* -------------------------------------------------------------- ingredient shares */

test('label before the number', () => {
  expect(values(extractShares('Jasmine 8%'))).toEqual([{ label: 'Jasmine', percent: 8 }])
})

test('a parenthesised share', () => {
  expect(values(extractShares('Hibiscus (12%)'))).toEqual([{ label: 'Hibiscus', percent: 12 }])
})

test('number before the label', () => {
  expect(values(extractShares('8% jasmine blossom'))).toEqual([
    { label: 'jasmine blossom', percent: 8 },
  ])
})

test('label-first wins where the two readings overlap', () => {
  // "Jasmine 8% green tea" is a jasmine share; crediting it to the green tea would be a
  // confidently wrong percentage on the wrong ingredient.
  expect(values(extractShares('Jasmine 8% green tea'))).toEqual([{ label: 'Jasmine', percent: 8 }])
})

test('a share of over 100 is a mis-read', () => {
  expect(extractShares('Rooibos 800%')).toEqual([])
})

test('several shares on one ingredient line', () => {
  const shares = values(extractShares('Rooibos 60%, orange peel 25%, cinnamon 15%'))
  expect(shares).toHaveLength(3)
  expect(shares.map((share) => share.percent)).toEqual([60, 25, 15])
})

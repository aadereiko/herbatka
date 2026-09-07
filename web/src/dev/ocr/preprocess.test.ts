import { expect, test } from 'vitest'

import type { Pixels } from './preprocess'
import {
  applyPreprocess,
  binariseAdaptive,
  binariseOtsu,
  greyscale,
  invert,
  lumaHistogram,
  NO_PREPROCESS,
  otsuThreshold,
  rotate,
  stretchContrast,
  transform,
  upscale,
} from './preprocess'

/**
 * These run in jsdom, which has no canvas — which is exactly why `preprocess.ts` is
 * written against a structural `Pixels` rather than `ImageData`. Nothing here needs a
 * shim, a mock or a headless browser.
 *
 * What is deliberately *not* tested: whether any of this makes Tesseract read a tin
 * better. That is not a unit-testable claim — it depends on the photograph — and it is the
 * question the bench exists to let a human answer.
 */

/** Build pixels from a grid of grey values, alpha 255 throughout. */
function grey(rows: number[][]): Pixels {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      data[i] = rows[y][x]
      data[i + 1] = rows[y][x]
      data[i + 2] = rows[y][x]
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

function pixel(px: Pixels, x: number, y: number): number[] {
  const i = (y * px.width + x) * 4
  return [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]]
}

test('greyscale uses Rec. 601 luma rather than a flat average', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255])
  const out = greyscale({ width: 1, height: 1, data })

  // Pure red is 76 under Rec. 601 and 85 under (r+g+b)/3. The distinction is the whole
  // reason the weighting is named in the source: dark red print on brown card survives
  // one of those and not the other.
  expect(pixel(out, 0, 0)).toEqual([76, 76, 76, 255])
})

test('greyscale leaves alpha alone', () => {
  const data = new Uint8ClampedArray([10, 20, 30, 128])
  const out = greyscale({ width: 1, height: 1, data })
  expect(pixel(out, 0, 0)[3]).toBe(128)
})

test('invert flips the colour channels and not the alpha', () => {
  const data = new Uint8ClampedArray([0, 128, 255, 40])
  const out = invert({ width: 1, height: 1, data })
  expect(pixel(out, 0, 0)).toEqual([255, 127, 0, 40])
})

test('the contrast stretch spreads a flat mid-grey band over the full range', () => {
  // Nothing below 100 or above 150: a photograph of a tin in even, dull light.
  const out = stretchContrast(
    grey([
      [100, 125, 150],
      [100, 125, 150],
      [100, 125, 150],
    ]),
    0,
  )

  expect(pixel(out, 0, 0)[0]).toBe(0)
  expect(pixel(out, 2, 0)[0]).toBe(255)
  // The middle lands in the middle, give or take the rounding.
  expect(pixel(out, 1, 0)[0]).toBeGreaterThan(120)
  expect(pixel(out, 1, 0)[0]).toBeLessThan(135)
})

test('the contrast stretch ignores a single blown pixel, which is why it clips tails', () => {
  const rows = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 120))
  rows[0][0] = 0
  rows[9][9] = 255

  // With no clipping the two outliers pin the range and the step does nothing at all.
  const unclipped = stretchContrast(grey(rows), 0)
  expect(pixel(unclipped, 5, 5)[0]).toBe(120)

  // Clipping 2% of a hundred pixels is exactly the two outliers, and the flat field is
  // then a range of zero — left alone rather than divided by zero.
  const clipped = stretchContrast(grey(rows), 2)
  expect(Number.isFinite(pixel(clipped, 5, 5)[0])).toBe(true)
})

test('a flat image survives the contrast stretch unchanged instead of becoming garbage', () => {
  const flat = grey([
    [90, 90],
    [90, 90],
  ])
  const out = stretchContrast(flat, 0)
  expect(pixel(out, 0, 0)[0]).toBe(90)
})

test('lumaHistogram counts every pixel into its own bin', () => {
  const hist = lumaHistogram(
    grey([
      [0, 0],
      [255, 100],
    ]),
  )
  expect(hist[0]).toBe(2)
  expect(hist[255]).toBe(1)
  expect(hist[100]).toBe(1)
  expect(hist.reduce((sum, count) => sum + count, 0)).toBe(4)
})

test('Otsu finds the valley between two modes', () => {
  const hist = new Uint32Array(256)
  hist[30] = 100
  hist[200] = 100
  const threshold = otsuThreshold(hist)

  expect(threshold).toBeGreaterThanOrEqual(30)
  expect(threshold).toBeLessThan(200)
})

test('Otsu answers something usable for an empty histogram rather than dividing by zero', () => {
  expect(otsuThreshold(new Uint32Array(256))).toBe(128)
})

test('binariseOtsu emits only 0 and 255, and keeps the polarity it was given', () => {
  const out = binariseOtsu(
    grey([
      [20, 20, 240],
      [20, 240, 240],
    ]),
  )
  const values = new Set<number>()
  for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i])

  expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
  // Dark stays dark: Otsu is not an inverter, which is why `invert` is a separate knob.
  expect(pixel(out, 0, 0)[0]).toBe(0)
  expect(pixel(out, 2, 0)[0]).toBe(255)
})

test('the adaptive threshold keeps lettering in both halves of an unevenly lit image', () => {
  // Left half lit (background 220, ink 170), right half in shadow (background 80, ink 30).
  // No single global threshold can hold both: 125 loses the shadowed ink into background,
  // and 200 turns the whole shadowed half into ink.
  const rows: number[][] = []
  for (let y = 0; y < 24; y += 1) {
    const row: number[] = []
    for (let x = 0; x < 24; x += 1) {
      const lit = x < 12
      const isInk = y % 6 === 0
      row.push(lit ? (isInk ? 170 : 220) : isInk ? 30 : 80)
    }
    rows.push(row)
  }
  const px = grey(rows)

  const global = binariseOtsu(px)
  const local = binariseAdaptive(px, 0.25, 0.12)

  // Global: the shadowed half has collapsed to a single value, so its ink is gone.
  const shadowValues = new Set<number>()
  for (let y = 0; y < 24; y += 1) shadowValues.add(pixel(global, 20, y)[0])
  expect(shadowValues.size).toBe(1)

  // Local: ink and background are still distinguishable on both sides.
  expect(pixel(local, 20, 0)[0]).toBe(0)
  expect(pixel(local, 20, 3)[0]).toBe(255)
  expect(pixel(local, 4, 0)[0]).toBe(0)
  expect(pixel(local, 4, 3)[0]).toBe(255)
})

test('a no-op transform is an exact identity, not a resample', () => {
  const px = grey([
    [10, 90],
    [200, 40],
  ])
  const out = transform(px, { degrees: 0, scale: 1 })

  expect(out.width).toBe(2)
  expect(out.height).toBe(2)
  // Exact, not approximate. A "no rotation" that quietly bilinear-filtered the image
  // would soften every photograph before Tesseract ever saw it.
  expect(Array.from(out.data)).toEqual(Array.from(px.data))
})

test('upscale doubles both dimensions and keeps the corners', () => {
  const out = upscale(
    grey([
      [0, 255],
      [255, 0],
    ]),
    2,
  )

  expect([out.width, out.height]).toEqual([4, 4])
  expect(pixel(out, 0, 0)[0]).toBe(0)
  expect(pixel(out, 3, 0)[0]).toBe(255)
  expect(pixel(out, 0, 3)[0]).toBe(255)
})

test('a quarter turn swaps the dimensions', () => {
  const out = rotate(grey([[10, 20, 30, 40]]), 90)
  expect([out.width, out.height]).toEqual([1, 4])
})

test('rotation grows the canvas to keep the corners rather than cropping them', () => {
  const out = rotate(
    grey([
      [10, 20],
      [30, 40],
    ]),
    45,
  )
  // A 2×2 rotated 45° has a bounding box of 2√2 ≈ 2.83, so 3×3.
  expect([out.width, out.height]).toEqual([3, 3])
})

test('rotation fills the new corners with the border colour, never black', () => {
  const white = grey([
    [255, 255, 255],
    [255, 255, 255],
    [255, 255, 255],
  ])
  const out = rotate(white, 20)

  // Black corners put a hard high-contrast wedge against the lettering, which Tesseract's
  // layout analysis reads as a column boundary.
  expect(pixel(out, 0, 0)[0]).toBe(255)
})

test('applyPreprocess with every knob off returns the very same object', () => {
  const px = grey([[1, 2]])
  expect(applyPreprocess(px, NO_PREPROCESS)).toBe(px)
})

test('applyPreprocess resamples before it thresholds, so the upscale has greys to work with', () => {
  const px = grey([
    [0, 255],
    [255, 0],
  ])
  const out = applyPreprocess(px, { ...NO_PREPROCESS, upscale: true, binarise: 'otsu' })

  expect([out.width, out.height]).toEqual([4, 4])
  const values = new Set<number>()
  for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i])
  // Binary out — the threshold ran after the scale, not before it.
  expect([...values].every((value) => value === 0 || value === 255)).toBe(true)
})

test('applyPreprocess inverts last, so a binarised negative comes out dark-on-light', () => {
  // White lettering on a dark tin.
  const px = grey([
    [20, 20, 20],
    [20, 240, 20],
    [20, 20, 20],
  ])
  const out = applyPreprocess(px, { ...NO_PREPROCESS, binarise: 'otsu', invert: true })

  // The letter is now dark and the ground light, which is the only polarity the LSTM was
  // trained on. Inverting before the threshold could not have guaranteed this.
  expect(pixel(out, 1, 1)[0]).toBe(0)
  expect(pixel(out, 0, 0)[0]).toBe(255)
})

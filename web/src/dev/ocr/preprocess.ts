/**
 * The preprocessing knobs, as pure functions over a bag of pixels.
 *
 * Every step takes pixels and hands back new pixels; not one of them touches a canvas,
 * a ref or the DOM. That split is not tidiness. OCR itself cannot be tested in jsdom —
 * there is no WASM, no worker and no canvas — so the arithmetic is the only half of this
 * bench a test can hold onto, and it is only reachable if it is kept out of the
 * `<canvas>` that feeds it. `OcrBenchPage` owns the `getImageData`/`putImageData` half
 * and nothing else.
 *
 * `Pixels` is structural rather than `ImageData` for the same reason: jsdom ships no
 * canvas, so `new ImageData(...)` throws in a test. A plain `{ width, height, data }` is
 * assignable *from* a real `ImageData`, so the page passes one straight in and a test
 * builds one by hand with no shims.
 */
export type Pixels = {
  width: number
  height: number
  /** RGBA, four bytes per pixel, row-major — the `ImageData` layout, unchanged. */
  data: Uint8ClampedArray
}

/**
 * Rec. 601 luma, the weighting `cv2.cvtColor` and Tesseract's own greyscale both use.
 *
 * Not the flat `(r + g + b) / 3` average, which is the obvious thing and the wrong one
 * here: it makes red and blue as bright as green, and a tin printed in dark red on brown
 * card loses most of its contrast under it — exactly the photograph this bench exists to
 * rescue.
 */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function empty(width: number, height: number): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/** 256 bins of luma. Every threshold step below works off this rather than off the
 *  pixels, which is what keeps them O(pixels) once instead of O(pixels × candidates). */
export function lumaHistogram(px: Pixels): Uint32Array {
  const hist = new Uint32Array(256)
  for (let i = 0; i < px.data.length; i += 4) {
    hist[Math.round(luma(px.data[i], px.data[i + 1], px.data[i + 2]))] += 1
  }
  return hist
}

/** Apply a 256-entry lookup table to R, G and B, leaving alpha alone. A LUT rather than
 *  the same expression per pixel: three million pixels is three million evaluations of
 *  arithmetic that only has 256 possible answers. */
function applyLut(px: Pixels, lut: Uint8ClampedArray): Pixels {
  const out = empty(px.width, px.height)
  for (let i = 0; i < px.data.length; i += 4) {
    out.data[i] = lut[px.data[i]]
    out.data[i + 1] = lut[px.data[i + 1]]
    out.data[i + 2] = lut[px.data[i + 2]]
    out.data[i + 3] = px.data[i + 3]
  }
  return out
}

export function greyscale(px: Pixels): Pixels {
  const out = empty(px.width, px.height)
  for (let i = 0; i < px.data.length; i += 4) {
    const grey = Math.round(luma(px.data[i], px.data[i + 1], px.data[i + 2]))
    out.data[i] = grey
    out.data[i + 1] = grey
    out.data[i + 2] = grey
    out.data[i + 3] = px.data[i + 3]
  }
  return out
}

/**
 * The one knob that reliably rescues white-on-dark tins.
 *
 * Tesseract's LSTM was trained on black text on white paper and it is not
 * polarity-agnostic: the same tin photographed in negative routinely goes from a
 * confident read to noise. This is here because that is a one-checkbox fix and nothing
 * else in the pipeline can do it — Otsu below happily thresholds either polarity and
 * preserves it.
 */
export function invert(px: Pixels): Pixels {
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v += 1) lut[v] = 255 - v
  return applyLut(px, lut)
}

/**
 * Histogram stretch: find where the picture actually lives and spread it over 0–255.
 *
 * `clipPercent` is why this is a percentile stretch rather than a plain min/max one. A
 * single blown highlight on a tin's foil lid, or one black speck of dust, is enough to
 * pin min/max at 0 and 255 and turn the whole step into a no-op — which is the failure
 * mode you would never notice, because the picture comes back looking unchanged.
 */
export function stretchContrast(px: Pixels, clipPercent = 2): Pixels {
  const hist = lumaHistogram(px)
  const total = px.width * px.height
  const clip = Math.floor((total * clipPercent) / 100)

  let low = 0
  let seen = 0
  while (low < 255 && seen + hist[low] <= clip) {
    seen += hist[low]
    low += 1
  }

  let high = 255
  seen = 0
  while (high > low && seen + hist[high] <= clip) {
    seen += hist[high]
    high -= 1
  }

  const span = high - low
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v += 1) {
    // A flat image (span 0) is left alone rather than divided by zero into garbage.
    lut[v] = span <= 0 ? v : Math.round(((v - low) * 255) / span)
  }
  return applyLut(px, lut)
}

/**
 * Otsu's threshold: the split that minimises variance within the two halves.
 *
 * Exported on its own, and not only because it is the testable core of `binariseOtsu`.
 * The number itself is worth reading on a bench: a threshold that lands at 12 or 243 is
 * telling you the photograph has one mode, not two, and that adaptive is the branch to
 * try next.
 */
export function otsuThreshold(hist: Uint32Array): number {
  let total = 0
  let sum = 0
  for (let v = 0; v < 256; v += 1) {
    total += hist[v]
    sum += v * hist[v]
  }
  if (total === 0) return 128

  let backgroundWeight = 0
  let backgroundSum = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t += 1) {
    backgroundWeight += hist[t]
    if (backgroundWeight === 0) continue
    const foregroundWeight = total - backgroundWeight
    if (foregroundWeight === 0) break

    backgroundSum += t * hist[t]
    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (sum - backgroundSum) / foregroundWeight
    const delta = backgroundMean - foregroundMean
    const variance = backgroundWeight * foregroundWeight * delta * delta

    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

export function binariseOtsu(px: Pixels): Pixels {
  const threshold = otsuThreshold(lumaHistogram(px))
  const out = empty(px.width, px.height)
  for (let i = 0; i < px.data.length; i += 4) {
    const on = luma(px.data[i], px.data[i + 1], px.data[i + 2]) > threshold ? 255 : 0
    out.data[i] = on
    out.data[i + 1] = on
    out.data[i + 2] = on
    out.data[i + 3] = px.data[i + 3]
  }
  return out
}

/**
 * Bradley–Roth adaptive threshold: compare each pixel to the mean of its neighbourhood
 * rather than to one number for the whole picture.
 *
 * This is the step that exists because Otsu cannot do it. A tin photographed under a
 * kitchen light is bright on one side and in shadow on the other, and *any* global
 * threshold either eats the shadowed lettering or floods the lit half — there is no
 * single value that is right for both. The integral image is what makes the window mean
 * O(1) per pixel; the naive version is O(window²) and turns a 3MP photo into ten seconds.
 *
 * `bias` is the fraction below the local mean a pixel has to fall to count as ink. It is
 * not decoration: at 0 the step turns flat background into salt-and-pepper noise, because
 * half of any uniform region is by definition below its own mean.
 */
export function binariseAdaptive(px: Pixels, windowFraction = 0.06, bias = 0.12): Pixels {
  const { width, height } = px
  // One row and column of zeroes on the top and left, so the four-corner lookup below
  // needs no bounds tests.
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      rowSum += luma(px.data[i], px.data[i + 1], px.data[i + 2])
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const radius = Math.max(1, Math.round((Math.min(width, height) * windowFraction) / 2))
  const out = empty(width, height)

  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius)
    const bottom = Math.min(height - 1, y + radius)
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius)
      const right = Math.min(width - 1, x + radius)
      const area = (bottom - top + 1) * (right - left + 1)
      const sum =
        integral[(bottom + 1) * (width + 1) + (right + 1)] -
        integral[top * (width + 1) + (right + 1)] -
        integral[(bottom + 1) * (width + 1) + left] +
        integral[top * (width + 1) + left]
      const mean = sum / area

      const i = (y * width + x) * 4
      const value = luma(px.data[i], px.data[i + 1], px.data[i + 2])
      const on = value > mean * (1 - bias) ? 255 : 0
      out.data[i] = on
      out.data[i + 1] = on
      out.data[i + 2] = on
      out.data[i + 3] = px.data[i + 3]
    }
  }
  return out
}

/** The colour the corners of a rotated image get filled with: the average of the four
 *  source corners. Black would be the easy answer and the wrong one — it puts a hard
 *  high-contrast wedge against the lettering, and Tesseract's layout analysis reads that
 *  wedge as a column boundary. */
function borderColour(px: Pixels): [number, number, number, number] {
  const corners = [
    0,
    (px.width - 1) * 4,
    (px.height - 1) * px.width * 4,
    ((px.height - 1) * px.width + px.width - 1) * 4,
  ]
  const sum = [0, 0, 0, 0]
  for (const corner of corners) {
    for (let c = 0; c < 4; c += 1) sum[c] += px.data[corner + c]
  }
  return [sum[0] / 4, sum[1] / 4, sum[2] / 4, sum[3] / 4]
}

/**
 * Rotate and scale in one bilinear resample.
 *
 * One function rather than a `rotate` step followed by an `upscale` step, because two
 * resamples means interpolating interpolated pixels: straightening by 3° and then
 * doubling softens the letter edges measurably more than doing both at once, and soft
 * edges are the thing the 2× upscale was supposed to fix. `rotate` and `upscale` below
 * are the two knobs the UI actually shows; this is where both of them land.
 *
 * Inverse mapping — walk the *output* and sample the source — rather than forward
 * mapping, which leaves unwritten holes wherever the rotation stretches a row.
 */
export function transform(px: Pixels, { degrees = 0, scale = 1 }): Pixels {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  const scaledWidth = px.width * scale
  const scaledHeight = px.height * scale
  // The bounding box of the rotated rectangle, so a straightened photo keeps its corners
  // instead of having them cropped off.
  const outWidth = Math.max(1, Math.round(Math.abs(scaledWidth * cos) + Math.abs(scaledHeight * sin)))
  const outHeight = Math.max(1, Math.round(Math.abs(scaledWidth * sin) + Math.abs(scaledHeight * cos)))

  const out = empty(outWidth, outHeight)
  const fill = borderColour(px)
  const sourceCentreX = px.width / 2
  const sourceCentreY = px.height / 2

  for (let y = 0; y < outHeight; y += 1) {
    const dy = y + 0.5 - outHeight / 2
    for (let x = 0; x < outWidth; x += 1) {
      const dx = x + 0.5 - outWidth / 2

      // Un-rotate, then un-scale. Pixel centres, hence the halves: sampling at integer
      // corners shifts the whole image half a pixel up and left, which at 2× is a whole
      // pixel of drift and visible on the box overlay.
      const sx = (dx * cos + dy * sin) / scale + sourceCentreX - 0.5
      const sy = (-dx * sin + dy * cos) / scale + sourceCentreY - 0.5

      const target = (y * outWidth + x) * 4
      if (sx < -0.5 || sy < -0.5 || sx > px.width - 0.5 || sy > px.height - 0.5) {
        for (let c = 0; c < 4; c += 1) out.data[target + c] = fill[c]
        continue
      }

      const x0 = Math.max(0, Math.min(px.width - 1, Math.floor(sx)))
      const y0 = Math.max(0, Math.min(px.height - 1, Math.floor(sy)))
      const x1 = Math.min(px.width - 1, x0 + 1)
      const y1 = Math.min(px.height - 1, y0 + 1)
      const fx = Math.max(0, Math.min(1, sx - x0))
      const fy = Math.max(0, Math.min(1, sy - y0))

      const topLeft = (y0 * px.width + x0) * 4
      const topRight = (y0 * px.width + x1) * 4
      const bottomLeft = (y1 * px.width + x0) * 4
      const bottomRight = (y1 * px.width + x1) * 4

      for (let c = 0; c < 4; c += 1) {
        const top = px.data[topLeft + c] * (1 - fx) + px.data[topRight + c] * fx
        const bottom = px.data[bottomLeft + c] * (1 - fx) + px.data[bottomRight + c] * fx
        out.data[target + c] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }
  return out
}

export function rotate(px: Pixels, degrees: number): Pixels {
  return transform(px, { degrees, scale: 1 })
}

/** Tesseract wants an x-height of roughly 20–30px and a phone photograph of a 60mm tin
 *  rarely gets there. Doubling costs four times the pixels and is usually the single
 *  biggest win on this bench, which is why it is a knob and not a default: the point is
 *  to be able to see it. */
export function upscale(px: Pixels, scale = 2): Pixels {
  return transform(px, { degrees: 0, scale })
}

export type BinariseMode = 'off' | 'otsu' | 'adaptive'

export type PreprocessOptions = {
  greyscale: boolean
  contrast: boolean
  binarise: BinariseMode
  invert: boolean
  upscale: boolean
  /** Manual straightening, in degrees. Positive turns the image clockwise. */
  rotateDegrees: number
}

export const NO_PREPROCESS: PreprocessOptions = {
  greyscale: false,
  contrast: false,
  binarise: 'off',
  invert: false,
  upscale: false,
  rotateDegrees: 0,
}

export function isPreprocessing(options: PreprocessOptions): boolean {
  return (
    options.greyscale ||
    options.contrast ||
    options.binarise !== 'off' ||
    options.invert ||
    options.upscale ||
    options.rotateDegrees !== 0
  )
}

/**
 * Run the enabled steps, in the order that makes each of them do its job.
 *
 * The order is the interesting part and it is not the order of the checkboxes:
 *
 * 1. **Geometry first**, and both halves of it at once. Resampling is the only lossy step
 *    here, so it happens once, on the richest data, before anything has been quantised.
 * 2. **Upscale before thresholding, not after.** Interpolating a binary image gives you
 *    grey pixels that then have to be thresholded again, and the second threshold is what
 *    puts stair-steps on every diagonal. Interpolating the greys and thresholding once is
 *    the whole reason a 2× upscale helps small lettering at all.
 * 3. **Greyscale before the contrast stretch**, so the stretch is fitted to the luminance
 *    the threshold will actually see rather than to three channels separately.
 * 4. **Invert last.** Otsu and Bradley both preserve whatever polarity they were given,
 *    so on a white-on-black tin the inversion has to come after them to leave Tesseract
 *    the dark-on-light image it wants.
 *
 * With every knob off this returns its argument, same object. That matters on a bench:
 * "no preprocessing" should be a genuine baseline, not a bilinear round trip that has
 * already softened the photo before Tesseract sees it.
 */
export function applyPreprocess(px: Pixels, options: PreprocessOptions): Pixels {
  if (!isPreprocessing(options)) return px

  let out = px
  const scale = options.upscale ? 2 : 1
  if (options.rotateDegrees !== 0 || scale !== 1) {
    out = transform(out, { degrees: options.rotateDegrees, scale })
  }
  if (options.greyscale) out = greyscale(out)
  if (options.contrast) out = stretchContrast(out)
  if (options.binarise === 'otsu') out = binariseOtsu(out)
  if (options.binarise === 'adaptive') out = binariseAdaptive(out)
  if (options.invert) out = invert(out)
  return out
}

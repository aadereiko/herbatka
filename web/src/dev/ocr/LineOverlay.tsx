import type { OcrLine } from './draft'
import { BAND_BORDER, confidenceBand } from './confidence'

/**
 * The recognised boxes, drawn back onto the picture they came from.
 *
 * This is the panel that makes the table mean something. A confidence of 43 on a line
 * reading "RO0IB0S TFA" tells you nothing about *why*; the same line with its box drawn
 * around half a word and a slice of the tin's rim tells you immediately that the
 * segmentation went wrong and no amount of contrast will fix it.
 *
 * Geometry is in percentages and the picture is `w-full`, which is what keeps the boxes
 * registered to the image at every width with nothing measured and no resize listener —
 * the same reasoning as the columns in `TeaConsumptionPlot`, where a fixed viewBox was
 * rejected for the same reason.
 *
 * Boxes are real `<button>`s rather than painted rectangles. They have to be: the point
 * is to connect a box to a row, and a hit-tested canvas would give that connection to a
 * mouse only. The colour is the confidence band, and the opacity carries the same
 * information again, so the pairing survives a greyscale print and a photograph that
 * happens to be green.
 */
export function LineOverlay({
  imageUrl,
  width,
  height,
  lines,
  selected,
  onSelect,
}: {
  imageUrl: string
  width: number
  height: number
  lines: OcrLine[]
  /** The 1-based line index, or null. */
  selected: number | null
  onSelect: (index: number | null) => void
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-200 dark:border-neutral-700">
      <img
        src={imageUrl}
        // The processed image, not the original: these boxes are in *its* coordinate
        // space, and after a 2× upscale or a 4° straighten the two spaces are different.
        alt="The processed image the boxes below were recognised from"
        className="block h-auto w-full"
      />
      {lines.map((line) => {
        const band = confidenceBand(line.confidence)
        const isSelected = selected === line.index
        return (
          <button
            key={line.index}
            type="button"
            title={`Line ${line.index}: ${line.text} (${Math.round(line.confidence)}%)`}
            onClick={() => onSelect(isSelected ? null : line.index)}
            style={{
              left: `${(line.box.x0 / width) * 100}%`,
              top: `${(line.box.y0 / height) * 100}%`,
              width: `${((line.box.x1 - line.box.x0) / width) * 100}%`,
              height: `${((line.box.y1 - line.box.y0) / height) * 100}%`,
              // Faded by confidence as well as coloured by it, so a wall of boxes still
              // reads as "these three are the doubtful ones" at a glance.
              opacity: isSelected ? 1 : 0.35 + (Math.min(100, Math.max(0, line.confidence)) / 100) * 0.5,
            }}
            className={`absolute border-2 ${BAND_BORDER[band]} ${
              isSelected ? 'bg-brand-500/25 ring-2 ring-brand-500' : 'hover:bg-brand-500/15'
            }`}
          >
            <span className="sr-only">
              Line {line.index}, {Math.round(line.confidence)} percent confident
            </span>
          </button>
        )
      })}
      {lines.length === 0 && (
        <p className="absolute inset-x-0 bottom-0 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-100 dark:text-neutral-100">
          No lines. Tesseract found no text at all in this image.
        </p>
      )}
    </div>
  )
}

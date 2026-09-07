import { Badge } from '../../components/ui/page'
import { BAND_TEXT, confidenceBand } from './confidence'
import type { OcrLine } from './draft'
import type { VocabKind, VocabMatch } from './vocabulary'

/**
 * One row per recognised line, and one column that is the entire reason this bench exists.
 *
 * The **catalog repair** column prints both halves of every fuzzy match — what OCR said,
 * what the catalog has, and the score — because the interesting question is not "did the
 * matcher work" but "which of Tesseract's mistakes does my own tea data fix for free".
 * A column that showed only the corrected word would hide exactly that.
 *
 * A real `<table>` rather than a grid of divs. The data is tabular, the header cells are
 * genuine `<th>`s, and a screen reader announces "Confidence, 43" instead of a bare
 * number floating between two other bare numbers.
 */

const KIND_TONE: Record<VocabKind, 'brand' | 'neutral' | 'amber'> = {
  ingredient: 'brand',
  brand: 'amber',
  tea: 'neutral',
}

function Repair({ match }: { match: VocabMatch }) {
  const exact = match.ocrText === match.entry.key
  return (
    <span className="flex flex-wrap items-baseline gap-1.5">
      <Badge tone={KIND_TONE[match.entry.kind]}>{match.entry.kind}</Badge>
      {/* Quoted, and quoted first: the mis-read is the finding. */}
      <code className="text-xs text-neutral-600 dark:text-neutral-400">“{match.ocrText}”</code>
      <span aria-hidden="true" className="text-neutral-500 dark:text-neutral-500">
        →
      </span>
      <span className="text-xs font-semibold text-brand-900 dark:text-brand-100">
        {match.entry.name}
      </span>
      <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
        {/* An exact hit is worth marking as such. A table where everything says 1.00 is a
            table where the repairs are invisible among the freebies. */}
        {exact ? 'exact' : match.score.toFixed(2)}
      </span>
    </span>
  )
}

export function LinesTable({
  lines,
  matches,
  minConfidence,
  selected,
  onSelect,
}: {
  lines: OcrLine[]
  /** Parallel to `lines`: `matches[i]` is what the vocabulary found in `lines[i]`. */
  matches: VocabMatch[][]
  minConfidence: number
  selected: number | null
  onSelect: (index: number | null) => void
}) {
  return (
    <div className="overflow-x-auto">
      {/* A minimum width, so the six columns keep their shape and the wrapper scrolls
          rather than the repair column being squeezed into one word per line. */}
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Recognised lines with confidence, geometry and catalog matches
        </caption>
        <thead>
          <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            <th scope="col" className="py-2 pr-2 font-semibold">
              #
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Text
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Conf.
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Height
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Box (x0, y0, x1, y1)
            </th>
            <th scope="col" className="py-2 font-semibold">
              Catalog repair
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, position) => {
            const band = confidenceBand(line.confidence)
            const dropped = line.confidence < minConfidence
            const repairs = matches[position] ?? []
            return (
              <tr
                key={line.index}
                onClick={() => onSelect(selected === line.index ? null : line.index)}
                data-testid={`ocr-line-${line.index}`}
                className={`cursor-pointer border-b border-brand-200/60 align-top dark:border-neutral-800 ${
                  selected === line.index ? 'bg-brand-100 dark:bg-neutral-800' : ''
                } ${dropped ? 'opacity-50' : ''}`}
              >
                <td className="py-2 pr-2 tabular-nums text-neutral-500 dark:text-neutral-400">
                  {line.index}
                </td>
                <td className="py-2 pr-3 text-neutral-700 dark:text-neutral-200">
                  {line.text.trim() === '' ? (
                    <span className="text-neutral-500 dark:text-neutral-500">(blank)</span>
                  ) : (
                    line.text
                  )}
                </td>
                <td className={`py-2 pr-3 tabular-nums font-semibold ${BAND_TEXT[band]}`}>
                  {Math.round(line.confidence)}
                  {/* Struck through rather than hidden: a line the draft ignored is a
                      fact about the draft, and hiding it makes the confidence floor look
                      like it did nothing. */}
                  {dropped && <span className="ml-1 font-normal">(cut)</span>}
                </td>
                <td className="py-2 pr-3 tabular-nums text-neutral-600 dark:text-neutral-400">
                  {Math.round(line.heightPx)}px
                </td>
                <td className="py-2 pr-3 tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
                  {Math.round(line.box.x0)}, {Math.round(line.box.y0)}, {Math.round(line.box.x1)},{' '}
                  {Math.round(line.box.y1)}
                </td>
                <td className="py-2">
                  {repairs.length === 0 ? (
                    <span className="text-xs text-neutral-500 dark:text-neutral-500">—</span>
                  ) : (
                    <span className="flex flex-col gap-1">
                      {repairs.map((match) => (
                        <Repair key={`${match.entry.id}-${match.from}`} match={match} />
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

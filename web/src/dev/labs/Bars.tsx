export type Datum = { label: string; value: number }

/**
 * A horizontal bar chart, one series, one hue.
 *
 * Single-hue is a decision rather than a shortcut. Running the app's own tokens through a
 * categorical-palette validator fails three checks — the editorial greens and clays sit at
 * chroma 0.075–0.086 and the worst adjacent pair is ΔE 3.2 under deuteranopia, which is
 * indistinguishable. Every chart here is therefore single-series magnitude, with identity
 * carried by the row label and the value printed at the end of the bar, so nothing depends
 * on telling two colours apart.
 *
 * Horizontal rather than vertical because the labels are words — country and ingredient
 * names — and rotated axis text is the most common way a chart becomes unreadable.
 */
export function Bars({
  data,
  formatValue = (n: number) => n.toLocaleString(),
  max,
}: {
  data: Datum[]
  formatValue?: (value: number) => string
  max?: number
}) {
  const ceiling = max ?? Math.max(1, ...data.map((d) => d.value))

  return (
    <ol className="flex flex-col gap-1.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3">
          <span className="truncate text-xs text-neutral-400" title={d.label}>
            {d.label}
          </span>
          <span className="h-3 rounded-sm bg-neutral-800" aria-hidden>
            <span
              className="block h-3 rounded-sm bg-brand-600"
              style={{ width: `${Math.max(1.5, (d.value / ceiling) * 100)}%` }}
            />
          </span>
          <span className="text-right text-xs tabular-nums text-neutral-300">
            {formatValue(d.value)}
          </span>
        </li>
      ))}
    </ol>
  )
}

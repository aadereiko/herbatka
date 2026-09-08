import { useMemo, useState } from 'react'

import { Badge, PageHeading, PageShell, Panel, SectionLabel } from '../../components/ui/page'
import { Bars } from './Bars'
import {
  coOccurrence,
  countBy,
  flavourFrequency,
  generatedOn,
  ingredientFrequency,
  shopCount,
  stats,
  teas,
} from './data'
import { TeaTable } from './TeaTable'

/** The empty string already means "any format" in the select, so "the shop did not say"
 *  needs a value of its own rather than a second empty option. */
const NOT_STATED = '__not_stated' 

/**
 * The data-science bench: the vendor catalogue harvest, as a page you can interrogate.
 *
 * Not a feature, and mounted behind `import.meta.env.DEV` in `app/router.tsx` for two
 * reasons. The first is the same one the OCR bench gives — a dev gate is a stronger gate
 * than a role check, because Vite folds the conditional away and Rollup then drops the
 * chunk entirely. The second matters more here: `vendor-dataset.json` is four shops'
 * catalogue copy, gathered to develop and validate the similarity work. It has no business
 * in a bundle served to the public, and this is what guarantees it never is.
 *
 * Every chart is a single series in a single hue. That is not a stylistic shortcut — the
 * app's own tokens fail a categorical-palette validation (chroma 0.075–0.086 against a
 * 0.1 floor, worst adjacent pair ΔE 3.2 under deuteranopia), so any two-colour encoding
 * here would be unreadable to a colourblind reader. Identity lives in the row labels.
 */
export function LabsPage() {
  const [country, setCountry] = useState('')
  const [format, setFormat] = useState('')
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState('Hibiscus')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return teas.filter(
      (t) =>
        (!country || t.country === country) &&
        (!format || (format === NOT_STATED ? t.format === '' : t.format === format)) &&
        (!needle ||
          t.name.toLowerCase().includes(needle) ||
          t.ingredients.some((i) => i.toLowerCase().includes(needle))),
    )
  }, [country, format, query])

  const byCountry = useMemo(() => countBy(teas, (t) => t.country), [])
  const byFormat = useMemo(
    () => countBy(teas, (t) => t.format || 'not stated'),
    [],
  )
  const byType = useMemo(() => countBy(teas, (t) => t.teaType || 'not stated'), [])
  const topIngredients = useMemo(() => ingredientFrequency(filtered, 25), [filtered])
  const topFlavours = useMemo(() => flavourFrequency(teas, 23), [])
  const withFlavour = teas.filter((t) => t.flavours.length > 0).length
  const partners = useMemo(() => coOccurrence(teas, focus, 12), [focus])

  const withComposition = teas.filter((t) => t.hasCompositionList).length
  const countries = byCountry.map((c) => c.label)
  const allIngredients = useMemo(() => ingredientFrequency(teas, 60).map((i) => i.label), [])

  return (
    <PageShell>
      <PageHeading
        title="Data science bench"
        subtitle={`${teas.length.toLocaleString()} teas harvested from ${shopCount} shops in ${countries.length} countries · generated ${generatedOn}`}
        actions={<Badge tone="neutral">dev only</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Teas" value={teas.length.toLocaleString()} note={`${countries.length} countries`} />
        <Stat
          label="Ingredient rows"
          value={stats.ingredientRows.toLocaleString()}
          note={`${stats.distinctIngredients} distinct, in English`}
        />
        <Stat
          label="With real percentages"
          value={stats.rowsWithPercentage.toLocaleString()}
          note="the rest are presence only"
        />
        <Stat
          label="From a composition list"
          value={`${Math.round((withComposition / teas.length) * 100)}%`}
          note="the rest are named in prose"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <SectionLabel>Teas per country</SectionLabel>
          <Bars data={byCountry} />
        </Panel>
        <Panel>
          <SectionLabel>How it is sold</SectionLabel>
          <Bars data={byFormat} />
          <p className="mt-3 text-xs text-neutral-500">
            No shop publishes this as a field — it is read out of the product name, the URL
            and the variant titles, in six languages. Most specialists simply never say.
          </p>
        </Panel>
        <Panel>
          <SectionLabel>Flavour families</SectionLabel>
          <Bars data={topFlavours} />
          <p className="mt-3 text-xs text-neutral-500">
            Read out of each shop's own prose by <code>herbatka_analysis.flavour</code>, on{' '}
            {Math.round((withFlavour / teas.length) * 100)}% of teas. A separate axis from
            ingredients — but only where the shop writes a paragraph. On those, 84% of
            teas get a family and they rescue 27% of the pairs sharing no ingredient
            (coverage 30% → 48%). On shops publishing only a one-line meta description,
            27% get a family and the rescue is ~1%.
          </p>
        </Panel>
        <Panel>
          <SectionLabel>Tea type</SectionLabel>
          <Bars data={byType} />
          <p className="mt-3 text-xs text-neutral-500">
            Inferred from the name and the ingredients, not stated by the shop.
          </p>
        </Panel>
      </div>

      <Panel className="mb-6">
        <SectionLabel>What goes with what</SectionLabel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-xs text-neutral-400" htmlFor="labs-focus">
            Ingredient
          </label>
          <select
            id="labs-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          >
            {allIngredients.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <Bars
          data={partners}
          formatValue={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <p className="mt-3 text-xs text-neutral-500">
          Jaccard index — how often the two share a tea, as a share of the teas either
          appears in. Raw co-occurrence counts would just rank the common ingredients again;
          dividing by the union is what makes a rare, reliable pairing beat a common,
          coincidental one.
        </p>
      </Panel>

      <Panel>
        <SectionLabel>Every tea</SectionLabel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or ingredient"
            className="min-w-52 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country"
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            aria-label="Format"
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          >
            <option value="">Any format</option>
            <option value="bags">Bags</option>
            <option value="loose">Loose</option>
            <option value="powder">Powder</option>
            <option value={NOT_STATED}>Not stated</option>
          </select>
          <span className="text-xs text-neutral-400">
            {filtered.length.toLocaleString()} of {teas.length.toLocaleString()}
          </span>
        </div>

        <div className="mb-5">
          <SectionLabel as="h3">Commonest ingredients in this selection</SectionLabel>
          <Bars data={topIngredients} />
        </div>

        <TeaTable rows={filtered} />
      </Panel>
    </PageShell>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Panel>
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl tabular-nums text-brand-100">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{note}</p>
    </Panel>
  )
}

export default LabsPage

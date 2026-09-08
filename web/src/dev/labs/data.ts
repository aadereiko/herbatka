import raw from './vendor-dataset.json'

export type TeaFormat = 'bags' | 'loose' | 'powder' | ''

export type VendorTea = {
  name: string
  shop: string
  country: string
  teaType: string
  format: TeaFormat
  ingredients: string[]
  flavours: string[]
  flags: string[]
  usable: boolean
  hasCompositionList: boolean
  url: string
}

type Payload = {
  generated: string
  shops: { name: string; country: string }[]
  ingredients: string[]
  flavours: string[]
  flags: string[]
  /** Positional, to keep the bundle small — see `schema` in the JSON. */
  teas: [string, number, string, string, number[], number[], number[], boolean, boolean, string][]
  stats: { ingredientRows: number; rowsWithPercentage: number; distinctIngredients: number }
}

// TypeScript widens every row of the imported JSON to `(string | number | boolean |
// number[])[]` — it cannot see that each is a fixed 10-tuple — so the assertion has to go
// through `unknown`. The shape is guaranteed by `analysis/vendor_catalogues/export_for_web.py`,
// which writes the `schema` field beside the rows to say what the positions mean.
const payload = raw as unknown as Payload

/**
 * The rows arrive as positional arrays with ingredients as indexes into a shared list,
 * which is what keeps 2,950 teas inside 418 KB. Widening them once here means every
 * component downstream reads plain named fields.
 */
export const teas: VendorTea[] = payload.teas.map(
  ([
    name,
    shopIndex,
    teaType,
    format,
    ingredientIndexes,
    flavourIndexes,
    flagIndexes,
    usable,
    hasCompositionList,
    url,
  ]) => ({
    name,
    shop: payload.shops[shopIndex].name,
    country: payload.shops[shopIndex].country,
    teaType,
    format: format as TeaFormat,
    ingredients: ingredientIndexes.map((i) => payload.ingredients[i]),
    flavours: flavourIndexes.map((i) => payload.flavours[i]),
    flags: flagIndexes.map((i) => payload.flags[i]),
    usable,
    hasCompositionList,
    url,
  }),
)

export const generatedOn = payload.generated
export const stats = payload.stats
export const shopCount = payload.shops.length

export function countBy<T>(rows: T[], key: (row: T) => string): { label: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = key(row)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

export function ingredientFrequency(rows: VendorTea[], limit: number) {
  return frequency(rows, (t) => t.ingredients, limit)
}

export function flavourFrequency(rows: VendorTea[], limit: number) {
  return frequency(rows, (t) => t.flavours, limit)
}

export function flagFrequency(rows: VendorTea[], limit: number) {
  return frequency(rows, (t) => t.flags, limit)
}

function frequency(rows: VendorTea[], pick: (t: VendorTea) => string[], limit: number) {
  const counts = new Map<string, number>()
  for (const tea of rows) {
    for (const ingredient of pick(tea)) {
      counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

/**
 * How often two ingredients appear in the same tea, as a fraction of the times either does.
 * This is the Jaccard index, and it is the cheapest honest answer to "what goes with what" —
 * raw co-occurrence counts just rank the common ingredients again.
 */
export function coOccurrence(rows: VendorTea[], ingredient: string, limit: number) {
  const withIt = rows.filter((t) => t.ingredients.includes(ingredient))
  const counts = new Map<string, number>()
  for (const tea of withIt) {
    for (const other of tea.ingredients) {
      if (other !== ingredient) counts.set(other, (counts.get(other) ?? 0) + 1)
    }
  }
  const totals = new Map<string, number>()
  for (const tea of rows) {
    for (const other of tea.ingredients) totals.set(other, (totals.get(other) ?? 0) + 1)
  }
  return [...counts]
    .map(([label, together]) => ({
      label,
      value: together / (withIt.length + (totals.get(label) ?? 0) - together),
      together,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

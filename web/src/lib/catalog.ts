/**
 * The M2 catalog contract.
 *
 * The data shapes are aliases of the API's own OpenAPI schemas (`npm run types`
 * regenerates `lib/generated/api.ts`), so renaming a field in a Pydantic model breaks
 * this build rather than a component at runtime.
 *
 * Two things stay hand-written here, deliberately:
 *
 * - `Page<T>`. FastAPI emits one concrete `Page_TeaSummary_` schema per instantiation;
 *   a single generic is the more useful thing for call sites to hold.
 * - The label objects. OpenAPI gives the *type* of an enum-ish field but not an
 *   ordered, human-readable list to render, and the filter chips and selects need one —
 *   `puerh` is not a label anybody wants to read.
 */


import type { Favouritable } from './favourite'
import type { components } from './generated/api'

export const TEA_TYPE_LABELS = {
  green: 'Green',
  black: 'Black',
  oolong: 'Oolong',
  puerh: 'Pu-erh',
  white: 'White',
  herbal: 'Herbal',
  rooibos: 'Rooibos',
  blend: 'Blend',
} as const

// A union derived from the object rather than an enum: the scaffold sets
// `erasableSyntaxOnly`, which bans any TypeScript that emits runtime code.
export type TeaType = keyof typeof TEA_TYPE_LABELS

export const TEA_TYPES = Object.keys(TEA_TYPE_LABELS) as TeaType[]

export const CAFFEINE_LEVEL_LABELS = {
  none: 'Caffeine-free',
  low: 'Low caffeine',
  medium: 'Medium caffeine',
  high: 'High caffeine',
} as const

export type CaffeineLevel = keyof typeof CAFFEINE_LEVEL_LABELS

export const CAFFEINE_LEVELS = Object.keys(CAFFEINE_LEVEL_LABELS) as CaffeineLevel[]

export const INGREDIENT_CATEGORY_LABELS = {
  leaf: 'Leaf',
  herb: 'Herb',
  flower: 'Flower',
  spice: 'Spice',
  fruit: 'Fruit',
  other: 'Other',
} as const

export type IngredientCategory = keyof typeof INGREDIENT_CATEGORY_LABELS

export const INGREDIENT_CATEGORIES = Object.keys(
  INGREDIENT_CATEGORY_LABELS,
) as IngredientCategory[]

/** Guards for values arriving from the query string, which is user-editable text. */
export function isTeaType(value: string | null): value is TeaType {
  return value !== null && value in TEA_TYPE_LABELS
}

export function isIngredientCategory(value: string | null): value is IngredientCategory {
  return value !== null && value in INGREDIENT_CATEGORY_LABELS
}

/** The shared page envelope every list endpoint returns. */
export type Page<T> = {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

/* --------------------------------------------------------- generated from the API */

// The swap the header describes, now done: these are the API's own schemas, so a
// renamed Pydantic field breaks the build here instead of at runtime in a component.
// Nullability now matches the server exactly — the generated write schemas are
// `T | null`, not `T?`, which is what makes clearing a field via PATCH expressible.
export type Ingredient = components['schemas']['IngredientOut']

/**
 * An ingredient plus how much people like it, and how much *you* like it.
 *
 * Kept apart from `Ingredient` rather than folded into it, because the two really are
 * different responses: every read path returns this, and the admin create/edit endpoints
 * return the bare `IngredientOut` — nobody has rated a thing that did not exist a moment
 * ago. Aliasing one to the other would put `my_score` in the type of a response that does
 * not contain it, which is exactly the class of lie these aliases exist to prevent.
 */
export type IngredientTaste = components['schemas']['IngredientTaste']
export type IngredientRatingInput = components['schemas']['IngredientRatingInput']
export type BrandRef = components['schemas']['BrandRef']
export type Brand = components['schemas']['BrandOut']
export type TeaIngredient = components['schemas']['TeaIngredientOut']

/* ------------------------------------------------- what M8 adds, ahead of the types */

/**
 * Your own numbers for one tea, overriding the catalog's.
 *
 * Every figure is nullable *individually*, and that is the whole shape of the feature:
 * somebody who only ever disagrees with the catalog about the water temperature sets one
 * field and leaves the other two to fall back. A note with all four nulls is still a note
 * — it exists, so the page shows your panel — which is why the absence of a note is
 * `my_brewing: null` rather than four nulls.
 *
 * Hand-written for the same reason as `lib/favourite.ts`: the generated file has not seen
 * the M8 API yet. When it has, this becomes `components['schemas']['BrewingNote']` and
 * the intersections below go away.
 */
export type BrewingNote = {
  brew_temp_c: number | null
  brew_seconds: number | null
  grams_per_100ml: number | null
  note: string | null
  updated_at: string
}

/**
 * The body of `PUT /catalog/teas/{slug}/brewing`, which both creates and replaces.
 *
 * Every key is sent on every save, as explicit nulls where a box was left empty. The
 * contract spells the fields optional, but omitting one asks the server to decide what
 * "unmentioned" means — and clearing a temperature you had set has to be expressible as
 * something other than "leave it alone". Sending all four is the only reading that makes
 * the form's empty boxes mean what they look like they mean.
 */
export type BrewingInput = {
  brew_temp_c: number | null
  brew_seconds: number | null
  grams_per_100ml: number | null
  note: string | null
}

/**
 * Both tea schemas gain the star; the detail gains your brewing note as well, so the
 * panel and its form are filled in without a second request.
 *
 * Intersections rather than edits to the generated file, in the M4 style: when
 * `npm run types` sees the M8 API these collapse back to bare aliases, and every call
 * site is already written against the final shape.
 */
export type TeaSummary = components['schemas']['TeaSummary'] & Favouritable

export type TeaDetail = components['schemas']['TeaDetail'] &
  Favouritable & {
    my_brewing: BrewingNote | null
  }


/* ------------------------------------------------------------------ write payloads */

export type TeaIngredientInput = components['schemas']['TeaIngredientIn']
/** Body of both `POST /catalog/teas` and `POST /admin/teas` — the same shape, and the
 *  only difference is which `is_approved` the server hands back. */
export type TeaInput = components['schemas']['TeaCreate']
export type TeaPatch = components['schemas']['TeaUpdate']
export type IngredientInput = components['schemas']['IngredientCreate']
export type IngredientPatch = components['schemas']['IngredientUpdate']
export type BrandInput = components['schemas']['BrandCreate']
export type BrandPatch = components['schemas']['BrandUpdate']

/* ------------------------------------------------------------------- query strings */

export type TeaListParams = {
  q?: string
  tea_type?: TeaType
  ingredient?: string
  brand?: string
  page?: number
  size?: number
}

export type IngredientListParams = {
  q?: string
  category?: IngredientCategory
  page?: number
  size?: number
}

export type BrandListParams = {
  q?: string
  page?: number
  size?: number
}

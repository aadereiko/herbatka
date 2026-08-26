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
export type BrandRef = components['schemas']['BrandRef']
export type Brand = components['schemas']['BrandOut']
export type TeaIngredient = components['schemas']['TeaIngredientOut']
export type TeaSummary = components['schemas']['TeaSummary']
export type TeaDetail = components['schemas']['TeaDetail']

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

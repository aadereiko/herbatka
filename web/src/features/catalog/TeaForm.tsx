import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '../../components/ui/form'
import { IMAGE_UPLOAD_HINT, ImageUploadField } from '../../components/ui/image-upload'
import { Badge, PendingBadge, Skeleton } from '../../components/ui/page'
import { useDebouncedValue } from '../../lib/debounce'
import type {
  CaffeineLevel,
  Ingredient,
  IngredientCategory,
  TeaInput,
  TeaType,
} from '../../lib/catalog'
import {
  CAFFEINE_LEVELS,
  CAFFEINE_LEVEL_LABELS,
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_LABELS,
  TEA_TYPES,
  TEA_TYPE_LABELS,
} from '../../lib/catalog'
import { useBrandList, useIngredientList } from './queries'

/** The tea form is shared by three callers: a signed-in visitor suggesting a tea
 *  (`POST /catalog/teas`, comes back unapproved), an admin creating one
 *  (`POST /admin/teas`, comes back approved), and the shelf form, which does not post
 *  the `TeaInput` at all — it carries it as `new_tea` on the tin so both are written in
 *  one transaction. The form takes the submit function rather than knowing which of the
 *  three it is, which is why the third one costs it no request logic. */
type PickedIngredient = {
  ingredient: Ingredient
  /** Kept as the raw string the user typed. Parsing at submit rather than on every
   *  keystroke is what lets someone clear the box and type "12" without it becoming 1. */
  percentage: string
  isPrimary: boolean
}

type FieldErrors = { name?: string; ingredients?: string; shop?: string }

/** One ingredient that does not exist yet. Only what somebody mid-recipe will actually
 *  fill in — the description and the picture are an admin's job at approval time. */
type ProposedIngredient = {
  name: string
  category: IngredientCategory
  isPrimary: boolean
}

function optionalText(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function optionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

const teaTypeOptions = TEA_TYPES.map((value) => ({ value, label: TEA_TYPE_LABELS[value] }))
const caffeineOptions = CAFFEINE_LEVELS.map((value) => ({
  value,
  label: CAFFEINE_LEVEL_LABELS[value],
}))

export function TeaForm({
  idPrefix,
  submitLabel,
  pendingLabel,
  pending,
  error,
  withUpload = false,
  withShop = true,
  initialName = '',
  onSubmit,
}: {
  idPrefix: string
  submitLabel: string
  pendingLabel: string
  pending: boolean
  error?: string | null
  /** M6: the admin form uploads a picture; the public suggestion form still takes a URL.
   *  Not a snub — a suggestion is a stranger's tip-off, and handing every visitor a file
   *  endpoint to store bytes through is a different decision from letting them type a
   *  link. An admin adds the real photo when they approve it. */
  withUpload?: boolean
  /** Off for the shelf form, which has already asked where the tin came from and lands
   *  the answer on the tin's own `shop_id` as well as on a listing. Asking twice on one
   *  screen is how you get two shops with the same name and two slugs. */
  withShop?: boolean
  /** What was typed into the picker that found nothing. Carried in rather than left blank
   *  for the same reason the unknown-ingredient button below carries its search text: the
   *  name is the one thing already known, and retyping it is the sort of small insult
   *  that makes a form feel like paperwork. */
  initialName?: string
  onSubmit: (input: TeaInput) => void
}) {
  const [name, setName] = useState(initialName)
  const [teaType, setTeaType] = useState<TeaType>('green')
  const [caffeine, setCaffeine] = useState<CaffeineLevel>('medium')
  const [brandId, setBrandId] = useState('')
  const [origin, setOrigin] = useState('')
  const [description, setDescription] = useState('')
  // One piece of state for two controls: the uploader hands back the URL the server
  // stored, and the text box takes one typed in. Whichever the caller offers, the value
  // submitted is the same field.
  const [imageUrl, setImageUrl] = useState('')
  const [brewTemp, setBrewTemp] = useState('')
  const [brewSeconds, setBrewSeconds] = useState('')
  const [grams, setGrams] = useState('')
  const [picked, setPicked] = useState<PickedIngredient[]>([])
  /** Ingredients the catalog does not have. Proposed here rather than on a second page,
   *  because the moment somebody finds the gap is the moment they are describing a
   *  recipe — and sending them away to fix it loses the recipe. */
  const [proposed, setProposed] = useState<ProposedIngredient[]>([])
  const [shopName, setShopName] = useState('')
  const [shopCity, setShopCity] = useState('')
  const [shopWebsite, setShopWebsite] = useState('')

  const [errors, setErrors] = useState<FieldErrors>({})

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const brands = useBrandList({ size: 100 })
  const matches = useIngredientList({ q: debouncedSearch || undefined, size: 8 })

  const pickedIds = new Set(picked.map((row) => row.ingredient.id))
  const suggestions = (matches.data?.items ?? []).filter((item) => !pickedIds.has(item.id))

  const brandOptions = [
    { value: '', label: 'No brand / unknown' },
    ...(brands.data?.items ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
  ]

  function add(ingredient: Ingredient) {
    setPicked((rows) => [...rows, { ingredient, percentage: '', isPrimary: rows.length === 0 }])
    setSearch('')
  }

  function updateRow(id: string, patch: Partial<PickedIngredient>) {
    setPicked((rows) => rows.map((row) => (row.ingredient.id === id ? { ...row, ...patch } : row)))
  }

  function remove(id: string) {
    setPicked((rows) => rows.filter((row) => row.ingredient.id !== id))
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!name.trim()) found.name = 'Give the tea a name.'
    const badPercentage = picked.some((row) => {
      if (row.percentage.trim() === '') return false
      const value = Number(row.percentage)
      return !Number.isFinite(value) || value <= 0 || value > 100
    })
    if (badPercentage) found.ingredients = 'Percentages must be between 1 and 100.'
    // Mirrors the server's own rule and the CHECK behind it: a shop with neither a
    // website nor a city cannot be found by anybody. Caught here so the answer is a
    // message under the field rather than a 422 on the whole tea.
    if (shopName.trim() && !shopCity.trim() && !shopWebsite.trim()) {
      found.shop = 'A shop needs a city or a website, so people can find it.'
    }
    return found
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Optional fields left blank come out as `undefined` and JSON.stringify drops them,
    // so a blank box sends no key at all rather than an empty string the API would have
    // to decide what to do with.
    onSubmit({
      name: name.trim(),
      tea_type: teaType,
      caffeine_level: caffeine,
      brand_id: optionalText(brandId),
      origin_country: optionalText(origin),
      description: optionalText(description),
      image_url: optionalText(imageUrl),
      brew_temp_c: optionalNumber(brewTemp),
      brew_seconds: optionalNumber(brewSeconds),
      grams_per_100ml: optionalNumber(grams),
      ingredients: picked.map((row) => ({
        ingredient_id: row.ingredient.id,
        percentage: optionalNumber(row.percentage),
        is_primary: row.isPrimary,
      })),
      // Sent alongside the tea, never as follow-up requests. The server creates them in
      // the same transaction, so a blend is never saved with half its recipe because the
      // browser managed three calls out of four.
      new_ingredients: proposed.map((row) => ({
        name: row.name,
        category: row.category,
        is_primary: row.isPrimary,
        // Not asked for. Somebody mid-recipe gets exactly one decision — what kind of
        // thing it is — and an admin sets the caffeine flag when they approve it. Asking
        // two questions per unknown ingredient is how a five-ingredient blend becomes a
        // form nobody finishes.
        is_caffeinated: false,
      })),
      new_shop: shopName.trim()
        ? {
            name: shopName.trim(),
            city: optionalText(shopCity),
            website: optionalText(shopWebsite),
          }
        : undefined,
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid={`${idPrefix}-form`} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-name`}
          label="Name"
          value={name}
          onChange={setName}
          error={errors.name}
        />
        <SelectField
          id={`${idPrefix}-brand`}
          label="Brand"
          value={brandId}
          onChange={setBrandId}
          options={brandOptions}
        />
        <SelectField
          id={`${idPrefix}-type`}
          label="Tea type"
          value={teaType}
          onChange={(value) => setTeaType(value as TeaType)}
          options={teaTypeOptions}
        />
        <SelectField
          id={`${idPrefix}-caffeine`}
          label="Caffeine"
          value={caffeine}
          onChange={(value) => setCaffeine(value as CaffeineLevel)}
          options={caffeineOptions}
        />
        <TextField
          id={`${idPrefix}-origin`}
          label="Origin country"
          value={origin}
          onChange={setOrigin}
          placeholder="China"
        />
        {!withUpload && (
          <TextField
            id={`${idPrefix}-image`}
            label="Image URL"
            type="url"
            value={imageUrl}
            onChange={setImageUrl}
          />
        )}
      </div>

      {withUpload && (
        <ImageUploadField
          id={`${idPrefix}-image`}
          label="Photo"
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? '')}
          hint={IMAGE_UPLOAD_HINT}
          previewAlt={name ? `Photo of ${name}` : 'The photo you chose'}
        />
      )}

      <TextAreaField
        id={`${idPrefix}-description`}
        label="Description"
        value={description}
        onChange={setDescription}
      />

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Brewing guidance
        </legend>
        <TextField
          id={`${idPrefix}-temp`}
          label="Water (°C)"
          type="number"
          min={40}
          max={100}
          value={brewTemp}
          onChange={setBrewTemp}
        />
        <TextField
          id={`${idPrefix}-seconds`}
          label="Steep (seconds)"
          type="number"
          min={5}
          value={brewSeconds}
          onChange={setBrewSeconds}
        />
        <TextField
          id={`${idPrefix}-grams`}
          label="Leaf (g / 100 ml)"
          type="number"
          step={0.1}
          value={grams}
          onChange={setGrams}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-brand-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Ingredients
        </legend>

        {picked.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Nothing added yet. Search below to add leaves, herbs and flowers.
          </p>
        ) : (
          <ul className="space-y-2" data-testid={`${idPrefix}-picked`}>
            {picked.map((row) => (
              <li
                key={row.ingredient.id}
                // Recessed rather than raised — see the note on `SpecRow` in
                // BrewingPanel: this row carries `neutral-400` secondary copy, which does
                // not clear AA on a `neutral-800` fill.
                className="flex flex-wrap items-center gap-3 border border-brand-200 bg-brand-50 p-2 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <span className="mr-auto text-sm font-medium text-brand-900 dark:text-brand-100">
                  {row.ingredient.name}
                  <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
                    {INGREDIENT_CATEGORY_LABELS[row.ingredient.category]}
                  </span>
                </span>
                <div className="w-24">
                  <TextField
                    id={`${idPrefix}-percentage-${row.ingredient.id}`}
                    label={`${row.ingredient.name} percentage`}
                    labelHidden
                    type="number"
                    min={1}
                    max={100}
                    placeholder="%"
                    value={row.percentage}
                    onChange={(value) => updateRow(row.ingredient.id, { percentage: value })}
                  />
                </div>
                <CheckboxField
                  id={`${idPrefix}-primary-${row.ingredient.id}`}
                  label="Primary"
                  ariaLabel={`Primary — ${row.ingredient.name}`}
                  checked={row.isPrimary}
                  onChange={(checked) => updateRow(row.ingredient.id, { isPrimary: checked })}
                />
                <Button
                  variant="danger"
                  ariaLabel={`Remove ${row.ingredient.name}`}
                  onClick={() => remove(row.ingredient.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {proposed.length > 0 && (
          <ul className="mb-3 space-y-2" data-testid={`${idPrefix}-proposed`}>
            {proposed.map((row, index) => (
              <li
                key={`${row.name}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              >
                <span className="font-medium text-brand-900 dark:text-brand-100">{row.name}</span>
                <PendingBadge />
                {/* The category is asked for *here* rather than in a dialog at the point
                    of adding: somebody who has just typed "yuzu peel" knows what it is,
                    and one select beside the name is cheaper than interrupting them. */}
                <label className="sr-only" htmlFor={`${idPrefix}-proposed-${index}-category`}>
                  Category for {row.name}
                </label>
                <select
                  id={`${idPrefix}-proposed-${index}-category`}
                  value={row.category}
                  onChange={(event) =>
                    setProposed((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, category: event.target.value as IngredientCategory }
                          : r,
                      ),
                    )
                  }
                  className="rounded-lg border control-edge bg-brand-50 px-2 py-1 text-sm text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
                >
                  {INGREDIENT_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {INGREDIENT_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
                <span className="ml-auto">
                  <Button
                    variant="ghost"
                    ariaLabel={`Remove ${row.name}`}
                    onClick={() => setProposed((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {errors.ingredients && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.ingredients}</p>
        )}

        <TextField
          id={`${idPrefix}-ingredient-search`}
          label="Search ingredients"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="jasmine, bergamot, ginger…"
        />

        {matches.isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : suggestions.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            {debouncedSearch ? (
              <>
                <p>No ingredient matches “{debouncedSearch}”.</p>
                {/* The button that used to be a sentence telling somebody to go and find
                    an admin. Adding it here keeps the recipe they were in the middle of
                    writing; it arrives marked and an admin sorts it out later. */}
                <div className="mt-2">
                  <Button
                    testId={`${idPrefix}-propose-ingredient`}
                    onClick={() => {
                      setProposed((rows) => [
                        ...rows,
                        {
                          name: debouncedSearch.trim(),
                          category: 'other',
                          isPrimary: picked.length === 0 && rows.length === 0,
                        },
                      ])
                      setSearch('')
                    }}
                  >
                    Add “{debouncedSearch}” as a new ingredient
                  </Button>
                </div>
              </>
            ) : (
              <p>No ingredients in the catalog yet.</p>
            )}
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid={`${idPrefix}-suggestions`}>
            {suggestions.map((ingredient) => (
              <li key={ingredient.id} className="flex items-center gap-2">
                <Button ariaLabel={`Add ${ingredient.name}`} onClick={() => add(ingredient)}>
                  {ingredient.name}
                  <Badge tone="neutral">{INGREDIENT_CATEGORY_LABELS[ingredient.category]}</Badge>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {error && <FormError testId={`${idPrefix}-error`}>{error}</FormError>}


      {/* Where you bought it, if the catalog does not know the shop yet.

          Optional, collapsed into three fields, and it creates a listing for this tea as
          well as the shop — "this shop exists" without "it sells this" drops the half
          that answers the question the tea's page asks. */}
      {withShop && (
        <fieldset className="space-y-3 border-t border-brand-100 pt-5 dark:border-neutral-800">
          <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Bought it somewhere the catalog does not have? (optional)
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id={`${idPrefix}-shop-name`}
              label="Shop name"
              value={shopName}
              onChange={setShopName}
              placeholder="Czajnik na Rogu"
              error={errors.shop}
            />
            <TextField
              id={`${idPrefix}-shop-city`}
              label="City"
              value={shopCity}
              onChange={setShopCity}
              placeholder="Gdańsk"
            />
            <TextField
              id={`${idPrefix}-shop-website`}
              label="Website"
              value={shopWebsite}
              onChange={setShopWebsite}
              placeholder="https://…"
            />
          </div>
        </fieldset>
      )}

      <SubmitButton pending={pending}>{pending ? pendingLabel : submitLabel}</SubmitButton>
    </form>
  )
}

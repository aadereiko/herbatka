import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../../components/ui/button'
import {
  CheckboxField,
  FormError,
  FormNote,
  SelectField,
  SubmitButton,
  TextField,
} from '../../components/ui/form'
import {
  Badge,
  EmptyState,
  ErrorNote,
  LoadingGrid,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  PendingBadge,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { IngredientCategory, IngredientInput } from '../../lib/catalog'
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS } from '../../lib/catalog'
import { useDebouncedParam } from '../../lib/debounce'
import { useAuth } from '../auth/auth-context'
import type { IngredientFilters } from './filters'
import {
  hasIngredientFilters,
  ingredientQueryParams,
  readIngredientFilters,
  writeIngredientFilters,
} from './filters'
import { IngredientCredit } from './IngredientCredit'
import { IngredientImage } from './IngredientImage'
import { IngredientTasteControl } from './IngredientTasteControl'
import { pluralise } from './format'
import { useIngredientList, useSuggestIngredient } from './queries'

const categoryOptions = [
  { value: '', label: 'Every category' },
  ...INGREDIENT_CATEGORIES.map((value) => ({
    value,
    label: INGREDIENT_CATEGORY_LABELS[value],
  })),
]

/** The public vocabulary list. Same URL-is-the-state approach as /teas — see
 *  `filters.ts` — just with one filter instead of four. */
/**
 * Three fields, and no more.
 *
 * `IngredientCreate` also accepts a description and a picture, and this form asks for
 * neither. Somebody suggesting a word is usually halfway through describing a blend and
 * has stopped to fill a gap; asking them to also write a tasting note and find a
 * photograph is how you get an abandoned form instead of a suggestion. An admin fills the
 * rest in when they approve it.
 */
function SuggestIngredientForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean
  error: string | null
  onSubmit: (input: IngredientInput) => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<IngredientCategory>('other')
  const [caffeinated, setCaffeinated] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>(undefined)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameError('An ingredient needs a name.')
      return
    }
    setNameError(undefined)
    onSubmit({ name: trimmed, category, is_caffeinated: caffeinated })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4" data-testid="suggest-ingredient-form">
      {error && <FormError>{error}</FormError>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="new-ingredient-name"
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Yuzu peel"
          error={nameError}
        />
        <SelectField
          id="new-ingredient-category"
          label="Category"
          value={category}
          onChange={(value) => setCategory(value as IngredientCategory)}
          options={INGREDIENT_CATEGORIES.map((value) => ({
            value,
            label: INGREDIENT_CATEGORY_LABELS[value],
          }))}
        />
      </div>
      <CheckboxField
        id="new-ingredient-caffeinated"
        label="Contains caffeine"
        checked={caffeinated}
        onChange={setCaffeinated}
      />
      <SubmitButton pending={pending}>{pending ? 'Sending…' : 'Suggest it'}</SubmitButton>
    </form>
  )
}

export function IngredientListPage() {
  const { user } = useAuth()
  const [suggesting, setSuggesting] = useState(false)
  // Bumped after a successful submit: remounting the form is the cheapest correct reset.
  const [formKey, setFormKey] = useState(0)
  const suggest = useSuggestIngredient()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readIngredientFilters(searchParams)

  function commit(patch: Partial<IngredientFilters>, replace = false) {
    setSearchParams(
      (prev) => writeIngredientFilters({ ...readIngredientFilters(prev), page: 1, ...patch }),
      { replace },
    )
  }

  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))
  const ingredients = useIngredientList(ingredientQueryParams(filters))

  const items = ingredients.data?.items ?? []
  const filtered = hasIngredientFilters(filters)

  function clearFilters() {
    setDraftQuery('')
    setSearchParams(new URLSearchParams())
  }

  return (
    <PageShell>
      <PageHeading
        title="Ingredients"
        subtitle="The shared vocabulary every tea is described with. Anybody can add to it."
        actions={
          user && (
            <Button
              variant={suggesting ? 'ghost' : 'primary'}
              testId="toggle-suggest-ingredient"
              onClick={() => setSuggesting((open) => !open)}
            >
              {suggesting ? 'Cancel' : 'Suggest an ingredient'}
            </Button>
          )
        }
      />

      {user && suggesting && (
        <Panel className="mb-6" ariaLabel="Suggest an ingredient">
          <h2 className="mb-1 text-lg font-semibold text-brand-900 dark:text-brand-100">
            Suggest an ingredient
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            It joins the list straight away, marked until an admin has looked it over.
          </p>
          {suggest.isSuccess && (
            <div className="mb-4">
              <FormNote testId="suggest-ingredient-success">
                Thanks — “{suggest.data.name}” is in the list, awaiting review.
              </FormNote>
            </div>
          )}
          <SuggestIngredientForm
            key={formKey}
            pending={suggest.isPending}
            error={suggest.isError ? describeApiError(suggest.error) : null}
            onSubmit={(input) =>
              suggest.mutate(input, { onSuccess: () => setFormKey((key) => key + 1) })
            }
          />
        </Panel>
      )}

      <Panel className="mb-6" ariaLabel="Filters">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="ingredient-search"
            label="Search ingredients"
            type="search"
            value={draftQuery}
            onChange={setDraftQuery}
            placeholder="mint, bergamot, cardamom…"
          />
          <SelectField
            id="ingredient-category"
            label="Category"
            value={filters.category ?? ''}
            onChange={(value) => commit({ category: (value || null) as IngredientCategory | null })}
            options={categoryOptions}
          />
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          aria-live="polite"
          data-testid="ingredient-count"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {ingredients.isPending
            ? 'Searching…'
            : pluralise(ingredients.data?.total ?? 0, 'ingredient')}
        </p>
        {filtered && (
          <Button variant="ghost" testId="clear-ingredient-filters" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {ingredients.isError && (
        <ErrorNote testId="ingredient-list-error">{describeApiError(ingredients.error)}</ErrorNote>
      )}

      {ingredients.isPending && (
        <LoadingGrid label="Loading ingredients…" testId="ingredient-list-loading" count={6} />
      )}

      {!ingredients.isPending && !ingredients.isError && items.length === 0 && (
        filtered ? (
          <EmptyState title="No ingredients match that" testId="ingredient-list-no-results">
            <p>Try a shorter search, or a different category.</p>
            <Button onClick={clearFilters}>Clear filters</Button>
          </EmptyState>
        ) : (
          <EmptyState title="No ingredients yet" testId="ingredient-list-empty">
            <p>An admin has not added any ingredients to the vocabulary yet.</p>
          </EmptyState>
        )
      )}

      {items.length > 0 && (
        <ul
          data-testid="ingredient-list"
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
            ingredients.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {items.map((ingredient) => (
            // `flex-col` so the description can take the slack: cards in a row are the
            // height of the tallest, and without it a two-word description leaves the
            // rating control floating in the middle of an otherwise empty card.
            <Panel as="li" key={ingredient.id} className="flex list-none flex-col">
              <div className="flex items-start gap-3">
                {/* Square and small. A picture of dried lavender is not the point of the
                    card — the sentence underneath is — and a banner-width image would
                    push that sentence below the fold on a phone. */}
                <IngredientImage
                  src={ingredient.image_url}
                  alt=""
                  category={ingredient.category}
                  className="h-16 w-16 shrink-0 rounded-xl"
                  testId={`ingredient-image-${ingredient.slug}`}
                />
                {/* `min-w-0` so a long name wraps instead of shouldering the badges out
                    of the card — the same failure the taste control had. */}
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-brand-900 dark:text-brand-100">
                    {ingredient.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{INGREDIENT_CATEGORY_LABELS[ingredient.category]}</Badge>
                    {ingredient.is_caffeinated && <Badge tone="amber">Caffeinated</Badge>}
                    {!ingredient.is_approved && <PendingBadge />}
                  </div>
                </div>
              </div>

              {/* Always rendered, and in near-body colour rather than the muted grey it
                  used to wear. This is the answer to "would I like a tea with this in
                  it?", which is the question the page exists to answer; hiding it when
                  absent made the page look like a list of labels and hid the fact that
                  anything was missing at all. An ingredient nobody has written up says so
                  — quietly, but it says so. */}
              <p
                data-testid={`ingredient-description-${ingredient.slug}`}
                className={`mt-3 flex-1 text-sm ${
                  ingredient.description
                    ? 'text-neutral-700 dark:text-neutral-300'
                    : 'italic text-neutral-400 dark:text-neutral-500'
                }`}
              >
                {ingredient.description ?? 'No description yet.'}
              </p>

              {/* Below the description rather than up in the badge row: the badges say
                  what the ingredient *is*, which is the same for everybody, and this says
                  what you think of it, which is not. The caption goes *into* the control
                  rather than beside it — a card is a third of a row wide, and three
                  fixed-width pieces on one line do not fit in it. */}
              <div className="mt-3 border-t border-brand-100 pt-3 dark:border-neutral-800">
                <IngredientTasteControl
                  ingredient={ingredient}
                  idPrefix="list"
                  label="How much you like it"
                />
              </div>

              {/* Last line of the card, below the control rather than beside the picture.
                  The slot is sixty-four pixels square — a caption under it would wrap to
                  four lines — and the obligation is that the credit is on the page with
                  the photograph, not that it is touching it. Nothing at all for an
                  ingredient with no attribution, which is every admin upload and every
                  drawn placeholder, so cards do not grow an empty row. */}
              <IngredientCredit ingredient={ingredient} />
            </Panel>
          ))}
        </ul>
      )}

      <Pagination
        page={ingredients.data?.page ?? 1}
        pages={ingredients.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </PageShell>
  )
}

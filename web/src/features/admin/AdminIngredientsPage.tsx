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
  TextAreaField,
  TextField,
} from '../../components/ui/form'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Pagination,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import type { Ingredient, IngredientCategory, IngredientInput } from '../../lib/catalog'
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS } from '../../lib/catalog'
import { useDebouncedParam } from '../../lib/debounce'
import type { IngredientFilters } from '../catalog/filters'
import {
  hasIngredientFilters,
  ingredientQueryParams,
  readIngredientFilters,
  writeIngredientFilters,
} from '../catalog/filters'
import { useIngredientList } from '../catalog/queries'
import { useCreateIngredient, useDeleteIngredient, useUpdateIngredient } from './queries'

const categoryOptions = INGREDIENT_CATEGORIES.map((value) => ({
  value,
  label: INGREDIENT_CATEGORY_LABELS[value],
}))

const filterOptions = [{ value: '', label: 'Every category' }, ...categoryOptions]

/**
 * Create and edit share one form. The parent remounts it with a `key` when the edited
 * row changes, which resets every field without a single syncing effect — the state
 * belongs to "the thing being edited", so tying its lifetime to that is the honest model.
 */
function IngredientForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Ingredient | null
  pending: boolean
  error: string | null
  onSubmit: (input: IngredientInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<IngredientCategory>(initial?.category ?? 'herb')
  const [caffeinated, setCaffeinated] = useState(initial?.is_caffeinated ?? false)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [nameError, setNameError] = useState<string | undefined>(undefined)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setNameError('Give the ingredient a name.')
      return
    }
    setNameError(undefined)
    onSubmit({
      name: name.trim(),
      category,
      is_caffeinated: caffeinated,
      description: description.trim() || undefined,
    })
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      data-testid="ingredient-form"
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="ingredient-name"
          label="Name"
          value={name}
          onChange={setName}
          error={nameError}
        />
        <SelectField
          id="ingredient-form-category"
          label="Category"
          value={category}
          onChange={(value) => setCategory(value as IngredientCategory)}
          options={categoryOptions}
        />
      </div>
      <CheckboxField
        id="ingredient-caffeinated"
        label="Contains caffeine"
        checked={caffeinated}
        onChange={setCaffeinated}
      />
      <TextAreaField
        id="ingredient-description"
        label="Description"
        value={description}
        onChange={setDescription}
        rows={2}
      />
      {error && <FormError testId="ingredient-form-error">{error}</FormError>}
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={pending}>
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Add ingredient'}
          </SubmitButton>
        </div>
        {initial && (
          <Button variant="ghost" onClick={onCancel} testId="cancel-edit">
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export function AdminIngredientsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readIngredientFilters(searchParams)

  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const list = useIngredientList(ingredientQueryParams(filters))
  const create = useCreateIngredient()
  const update = useUpdateIngredient()
  const remove = useDeleteIngredient()

  function commit(patch: Partial<IngredientFilters>, replace = false) {
    setSearchParams(
      (prev) => writeIngredientFilters({ ...readIngredientFilters(prev), page: 1, ...patch }),
      { replace },
    )
  }

  const [draftQuery, setDraftQuery] = useDebouncedParam(filters.q, (q) => commit({ q }, true))

  const items = list.data?.items ?? []
  const saving = create.isPending || update.isPending
  const saveError = create.isError
    ? describeApiError(create.error)
    : update.isError
      ? describeApiError(update.error)
      : null

  function handleSave(input: IngredientInput) {
    setNotice(null)
    if (editing) {
      update.mutate(
        { id: editing.id, patch: input },
        {
          onSuccess: () => {
            setEditing(null)
            setNotice(`Saved “${input.name}”.`)
          },
        },
      )
      return
    }
    create.mutate(input, { onSuccess: () => setNotice(`Added “${input.name}”.`) })
  }

  function handleDelete(ingredient: Ingredient) {
    setNotice(null)
    setRowError(null)
    remove.mutate(ingredient.id, {
      onSuccess: () => {
        setConfirming(null)
        if (editing?.id === ingredient.id) setEditing(null)
        setNotice(`Deleted “${ingredient.name}”.`)
      },
      // A 409 here means a tea still lists this ingredient, and the server's sentence
      // says which. Showing "Something went wrong" over the top of that would throw away
      // the only part of the response worth reading.
      onError: (error) => {
        setConfirming(null)
        setRowError({ id: ingredient.id, message: describeApiError(error) })
      },
    })
  }

  return (
    <PageShell>
      <PageHeading
        title="Ingredients"
        subtitle="The vocabulary every tea is described with. Renaming one updates it everywhere."
      />

      <Panel className="mb-6" ariaLabel={editing ? 'Edit ingredient' : 'Add an ingredient'}>
        <h2 className="mb-4 text-lg font-semibold text-brand-900 dark:text-brand-100">
          {editing ? `Edit “${editing.name}”` : 'Add an ingredient'}
        </h2>
        <IngredientForm
          key={editing?.id ?? 'new'}
          initial={editing}
          pending={saving}
          error={saveError}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
        />
      </Panel>

      {notice && (
        <div className="mb-4">
          <FormNote testId="ingredient-notice">{notice}</FormNote>
        </div>
      )}

      <Panel className="mb-4" ariaLabel="Filters">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="admin-ingredient-search"
            label="Search ingredients"
            type="search"
            value={draftQuery}
            onChange={setDraftQuery}
          />
          <SelectField
            id="admin-ingredient-category"
            label="Filter by category"
            value={filters.category ?? ''}
            onChange={(value) => commit({ category: (value || null) as IngredientCategory | null })}
            options={filterOptions}
          />
        </div>
      </Panel>

      {list.isError && (
        <ErrorNote testId="admin-ingredient-error">{describeApiError(list.error)}</ErrorNote>
      )}

      {list.isPending && (
        <div role="status" aria-live="polite" data-testid="admin-ingredients-loading">
          <span className="sr-only">Loading ingredients…</span>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      )}

      {!list.isPending && !list.isError && items.length === 0 && (
        hasIngredientFilters(filters) ? (
          <EmptyState title="No ingredients match that" testId="admin-ingredients-no-results">
            <p>Nothing here with that name or category.</p>
          </EmptyState>
        ) : (
          <EmptyState title="The vocabulary is empty" testId="admin-ingredients-empty">
            <p>Add the first ingredient with the form above.</p>
          </EmptyState>
        )
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-left text-sm" data-testid="ingredient-table">
            <caption className="sr-only">Ingredients in the shared vocabulary</caption>
            <thead className="border-b border-brand-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Name
                </th>
                <th scope="col" className="px-4 py-2">
                  Category
                </th>
                <th scope="col" className="px-4 py-2">
                  Description
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((ingredient) => (
                <tr
                  key={ingredient.id}
                  className="border-b border-brand-100 last:border-0 dark:border-neutral-800"
                >
                  <td className="px-4 py-2 align-top">
                    <span className="font-medium text-brand-900 dark:text-brand-100">
                      {ingredient.name}
                    </span>
                    {ingredient.is_caffeinated && (
                      <span className="ml-2">
                        <Badge tone="amber">Caffeinated</Badge>
                      </span>
                    )}
                    {rowError?.id === ingredient.id && (
                      <p
                        role="alert"
                        data-testid={`ingredient-error-${ingredient.id}`}
                        className="mt-1 text-xs text-rose-600 dark:text-rose-400"
                      >
                        {rowError.message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-neutral-600 dark:text-neutral-400">
                    {INGREDIENT_CATEGORY_LABELS[ingredient.category]}
                  </td>
                  <td className="max-w-xs px-4 py-2 align-top text-neutral-600 dark:text-neutral-400">
                    {ingredient.description ?? '—'}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex justify-end gap-2">
                      {confirming === ingredient.id ? (
                        <>
                          {/* An inline two-step rather than window.confirm: it is
                              styleable, testable, and does not block the tab. */}
                          <Button
                            variant="danger"
                            testId={`confirm-delete-${ingredient.id}`}
                            disabled={remove.isPending}
                            onClick={() => handleDelete(ingredient)}
                          >
                            Really delete
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            ariaLabel={`Edit ${ingredient.name}`}
                            testId={`edit-${ingredient.id}`}
                            onClick={() => {
                              setRowError(null)
                              setNotice(null)
                              setEditing(ingredient)
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            ariaLabel={`Delete ${ingredient.name}`}
                            testId={`delete-${ingredient.id}`}
                            onClick={() => {
                              setRowError(null)
                              setConfirming(ingredient.id)
                            }}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={list.data?.page ?? 1}
        pages={list.data?.pages ?? 1}
        onPageChange={(page) => commit({ page })}
      />
    </PageShell>
  )
}

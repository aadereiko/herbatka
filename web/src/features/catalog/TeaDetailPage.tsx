import { Link, useParams } from 'react-router'

import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeading,
  PageShell,
  Panel,
  Skeleton,
} from '../../components/ui/page'
import { ApiError, describeApiError } from '../../lib/api'
import type { TeaIngredient } from '../../lib/catalog'
import { CAFFEINE_LEVEL_LABELS, INGREDIENT_CATEGORY_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'
import { formatBrewTime } from './format'
import { useTeaDetail } from './queries'

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-neutral-800">
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-brand-900 dark:text-brand-100">{value}</dd>
    </div>
  )
}

function IngredientRow({ entry }: { entry: TeaIngredient }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-brand-100 py-2 last:border-0 dark:border-neutral-800">
      <Link
        to={`/teas?ingredient=${encodeURIComponent(entry.ingredient.slug)}`}
        className="font-medium text-brand-800 underline-offset-2 hover:underline dark:text-brand-200"
      >
        {entry.ingredient.name}
      </Link>
      <Badge tone="neutral">{INGREDIENT_CATEGORY_LABELS[entry.ingredient.category]}</Badge>
      {entry.is_primary && <Badge tone="brand">Primary</Badge>}
      {entry.ingredient.is_caffeinated && <Badge tone="amber">Caffeinated</Badge>}
      {entry.percentage !== null && (
        <span className="ml-auto text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
          {entry.percentage}%
        </span>
      )}
    </li>
  )
}

export function TeaDetailPage() {
  const { slug = '' } = useParams()
  const { data: tea, isPending, isError, error } = useTeaDetail(slug)

  if (isPending) {
    return (
      <PageShell>
        <div role="status" aria-live="polite" data-testid="tea-detail-loading" className="space-y-4">
          <span className="sr-only">Loading tea…</span>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </PageShell>
    )
  }

  if (isError) {
    // A 404 here is an ordinary outcome, not a failure: the catalog hides unapproved
    // teas, so a stale link and a typo look the same from the outside.
    const missing = error instanceof ApiError && error.status === 404
    return (
      <PageShell>
        {missing ? (
          <EmptyState title="We could not find that tea" testId="tea-detail-missing">
            <p>It may have been removed, or it may still be waiting for review.</p>
            <Link to="/teas" className="font-medium text-brand-700 dark:text-brand-300">
              Back to all teas
            </Link>
          </EmptyState>
        ) : (
          <ErrorNote testId="tea-detail-error">{describeApiError(error)}</ErrorNote>
        )}
      </PageShell>
    )
  }

  const hasBrewing =
    tea.brew_temp_c !== null || tea.brew_seconds !== null || tea.grams_per_100ml !== null

  return (
    <PageShell>
      <PageHeading
        title={tea.name}
        subtitle={tea.brand ? tea.brand.name : 'Unbranded'}
        actions={
          <Link
            to="/teas"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            ← All teas
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Panel ariaLabel="About this tea">
            <div className="flex flex-wrap gap-2">
              <Link to={`/teas?type=${tea.tea_type}`}>
                <Badge tone="brand">{TEA_TYPE_LABELS[tea.tea_type]}</Badge>
              </Link>
              <Badge tone={tea.caffeine_level === 'none' ? 'neutral' : 'amber'}>
                {CAFFEINE_LEVEL_LABELS[tea.caffeine_level]}
              </Badge>
              {tea.origin_country && <Badge tone="neutral">{tea.origin_country}</Badge>}
              {tea.brand && (
                <Link to={`/teas?brand=${encodeURIComponent(tea.brand.slug)}`}>
                  <Badge tone="neutral">More from {tea.brand.name}</Badge>
                </Link>
              )}
            </div>

            {tea.image_url && (
              <img
                src={tea.image_url}
                alt={tea.name}
                className="mt-4 max-h-72 w-full rounded-xl object-cover"
              />
            )}

            <p
              data-testid="tea-description"
              className="mt-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
            >
              {tea.description ?? 'No description yet.'}
            </p>
          </Panel>

          <Panel ariaLabel="Ingredients">
            <h2 className="mb-2 text-lg font-semibold text-brand-900 dark:text-brand-100">
              Ingredients
            </h2>
            {tea.ingredients.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Nobody has recorded what is in this one yet.
              </p>
            ) : (
              <ul data-testid="tea-ingredients">
                {tea.ingredients.map((entry) => (
                  <IngredientRow key={entry.ingredient.id} entry={entry} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {hasBrewing && (
          <Panel ariaLabel="How to brew it" className="h-fit">
            <h2 className="mb-3 text-lg font-semibold text-brand-900 dark:text-brand-100">
              How to brew it
            </h2>
            <dl className="grid grid-cols-3 gap-2 lg:grid-cols-1" data-testid="tea-brewing">
              {tea.brew_temp_c !== null && (
                <SpecRow label="Water" value={`${tea.brew_temp_c}°C`} />
              )}
              {tea.brew_seconds !== null && (
                <SpecRow label="Steep" value={formatBrewTime(tea.brew_seconds)} />
              )}
              {tea.grams_per_100ml !== null && (
                <SpecRow label="Leaf" value={`${tea.grams_per_100ml} g / 100 ml`} />
              )}
            </dl>
          </Panel>
        )}
      </div>
    </PageShell>
  )
}

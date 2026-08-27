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
import { FavouriteStar } from '../favourite/FavouriteStar'
import { TeaReviewsPanel } from '../review/TeaReviewsPanel'
import { WhereToBuyPanel } from '../shop/WhereToBuyPanel'
import { BrewingPanel } from './BrewingPanel'
import { IngredientTasteControl } from './IngredientTasteControl'
import { useTeaDetail } from './queries'

/**
 * The row where an ingredient rating actually earns its place. A blend lists five things,
 * and knowing that one of them is the clove you rated 2 explains a tea you keep not
 * reaching for better than its own average score does — so the control is here, at the
 * moment you notice, rather than only over on /ingredients.
 */
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
        <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
          {entry.percentage}%
        </span>
      )}
      <span className="ml-auto">
        <IngredientTasteControl ingredient={entry.ingredient} idPrefix="tea" />
      </span>
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

  return (
    <PageShell>
      <PageHeading
        title={tea.name}
        subtitle={tea.brand ? tea.brand.name : 'Unbranded'}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Next to the title rather than down beside the reviews: starring is about
                the tea as a whole, and it is the one thing on this page somebody comes
                back to do in two seconds without reading anything. */}
            <FavouriteStar
              kind="tea"
              slug={tea.slug}
              name={tea.name}
              isFavourite={tea.is_favourite}
              size="md"
            />
            <Link
              to="/teas"
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              ← All teas
            </Link>
          </div>
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

          {/* Between what the tea *is* and what it is like. Somebody who has read the
              ingredients and decided they want it should not have to scroll past a
              hundred reviews to find out where it is sold — and somebody reading the
              reviews to make up their mind has not got to that question yet.

              The panel renders nothing at all when no shop carries this tea, rather than
              an empty box; see `WhereToBuyPanel`. */}
          <WhereToBuyPanel teaSlug={tea.slug} teaName={tea.name} />

          {/* What it is like is the reason to come back to this page a second time. */}
          <TeaReviewsPanel tea={tea} />
        </div>

        {/* The catalog's numbers, and yours over the top of them where you have any.
            The panel decides for itself whether there is anything to show — see
            `BrewingPanel`, which is also where the "signed out means no form" rule
            lives. */}
        <BrewingPanel tea={tea} />
      </div>
    </PageShell>
  )
}

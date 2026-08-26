import { Link } from 'react-router'

import { Badge } from '../../components/ui/page'
import type { TeaSummary } from '../../lib/catalog'
import { CAFFEINE_LEVEL_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'

/** One tea in the browse grid. The whole card is the link — a tap target the size of a
 *  card rather than the size of a word, because this list is read on a phone. */
export function TeaCard({ tea }: { tea: TeaSummary }) {
  return (
    <li className="list-none">
      <Link
        to={`/teas/${tea.slug}`}
        data-testid="tea-card"
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {tea.image_url ? (
          <img
            src={tea.image_url}
            alt=""
            className="h-32 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            className="grid h-32 w-full place-items-center bg-brand-100 text-4xl dark:bg-neutral-800"
          >
            🍃
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">
              {tea.name}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {tea.brand ? tea.brand.name : 'Unbranded'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{TEA_TYPE_LABELS[tea.tea_type]}</Badge>
            <Badge tone={tea.caffeine_level === 'none' ? 'neutral' : 'amber'}>
              {CAFFEINE_LEVEL_LABELS[tea.caffeine_level]}
            </Badge>
            {!tea.is_approved && <Badge tone="rose">Awaiting review</Badge>}
          </div>

          {tea.primary_ingredients.length > 0 && (
            <p className="mt-auto text-xs text-neutral-500 dark:text-neutral-400">
              {tea.primary_ingredients.join(' · ')}
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}

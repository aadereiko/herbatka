import type { ReactNode } from 'react'

import { Badge, SectionLabel } from '../../components/ui/page'
import { formatBrewTime } from '../../features/catalog/format'
import { CAFFEINE_LEVEL_LABELS, TEA_TYPE_LABELS } from '../../lib/catalog'
import type { DraftField, TeaDraft } from './draft'

/**
 * "What would this have prefilled?" — with, for every field, the sentence explaining it.
 *
 * The reasons are the panel, not a footnote on it. A blank box is ambiguous in the worst
 * possible way: it could mean the tin does not say, or that OCR missed it, or that the
 * number it read was nonsense and got thrown away — and those three call for completely
 * different fixes. So a filled field shows where its value came from and a blank one shows
 * what stopped it, at the same weight, in the same place.
 *
 * `TeaCreate`'s field names are printed alongside the human labels on purpose. This panel
 * is read next to `api/app/schemas/catalog.py`, and a row that says "Water" when the
 * schema says `brew_temp_c` makes the reader do the translation every time.
 */

/** Generic in the field's own type, so each call site's `render` gets the real value type
 *  rather than a cast — `TEA_TYPE_LABELS[value]` type-checks because `value` is known to
 *  be a `TeaType` and not an `unknown` somebody promised was one. */
function Row<T>({
  label,
  wire,
  field,
  render,
}: {
  label: string
  /** The name the API actually uses. */
  wire: string
  field: DraftField<T>
  render: (value: T) => ReactNode
}) {
  return (
    <div className="border-b border-brand-200/60 py-3 last:border-0 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}{' '}
          <code className="text-xs font-normal text-neutral-500 dark:text-neutral-500">{wire}</code>
        </span>
        {/* The null test is inline rather than hoisted into a `filled` boolean, so the
            narrowing reaches `render` — a separate flag loses it. */}
        {field.value !== null ? (
          <span
            data-testid={`draft-${wire}`}
            className="text-sm font-semibold text-brand-900 dark:text-brand-100"
          >
            {render(field.value)}
          </span>
        ) : (
          <span data-testid={`draft-${wire}`}>
            <Badge tone="rose">left blank</Badge>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{field.why}</p>
    </div>
  )
}

export function DraftPanel({ draft }: { draft: TeaDraft }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel as="h3">The fields</SectionLabel>
        <div>
          <Row label="Name" wire="name" field={draft.name} render={(value) => value} />
          <Row
            label="Type"
            wire="tea_type"
            field={draft.teaType}
            render={(value) => TEA_TYPE_LABELS[value]}
          />
          <Row
            label="Caffeine"
            wire="caffeine_level"
            field={draft.caffeineLevel}
            render={(value) => CAFFEINE_LEVEL_LABELS[value]}
          />
          <Row
            label="Brand"
            wire="brand_id"
            field={draft.brand}
            render={(value) => value.name}
          />
          <Row
            label="Water"
            wire="brew_temp_c"
            field={draft.brewTempC}
            render={(value) => `${value} °C`}
          />
          <Row
            label="Steep"
            wire="brew_seconds"
            field={draft.brewSeconds}
            // The catalog's own formatter, so a draft reads the way the tea page it would
            // become reads: "3 min 30 s", not "210".
            render={(value) => formatBrewTime(value)}
          />
          <Row
            label="Dose"
            wire="grams_per_100ml"
            field={draft.gramsPer100ml}
            render={(value) => `${value} g / 100 ml`}
          />
        </div>
      </div>

      <div>
        <SectionLabel as="h3">Ingredients</SectionLabel>
        <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-400">
          {draft.ingredientsWhy}
        </p>
        {draft.ingredients.length > 0 && (
          <ul className="space-y-2">
            {draft.ingredients.map((item) => (
              <li
                key={item.match.entry.id}
                className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-950"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                    {item.match.entry.name}
                  </span>
                  {item.percentage !== null && (
                    <span className="text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
                      {item.percentage}%
                    </span>
                  )}
                  {item.isPrimary && <Badge tone="brand">primary</Badge>}
                  {item.match.entry.isCaffeinated && <Badge tone="amber">caffeinated</Badge>}
                </div>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{item.why}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionLabel as="h3">The body it would POST</SectionLabel>
        <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-400">{draft.payloadWhy}</p>
        <pre
          data-testid="draft-payload"
          className="overflow-x-auto rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
        >
          {draft.payload === null ? '// nothing postable yet' : JSON.stringify(draft.payload, null, 2)}
        </pre>
      </div>
    </div>
  )
}

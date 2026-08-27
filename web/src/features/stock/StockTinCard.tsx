import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { Badge, Panel } from '../../components/ui/page'
import type { StockItem } from '../../lib/household'
import { TEA_TYPE_LABELS } from '../../lib/catalog'
import { formatDay, formatGrams } from './format'

/**
 * The amounts a cup actually takes: a light 2 g, a normal 5 g, a pot's worth of 8 g.
 * Three is the most that stays tappable in a row on a narrow phone, and the custom box
 * next to them covers everything else without turning this into a form.
 */
const BREW_PRESETS = [2, 5, 8] as const

export function StockTinCard({
  householdId,
  item,
  error,
  onBrew,
  onDismissError,
}: {
  householdId: string
  item: StockItem
  /** The server's own sentence from a refused brew — "only 3 g left" — shown against
   *  this tin and nowhere else. */
  error?: string
  onBrew: (grams: number) => void
  onDismissError: () => void
}) {
  const [custom, setCustom] = useState('')

  function brew(grams: number) {
    onDismissError()
    onBrew(grams)
  }

  function handleCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const grams = Number(custom.trim())
    if (!Number.isFinite(grams) || grams <= 0) return
    setCustom('')
    brew(grams)
  }

  return (
    <Panel
      as="li"
      testId="stock-tin"
      // The low-stock treatment is a coloured edge and a badge rather than colour alone:
      // "the pink one" is no use to anybody reading this in a dark kitchen, or at all.
      className={`list-none ${
        item.is_low ? 'border-l-4 border-l-rose-500 dark:border-l-rose-400' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-brand-900 dark:text-brand-100">
            <Link
              to={`/households/${householdId}/stock/${item.id}`}
              data-testid={`tin-link-${item.id}`}
              className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {item.tea.name}
            </Link>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{TEA_TYPE_LABELS[item.tea.tea_type]}</span>
            {item.location && <span>· {item.location}</span>}
            {/* Where it came from, when the tin was bought through a shop's listing
                rather than typed in by hand. Absent, not "—", for the ordinary case. */}
            {item.shop && (
              <span data-testid={`tin-shop-${item.id}`}>· from {item.shop.name}</span>
            )}
            {item.best_before && <span>· best before {formatDay(item.best_before)}</span>}
          </p>
        </div>

        <div className="text-right">
          {/* Deliberately the biggest thing on the card. The one question this screen
              answers from across the kitchen is "how much is left?". */}
          <p
            data-testid={`tin-grams-${item.id}`}
            className={`text-2xl font-semibold tabular-nums ${
              item.is_low
                ? 'text-rose-700 dark:text-rose-300'
                : 'text-brand-900 dark:text-brand-100'
            }`}
          >
            {formatGrams(item.quantity_grams)}
          </p>
          {item.is_low && (
            <span data-testid={`tin-low-${item.id}`}>
              <Badge tone="rose">Running low</Badge>
            </span>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          data-testid={`tin-error-${item.id}`}
          className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-brand-100 pt-3 dark:border-neutral-800">
        <span
          aria-hidden="true"
          className="self-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          Brew
        </span>
        {BREW_PRESETS.map((grams) => (
          <Button
            key={grams}
            variant="primary"
            size="lg"
            // `btn-primary` sets the reference's letterspaced caps, and these are the one
            // set of primary buttons in the app whose label is not a phrase but a
            // quantity: "5 g" upper-cased is "5 G", and G is giga. An arbitrary property
            // rather than `normal-case` because Tailwind emits those last, so it is the
            // one form guaranteed to win against the utility that set it.
            className="min-w-16 [text-transform:none]"
            testId={`brew-${item.id}-${grams}`}
            // The visible label is "5 g"; the accessible name has to say which tin, or a
            // screen-reader user hears "5 g" nine times down the shelf.
            ariaLabel={`Brew ${grams} g of ${item.tea.name}`}
            onClick={() => brew(grams)}
          >
            {grams} g
          </Button>
        ))}

        <form onSubmit={handleCustom} className="flex items-end gap-2">
          <div className="w-24">
            <TextField
              id={`brew-custom-${item.id}`}
              label={`Custom amount for ${item.tea.name}`}
              labelHidden
              type="number"
              min={0}
              step={0.1}
              value={custom}
              onChange={setCustom}
              placeholder="g"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            testId={`brew-custom-submit-${item.id}`}
            ariaLabel={`Brew a custom amount of ${item.tea.name}`}
            disabled={custom.trim() === ''}
          >
            Brew
          </Button>
        </form>
      </div>
    </Panel>
  )
}

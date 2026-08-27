import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import { FormError, SubmitButton, TextAreaField, TextField } from '../../components/ui/form'
import type { StockItemInput, TeaRef } from '../../lib/household'
import type { ShopRef } from '../../lib/shop'
import { ShopPicker } from './ShopPicker'
import { TeaPicker } from './TeaPicker'

type FieldErrors = {
  tea?: string
  quantity?: string
  lowStock?: string
  price?: string
}

function optionalText(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/** `''` means "not given" and is not an error; anything else has to be a real
 *  non-negative number, because "abt 40" silently becoming NaN is worse than a refusal. */
function readOptionalGrams(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return { error: 'Use a number of grams, or leave it blank.' }
  return { value }
}

/**
 * Adding a tin to the shelf.
 *
 * The two fields that matter — which tea, and how much of it — are the only ones on
 * screen to begin with. Everything the contract also accepts (where it lives, what it
 * cost, when it should be drunk by) sits behind one disclosure, because the moment this
 * form is used is when the shopping is being unpacked, and a fourteen-field form gets
 * abandoned then.
 *
 * M8's "where did it come from?" obeys that rule rather than bending it. It is a genuinely
 * useful thing to record — the tin page already prints "Bought at X" for anything that
 * came through the buy flow, and a hand-typed tin had no way to say it — but it is not
 * one of the two questions that must be answered to put a tin on a shelf, so it goes
 * inside the disclosure with the price and the dates. It sits first in there because it
 * is the one optional field somebody actively goes looking for, and it is a search box
 * rather than a `<select>`: see `ShopPicker`.
 */
export function AddTinForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean
  error: string | null
  onSubmit: (input: StockItemInput) => void
}) {
  const [tea, setTea] = useState<TeaRef | null>(null)
  const [shop, setShop] = useState<ShopRef | null>(null)
  const [quantity, setQuantity] = useState('')
  const [lowStock, setLowStock] = useState('')
  const [location, setLocation] = useState('')
  const [openedAt, setOpenedAt] = useState('')
  const [bestBefore, setBestBefore] = useState('')
  const [purchasedAt, setPurchasedAt] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('')
  const [notes, setNotes] = useState('')
  const [more, setMore] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: FieldErrors = {}
    if (!tea) next.tea = 'Pick which tea this tin holds.'

    const grams = Number(quantity.trim())
    if (quantity.trim() === '' || !Number.isFinite(grams) || grams < 0) {
      next.quantity = 'How many grams are in it?'
    }

    const low = readOptionalGrams(lowStock)
    if (low.error) next.lowStock = low.error

    // The API stores minor units; the form asks for the number on the receipt. Doing the
    // ×100 here rather than asking anybody to type 1250 for £12.50.
    let priceMinor: number | undefined
    const rawPrice = price.trim()
    if (rawPrice !== '') {
      const major = Number(rawPrice)
      if (!Number.isFinite(major) || major < 0) next.price = 'Use a number, like 12.50.'
      else priceMinor = Math.round(major * 100)
    }

    setErrors(next)
    if (Object.keys(next).length > 0 || !tea) return

    onSubmit({
      tea_id: tea.id,
      quantity_grams: grams,
      low_stock_grams: low.value,
      location: optionalText(location),
      opened_at: optionalText(openedAt),
      best_before: optionalText(bestBefore),
      purchased_at: optionalText(purchasedAt),
      price_paid_minor: priceMinor,
      currency: optionalText(currency)?.toUpperCase(),
      notes: optionalText(notes),
      // `undefined` rather than `null` when nothing was picked, so `JSON.stringify` drops
      // the key entirely. A create that sends `shop_id: null` is asking the server to
      // record "definitely no shop", which is not the same statement as "I did not say" —
      // and every other optional field on this body already works that way.
      shop_id: shop?.id,
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid="add-tin-form" className="space-y-4">
      <TeaPicker idPrefix="add-tin" selected={tea} onSelect={setTea} error={errors.tea} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="add-tin-quantity"
          label="How much is in it?"
          type="number"
          min={0}
          step={0.1}
          value={quantity}
          onChange={setQuantity}
          error={errors.quantity}
          hint="Grams."
        />
        <TextField
          id="add-tin-low-stock"
          label="Warn me below"
          type="number"
          min={0}
          step={0.1}
          value={lowStock}
          onChange={setLowStock}
          error={errors.lowStock}
          hint="Grams. Leave blank for the default."
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        testId="toggle-tin-details"
        onClick={() => setMore((open) => !open)}
      >
        {more ? 'Fewer details' : 'More details'}
      </Button>

      {more && (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="add-tin-details">
          <div className="sm:col-span-2">
            <ShopPicker idPrefix="add-tin" selected={shop} onSelect={setShop} />
          </div>
          <TextField
            id="add-tin-location"
            label="Where is it kept?"
            value={location}
            onChange={setLocation}
            placeholder="kitchen shelf, top cupboard…"
          />
          <TextField
            id="add-tin-opened"
            label="Opened on"
            type="date"
            value={openedAt}
            onChange={setOpenedAt}
          />
          <TextField
            id="add-tin-best-before"
            label="Best before"
            type="date"
            value={bestBefore}
            onChange={setBestBefore}
          />
          <TextField
            id="add-tin-purchased"
            label="Bought on"
            type="date"
            value={purchasedAt}
            onChange={setPurchasedAt}
          />
          <TextField
            id="add-tin-price"
            label="Price paid"
            value={price}
            onChange={setPrice}
            error={errors.price}
            placeholder="12.50"
          />
          <TextField
            id="add-tin-currency"
            label="Currency"
            value={currency}
            onChange={setCurrency}
            placeholder="GBP"
          />
          <div className="sm:col-span-2">
            <TextAreaField
              id="add-tin-notes"
              label="Notes"
              value={notes}
              onChange={setNotes}
              rows={2}
            />
          </div>
        </div>
      )}

      {error && <FormError testId="add-tin-error">{error}</FormError>}

      <div className="sm:w-48">
        <SubmitButton pending={pending}>{pending ? 'Adding…' : 'Add to the shelf'}</SubmitButton>
      </div>
    </form>
  )
}

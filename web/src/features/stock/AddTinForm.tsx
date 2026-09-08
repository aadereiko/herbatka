import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button'
import { FormError, SubmitButton, TextAreaField, TextField } from '../../components/ui/form'
import type { NewShopInput, TeaInput } from '../../lib/catalog'
import type { StockItemInput, TeaRef } from '../../lib/household'
import type { ListingWithShop, ShopRef } from '../../lib/shop'
import { TeaForm } from '../catalog/TeaForm'
import { priceMajorInput } from '../shop/format'
import { ShopPicker } from './ShopPicker'
import { TeaPicker } from './TeaPicker'

type FieldErrors = {
  tea?: string
  shop?: string
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
 * Three questions are on screen: which tea, where it came from, and how much of it there
 * is. Everything else the contract accepts (where it lives, what it cost, when it should
 * be drunk by) sits behind one disclosure, because the moment this form is used is when
 * the shopping is being unpacked, and a fourteen-field form gets abandoned then.
 *
 * The shop used to be inside that disclosure, on the argument that only the tea and the
 * grams are needed to put a tin on a shelf. That argument was answered by somebody saying
 * the obvious thing out loud: *in a household, a tea comes from the shop, not from
 * itself*. A tin on a real shelf was carried in from somewhere, and burying that under
 * "More details" made it the field nobody ever filled in — which left the shelf unable to
 * answer "where do we get this again?", which is the question people actually put to it
 * when a tin runs out.
 *
 * Promoting it pays for itself twice over, because the catalog already knows which shops
 * sell which tea. Once a tea is picked, `ShopPicker` puts that tea's shops up as a
 * one-tap shortlist, and the listing behind the tap carries the pack size and the price.
 * See `applyListing` for what that fills in, and — more to the point — what it refuses to
 * touch.
 *
 * Neither picker is allowed to dead-end any more, and that is what `newTea` and `newShop`
 * are for. A tea the catalog has never heard of is written *here*, with the real
 * `TeaForm` — the same component the Teas page posts, so there is one tea form in the
 * app and not two that drift — and travels as `new_tea` on the tin. A shop nobody has
 * listed travels as `new_shop`. One POST creates all three, in one transaction, because
 * the alternative is a browser making three calls and managing two of them.
 *
 * The tea form *replaces* the tin's fields while it is open rather than nesting inside
 * them: a `<form>` inside a `<form>` is not valid HTML, and the version of this where the
 * inner submit button quietly submits the outer form is a bug nobody would enjoy finding.
 * Nothing is lost by the swap — every field on this screen is controlled by state that
 * lives up here, so it all comes back untouched.
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
  /** A tea written on the way past. Never set at the same time as `tea` — one tin, one
   *  tea — which is why both setters clear the other. */
  const [newTea, setNewTea] = useState<TeaInput | null>(null)
  /** The name typed into the picker, held while the tea form is open so it can arrive as
   *  the name; `null` means the form is shut. */
  const [composing, setComposing] = useState<string | null>(null)
  const [shop, setShop] = useState<ShopRef | null>(null)
  const [newShop, setNewShop] = useState<NewShopInput | null>(null)
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

  /**
   * What a tapped listing knows, poured into the fields that are still empty.
   *
   * "Still empty" is the whole rule, and it is not politeness. The listing is what the
   * shop advertises; the tin is what is actually in the cupboard, and the person typing
   * is the only one of the two who has seen it. Replacing a typed 80 with the shop's 50 g
   * pack is the app telling somebody they are wrong about their own tea, and it does it
   * silently, three fields away from where they are looking.
   *
   * `price` and `currency` are the awkward half, because they live inside the disclosure:
   * a prefill landing there is a number attached to the tin that nobody can see, review
   * or correct — and it is a claim about *money*, taken from a shop's published listing
   * rather than from the receipt in the bag. Two ways out of that, and this form opens
   * the disclosure rather than skipping the hidden fields, because the pack size and the
   * price are most of what a listing is worth and dropping two thirds of the help to
   * avoid one scroll is a bad trade. Filling them in and saying nothing was never an
   * option. The disclosure only springs open when there is genuinely something new in it
   * to look at: tap a listing whose shop publishes no price and nothing hidden changed,
   * so nothing opens.
   */
  function applyListing(listing: ListingWithShop) {
    let filledHidden = false

    if (quantity.trim() === '' && listing.pack_grams !== null) {
      setQuantity(String(listing.pack_grams))
    }
    if (price.trim() === '' && listing.price_minor !== null) {
      setPrice(priceMajorInput(listing.price_minor))
      filledHidden = true
    }
    if (currency.trim() === '' && listing.currency) {
      setCurrency(listing.currency)
      filledHidden = true
    }

    if (filledHidden) setMore(true)
  }

  function handleShop(picked: ShopRef | null, listing?: ListingWithShop) {
    setShop(picked)
    if (picked) setNewShop(null)
    if (listing) applyListing(listing)
  }

  function handleTea(picked: TeaRef | null) {
    setTea(picked)
    if (picked) setNewTea(null)
  }

  /** Open the tea form on a name, or throw the draft away. Both go through here so the
   *  two ways of naming a tea can never both be set. */
  function handleCompose(name: string | null) {
    if (name === null) {
      setNewTea(null)
      setComposing(null)
      return
    }
    setTea(null)
    setComposing(name)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: FieldErrors = {}
    if (!tea && !newTea) next.tea = 'Pick which tea this tin holds.'
    // Mirrors `NewShopIn.reachable_somehow` and the CHECK behind it, so the answer is a
    // message under the field rather than a 422 on the whole tin.
    if (newShop && !newShop.name.trim()) next.shop = 'Give the shop a name.'
    else if (newShop && !newShop.city?.trim() && !newShop.website?.trim()) {
      next.shop = 'A shop needs a city or a website, so people can find it.'
    }

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
    if (Object.keys(next).length > 0 || !(tea || newTea)) return

    onSubmit({
      // Exactly one of the two, which is what the server's own validator insists on.
      // `undefined` rather than `null` for the one that lost, so `JSON.stringify` drops
      // the key instead of sending "definitely no tea".
      tea_id: tea?.id,
      new_tea: newTea ?? undefined,
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
      new_shop: newShop
        ? {
            name: newShop.name.trim(),
            city: optionalText(newShop.city ?? ''),
            website: optionalText(newShop.website ?? ''),
          }
        : undefined,
    })
  }

  // The tea form, in place of the tin's own fields. Its `onSubmit` never reaches the
  // network — it hands the `TeaInput` back, which is exactly what this form needs to carry
  // on the tin. `pending={false}` for the same reason: nothing is in flight at this step.
  if (composing !== null) {
    return (
      <div className="space-y-4" data-testid="add-tin-new-tea">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            A tea the catalog does not have. The tin is still here, half-filled, underneath.
          </p>
          <Button variant="ghost" size="sm" testId="new-tea-cancel" onClick={() => setComposing(null)}>
            Back to the tin
          </Button>
        </div>
        <TeaForm
          idPrefix="add-tin-tea"
          submitLabel="Use this tea"
          pendingLabel="Use this tea"
          pending={false}
          initialName={composing}
          withShop={false}
          onSubmit={(input) => {
            setNewTea(input)
            setComposing(null)
          }}
        />
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit} data-testid="add-tin-form" className="space-y-4">
      <TeaPicker
        idPrefix="add-tin"
        selected={tea}
        draft={newTea}
        onSelect={handleTea}
        onCompose={handleCompose}
        error={errors.tea}
      />

      {/* `tea?.slug ?? null` rather than a guard around the whole control: the shop is a
          question worth asking before the tea has been settled — plenty of people know
          they were in Kruka before they can remember what the tin is called — and it is
          only the shortlist that needs a tea to have something to say. A drafted tea has
          no slug either, and nothing to shortlist: a tea the catalog has never seen has no
          shops listed against it, by definition. */}
      <ShopPicker
        idPrefix="add-tin"
        selected={shop}
        draft={newShop}
        onSelect={handleShop}
        onDraft={(next) => {
          setNewShop(next)
          if (next) setShop(null)
        }}
        draftError={errors.shop}
        teaSlug={tea?.slug ?? null}
      />

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

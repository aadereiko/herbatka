import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/form'
import { coordinateInput } from './draft'
import type { PinErrors } from './draft'
import { describeGeocodeError } from './format'
import type { NearPosition } from './nearby'
import { useGeocodeShop } from './queries'
import { ShopPinPicker } from './ShopMap'

/**
 * Where a shop is, editable three ways at once: click the map, drag the marker, or type
 * the numbers.
 *
 * All three write the same two strings on the draft, which is what keeps them honest —
 * there is no second copy of the pin held inside the map that could drift out of step
 * with the boxes. The boxes are not a debug view of the map; they are how you fix a pin
 * that is forty metres into the neighbouring building, which is a thing that happens
 * every time an address is geocoded and no amount of clicking gets you closer.
 *
 * Admin-only. `POST /shops` — the public suggestion — does not take a pin at all, so the
 * public form never renders this.
 */
export function ShopPinField({
  idPrefix,
  latitude,
  longitude,
  errors,
  geocodeShopId,
  onChange,
}: {
  idPrefix: string
  latitude: string
  longitude: string
  errors: PinErrors
  /**
   * The shop's id, when it has one.
   *
   * `POST /admin/shops/{shop_id}/geocode` needs a shop that exists, so a shop being
   * created for the first time cannot be looked up yet. Rather than a button that 404s,
   * the create form gets a sentence saying to save first — see the hint below.
   */
  geocodeShopId?: string
  onChange: (latitude: string, longitude: string) => void
}) {
  const geocode = useGeocodeShop()

  const pinned = latitude.trim() !== '' || longitude.trim() !== ''

  /**
   * Every edit path goes through here, and every edit path clears the lookup result.
   *
   * Otherwise "Pin moved to the address. Check it, then save." stays on screen while the
   * admin drags the marker somewhere else or retypes the numbers — claiming credit for a
   * pin it did not place, and implying the address was confirmed when it was overruled.
   */
  function setPin(nextLatitude: string, nextLongitude: string) {
    geocode.reset()
    onChange(nextLatitude, nextLongitude)
  }

  function pick(position: NearPosition) {
    setPin(coordinateInput(position.lat), coordinateInput(position.lng))
  }

  function findFromAddress() {
    if (!geocodeShopId) return
    geocode.mutate(geocodeShopId, {
      onSuccess: (shop) => onChange(coordinateInput(shop.latitude), coordinateInput(shop.longitude)),
    })
  }

  return (
    <fieldset className="space-y-3" data-testid={`${idPrefix}-pin`}>
      <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Where it is on the map
      </legend>

      <ShopPinPicker
        latitude={parseForMap(latitude)}
        longitude={parseForMap(longitude)}
        onPick={pick}
      />

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Click the map to drop the pin, or drag it. The numbers below follow it either way.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-latitude`}
          label="Latitude"
          type="number"
          step={0.000001}
          min={-90}
          max={90}
          value={latitude}
          error={errors.latitude}
          onChange={(value) => setPin(value, longitude)}
          placeholder="50.061947"
        />
        <TextField
          id={`${idPrefix}-longitude`}
          label="Longitude"
          type="number"
          step={0.000001}
          min={-180}
          max={180}
          value={longitude}
          error={errors.longitude}
          onChange={(value) => setPin(latitude, value)}
          placeholder="19.936856"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {geocodeShopId ? (
          <Button
            testId={`${idPrefix}-geocode`}
            disabled={geocode.isPending}
            onClick={findFromAddress}
          >
            {geocode.isPending ? 'Looking it up…' : 'Find from address'}
          </Button>
        ) : (
          <p
            data-testid={`${idPrefix}-geocode-unavailable`}
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            Save the shop first, then its address can be looked up for you.
          </p>
        )}

        {pinned && (
          <Button variant="ghost" testId={`${idPrefix}-clear-pin`} onClick={() => onChange('', '')}>
            Clear the pin
          </Button>
        )}
      </div>

      {geocodeShopId && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          The lookup uses the address as <em>saved</em>, not what is in the box above —
          save an edited address before looking it up.
        </p>
      )}

      {geocode.isError && (
        <p
          role="alert"
          data-testid={`${idPrefix}-geocode-error`}
          className="text-xs text-rose-600 dark:text-rose-400"
        >
          {describeGeocodeError(geocode.error)}
        </p>
      )}

      {geocode.isSuccess && (
        <p
          role="status"
          data-testid={`${idPrefix}-geocode-success`}
          className="text-xs text-brand-700 dark:text-brand-300"
        >
          Pin moved to the address. Check it, then save.
        </p>
      )}
    </fieldset>
  )
}

/**
 * What the map should draw for a half-typed box.
 *
 * `null` for anything that is not yet a coordinate, so a marker never jumps to 0,0 while
 * somebody is typing the minus sign in front of a longitude. The submit-time validation
 * in `validatePin` is what tells them about it; the map just declines to guess.
 */
function parseForMap(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

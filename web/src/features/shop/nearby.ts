import type { ShopSummary } from '../../lib/shop'

/**
 * Where you are, how that gets into a URL, how it survives a reload, and how a distance
 * reads on a card.
 *
 * Everything here is deliberately free of both React and Leaflet. The map is one way of
 * showing a position and the list is another, and neither should have to be loaded for
 * the other to work — `ShopMap.tsx` is the only module in the feature that imports
 * Leaflet at all, precisely so that a page showing the plain list never pays for it.
 */

export type NearPosition = { lat: number; lng: number }

/** Six decimals is about 11 cm at the equator — far past what a phone's GPS knows, and
 *  short enough that the URL stays something a person can look at. */
const COORD_DECIMALS = 6

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORD_DECIMALS))
}

export function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

export function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

/* --------------------------------------------------------------- the URL and back */

/** `?near=50.061947,19.936856`. One parameter rather than two, because the two halves
 *  are meaningless apart and a URL carrying only `near_lat` is a bug waiting to be
 *  pasted into a chat window. */
export function formatNear(position: NearPosition): string {
  return `${roundCoordinate(position.lat)},${roundCoordinate(position.lng)}`
}

/**
 * Total, like every other reader in `filters.ts`: a hand-edited `?near=somewhere` has to
 * render the ordinary list, not throw.
 *
 * The blank checks are load-bearing. `Number('')` is 0, so `?near=,` would otherwise
 * park you in the Atlantic off Ghana and look like a working feature.
 */
export function parseNear(raw: string | null): NearPosition | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 2) return null
  const [rawLat, rawLng] = parts
  if (rawLat.trim() === '' || rawLng.trim() === '') return null
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  if (!isLatitude(lat) || !isLongitude(lng)) return null
  return { lat, lng }
}

/* ----------------------------------------------------------------- remembering it */

export const NEAR_STORAGE_KEY = 'herbatka.shops.near'

/**
 * Every one of these wraps the whole `window.localStorage` expression, not just the
 * call on it.
 *
 * In a Safari private window and under a "block all site data" setting, reading the
 * *accessor* throws before `getItem` is ever reached. A try/catch drawn tightly around
 * `getItem` alone still takes the page down with it, which is the exact failure this
 * guards: a remembered convenience must never be able to break browsing.
 *
 * A failed write is also swallowed. The position is already in the URL by then, so the
 * only thing lost is the shortcut on the *next* visit — not worth an error message about
 * a browser setting the reader chose on purpose.
 */
export function readStoredPosition(): NearPosition | null {
  try {
    return parseNear(window.localStorage.getItem(NEAR_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storePosition(position: NearPosition): void {
  try {
    window.localStorage.setItem(NEAR_STORAGE_KEY, formatNear(position))
  } catch {
    // See above.
  }
}

export function forgetStoredPosition(): void {
  try {
    window.localStorage.removeItem(NEAR_STORAGE_KEY)
  } catch {
    // See above.
  }
}

/* -------------------------------------------------------------------- asking for it */

/**
 * One sentence per way this can go wrong, and every one of them ends by saying what the
 * reader still has.
 *
 * A refusal is not an error: somebody said no to a permission prompt, which is a
 * perfectly good answer, and the page behind the prompt still works. The numbers are
 * `GeolocationPositionError`'s own codes — a plain map rather than an enum, which
 * `erasableSyntaxOnly` bans outright.
 */
const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: 'You did not share your location, which is fine — here is every shop instead.',
  2: 'Your device could not work out where it is. Here is every shop instead.',
  3: 'Working out where you are took too long. Here is every shop instead.',
}

const GEOLOCATION_FALLBACK = 'We could not work out where you are. Here is every shop instead.'

const GEOLOCATION_UNSUPPORTED =
  'This browser will not tell us where you are. Here is every shop instead.'

/**
 * `getCurrentPosition` as a promise, rejecting with an `Error` whose message is already
 * fit to put on screen.
 *
 * `navigator.geolocation` is typed as always present and is absent in real life — an
 * insecure origin, an old browser, a locked-down device — so the check stays in despite
 * what the type says.
 *
 * `maximumAge` accepts a five-minute-old fix: a shop two streets away is still two
 * streets away, and waiting for a fresh satellite lock to prove it is a spinner nobody
 * asked for.
 */
export function requestPosition(): Promise<NearPosition> {
  const geolocation = navigator.geolocation
  if (!geolocation) return Promise.reject(new Error(GEOLOCATION_UNSUPPORTED))

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: roundCoordinate(position.coords.latitude),
          lng: roundCoordinate(position.coords.longitude),
        }),
      (error) => reject(new Error(GEOLOCATION_MESSAGES[error?.code] ?? GEOLOCATION_FALLBACK)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  })
}

/** Whatever came back from `requestPosition`, as something to show a person. */
export function describePositionError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GEOLOCATION_FALLBACK
}

/* ------------------------------------------------------------------------ distance */

/**
 * `2.4 km away`, `600 m away`, or nothing at all.
 *
 * Null in, null out — and the caller drops the line rather than printing a placeholder,
 * because "— away" on every card in an ordinary browse is a line of noise on every card.
 *
 * The switch to metres below a kilometre is not decoration: "0.6 km away" is a number
 * somebody has to convert in their head to decide whether to walk. The cutoff is 0.95
 * rather than 1 so that rounding cannot produce "1000 m away".
 */
export function formatDistance(km: number | null): string | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null
  if (km < 0.95) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

/* ------------------------------------------------------------------------ the pins */

/** A shop that can actually be drawn. Both halves or neither — see `ShopCoordinates`. */
export type PinnedShop = ShopSummary & { latitude: number; longitude: number }

export function isPinned(shop: ShopSummary): shop is PinnedShop {
  return typeof shop.latitude === 'number' && typeof shop.longitude === 'number'
}

/**
 * Out to OpenStreetMap for the walking directions we are not going to build.
 *
 * `mlat`/`mlon` drop their marker and the `#map=` fragment sets the view; both are
 * needed, because the fragment alone shows the area with nothing marked in it.
 */
export function directionsUrl(latitude: number, longitude: number): string {
  const lat = roundCoordinate(latitude)
  const lng = roundCoordinate(longitude)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}

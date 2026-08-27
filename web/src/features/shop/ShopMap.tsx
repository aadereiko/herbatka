// The stylesheet belongs to this module and not to `index.css`, so that /teas and
// /feed — every page in the app with no map on it — do not carry Leaflet's 15 kB of
// positioning rules for a component they never render.
import 'leaflet/dist/leaflet.css'

import { DivIcon, Icon } from 'leaflet'
import type { LatLngBoundsLiteral, LatLngTuple, LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router'

import { pluralise } from '../catalog/format'
import { describePlace } from './format'
import type { NearPosition, PinnedShop } from './nearby'

/**
 * Every Leaflet import in the app, in one file.
 *
 * That is a testing constraint before it is a tidiness one. jsdom has no layout and no
 * canvas, so a Leaflet map cannot be instantiated in a unit test at all — it measures a
 * container that is permanently 0×0 and gives up. One module means one `vi.mock` in the
 * suites that render these pages, instead of a mock per page and a new one every time a
 * map appears somewhere else.
 *
 * Three components, because there are three genuinely different jobs: a map *of* shops,
 * a map *at* a shop, and a map you *pin* a shop with. They share the tiles, the icons
 * and the accessible wrapper, and nothing else.
 */

/* --------------------------------------------------------------------------- icons */

/**
 * Leaflet's default marker resolves its images relative to wherever the CSS was served
 * from, which under a bundler is nowhere: you get a marker-shaped hole. The usual fix is
 * to patch `Icon.Default`'s prototype at import time; passing an explicit `icon` to
 * every `<Marker>` does the same job without a global side effect that other code has to
 * know about, and Vite turns the three imports above into real hashed URLs.
 */
const shopIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

/**
 * You, as a dot rather than a pin — because "you" and "a shop" must not be the same
 * shape on a map whose whole point is which of them is which.
 *
 * Inline styles rather than Tailwind classes: this string is handed to Leaflet and
 * injected as raw HTML, so it never passes through anything that could compile a class
 * name for it at build time.
 */
const youIcon = new DivIcon({
  className: '',
  html:
    '<span style="display:block;width:14px;height:14px;border-radius:9999px;' +
    'background:#1d4ed8;border:3px solid #fff;box-shadow:0 0 0 3px rgba(29,78,216,.35)"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

/* --------------------------------------------------------------------------- tiles */

/** OpenStreetMap's tiles are free to use and their licence requires the credit. It is
 *  not decoration: dropping it is the one thing that would get the app blocked. */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Kraków, and far enough out to see most of Poland. Somewhere has to be the answer when
 *  there is no position and nothing pinned, and an app about Polish tea shops opening on
 *  the middle of the Atlantic — which is what {0, 0} is — reads as broken. */
const DEFAULT_CENTER: LatLngTuple = [50.0614, 19.9366]
const DEFAULT_ZOOM = 5
const LOCATED_ZOOM = 13

function Tiles() {
  return <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
}

/**
 * A map is a `<div>` full of tiles, which is to say nothing at all to a screen reader.
 *
 * `role="region"` with a name makes it something that can be found and skipped, and the
 * visually hidden sentence inside says what a sighted reader gets from the pins — how
 * many there are and whether you are on it. Without that the region announces its own
 * name and then silence.
 */
function MapFrame({
  label,
  summary,
  height,
  testId,
  children,
}: {
  label: string
  summary: string
  height: string
  testId: string
  children: ReactNode
}) {
  return (
    <div
      role="region"
      aria-label={label}
      data-testid={testId}
      className={`${height} w-full overflow-hidden rounded-2xl border border-brand-200 dark:border-neutral-800`}
    >
      <p className="sr-only">{summary}</p>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- map of the shops */

/** Leaflet cannot fit a view to one point — `fitBounds` on a zero-area box zooms to the
 *  maximum — so a single pin keeps the centre and zoom it was given. */
function FitToPoints({ points }: { points: LatLngTuple[] }) {
  const map = useMap()
  // Stringified rather than the array itself: a fresh array every render would refit the
  // view on every render, which reads as a map that will not hold still.
  const key = JSON.stringify(points)

  useEffect(() => {
    const bounds = JSON.parse(key) as LatLngBoundsLiteral
    if (bounds.length === 0) return
    // A single point has no bounds to fit — fitBounds on a degenerate box zooms to the
    // maximum. It still has to move the view, though: MapContainer's center and zoom
    // apply on the first render only, so filtering down to one shop in another city
    // would otherwise leave the map where it was with the pin off-screen.
    if (bounds.length === 1) {
      map.setView(bounds[0] as LatLngTuple, LOCATED_ZOOM)
      return
    }
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [map, key])

  return null
}

export function ShopMap({ shops, you }: { shops: PinnedShop[]; you: NearPosition | null }) {
  const points = useMemo<LatLngTuple[]>(
    () => shops.map((shop) => [shop.latitude, shop.longitude]),
    [shops],
  )

  // You count towards the fit, so "nearest first" does not open on a map you are off the
  // edge of.
  const fitPoints = useMemo<LatLngTuple[]>(
    () => (you ? [...points, [you.lat, you.lng]] : points),
    [points, you],
  )

  const center = you ? ([you.lat, you.lng] as LatLngTuple) : (points[0] ?? DEFAULT_CENTER)
  const zoom = you || points.length > 0 ? LOCATED_ZOOM : DEFAULT_ZOOM

  const summary = [
    shops.length === 0 ? 'No shops are pinned on this map.' : `${pluralise(shops.length, 'shop')} on this map.`,
    you ? 'Your own position is marked.' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <MapFrame
      label="Map of the shops"
      summary={summary}
      height="h-[26rem]"
      testId="shop-map"
    >
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <Tiles />
        <FitToPoints points={fitPoints} />

        {you && (
          <Marker position={[you.lat, you.lng]} icon={youIcon}>
            <Popup>You are about here.</Popup>
          </Marker>
        )}

        {shops.map((shop) => {
          const place = describePlace(shop)
          return (
            <Marker key={shop.id} position={[shop.latitude, shop.longitude]} icon={shopIcon}>
              <Popup>
                <span className="block text-sm font-semibold">{shop.name}</span>
                {place && <span className="block text-xs">{place}</span>}
                <span className="block text-xs">{pluralise(shop.listing_count, 'tea')}</span>
                <Link to={`/shops/${shop.slug}`} className="mt-1 inline-block font-medium">
                  See the shop
                </Link>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </MapFrame>
  )
}

/* ------------------------------------------------------------------ one shop's map */

/** The small map on a shop's page. Rendered only when the shop has a pin — the caller
 *  checks, so that a shop without one gets nothing rather than an empty grey box. */
export function ShopPointMap({
  latitude,
  longitude,
  name,
}: {
  latitude: number
  longitude: number
  name: string
}) {
  return (
    <MapFrame
      label={`Map showing where ${name} is`}
      summary={`${name} on a map.`}
      height="h-56"
      testId="shop-point-map"
    >
      {/* Wheel scrolling off: this map sits inside a column somebody is scrolling past,
          and hijacking the wheel over it traps the page. */}
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <Tiles />
        <Marker position={[latitude, longitude]} icon={shopIcon} />
      </MapContainer>
    </MapFrame>
  )
}

/* ---------------------------------------------------------------------- the picker */

function ClickToPin({ onPick }: { onPick: (position: NearPosition) => void }) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  })
  return null
}

/**
 * Follows the pin, but only when it has left the screen.
 *
 * Recentring on every change would yank the map out from under a marker somebody is
 * dragging. Doing nothing would leave a geocoded shop pinned three countries away with
 * an apparently empty map on screen. "Pan when it is no longer visible" is the rule that
 * covers both.
 */
function KeepPinInView({ position }: { position: LatLngTuple | null }) {
  const map = useMap()
  const lat = position?.[0]
  const lng = position?.[1]

  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    if (map.getBounds().contains([lat, lng])) return
    map.setView([lat, lng], Math.max(map.getZoom(), LOCATED_ZOOM))
  }, [map, lat, lng])

  return null
}

export function ShopPinPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null
  longitude: number | null
  onPick: (position: NearPosition) => void
}) {
  const pinned = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined
  const point: LatLngTuple | null = pinned ? [latitude, longitude] : null

  return (
    <MapFrame
      label="Pin the shop on the map"
      summary={
        pinned
          ? 'The shop is pinned. Drag the marker, or use the latitude and longitude boxes below.'
          : 'The shop has no pin. Use the latitude and longitude boxes below to place one.'
      }
      height="h-72"
      testId="shop-pin-picker"
    >
      <MapContainer
        center={point ?? DEFAULT_CENTER}
        zoom={pinned ? 15 : DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
      >
        <Tiles />
        <ClickToPin onPick={onPick} />
        <KeepPinInView position={point} />

        {point && (
          <Marker
            position={point}
            icon={shopIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as LeafletMarker).getLatLng()
                onPick({ lat, lng })
              },
            }}
          />
        )}
      </MapContainer>
    </MapFrame>
  )
}

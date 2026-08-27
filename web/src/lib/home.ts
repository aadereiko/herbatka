/**
 * The home-page contract.
 *
 * Aliases of the API's own schemas, so a renamed Pydantic field breaks this build
 * rather than a component at runtime.
 *
 * Both shapes come from a single request each. The signed-in page could have been
 * assembled from /households + one /stock call per household + /feed + /friends/requests,
 * but the whole job of a landing page is to be the first thing you see, and a waterfall
 * of five requests is exactly what that must not be.
 */
import type { components } from './generated/api'

export type LowTin = components['schemas']['LowTin']
export type HomeSummary = components['schemas']['HomeSummary']
export type PublicSummary = components['schemas']['PublicSummary']

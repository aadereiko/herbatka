/**
 * How a score reads.
 *
 * One decimal, always, for an average: "8.0" is visibly a mean of something, where "8"
 * reads like somebody's single verdict — and the whole point of this screen is keeping
 * the crowd's number and your number apart. Your own score is an integer and is rendered
 * as one, by `formatScore`.
 */
export function formatAverage(value: number): string {
  return value.toFixed(1)
}

/** A score somebody actually gave: 9, not 9.0. Rounded rather than trusted, so a server
 *  that ever sends 9.000000001 does not put it on the page. */
export function formatScore(value: number): string {
  return String(Math.round(value * 10) / 10)
}

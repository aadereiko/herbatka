/** 210 → "3 min 30 s". Brewing guidance is read at a kettle, and "210 seconds" makes
 *  you do arithmetic while the water boils. */
export function formatBrewTime(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * The access token lives in a module-level variable and nowhere else.
 *
 * Not localStorage and not a readable cookie: both are visible to any script on the
 * page, so one XSS turns a 15-minute token into a stolen session. Memory dies with the
 * tab, and the httpOnly refresh cookie — which JS cannot touch at all — is what survives
 * a reload instead.
 *
 * Not React state either: `api.ts` reads this from outside the React tree, and a
 * request fired from a query function cannot call a hook.
 */
let accessToken: string | null = null

type Listener = (token: string | null) => void

const listeners = new Set<Listener>()

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  for (const listener of listeners) listener(token)
}

export function clearAccessToken(): void {
  setAccessToken(null)
}

/**
 * Lets the React tree hear about a token that was dropped outside it — a background
 * query whose silent refresh failed clears the token, and the UI has to stop claiming
 * a session that no longer exists. Returns an unsubscribe function.
 */
export function subscribeToAccessToken(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

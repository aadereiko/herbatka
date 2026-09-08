/**
 * Where the API lives, as a prefix to put in front of `/api/v1/…`.
 *
 * The default is the empty string, which is exactly what this app did before
 * this file existed: every request goes out same-origin as `/api/v1/…`, the Vite
 * dev server proxies it to uvicorn, and in production a reverse proxy does the
 * same. Same-origin is not a detail — it is what makes the httpOnly refresh
 * cookie work without any cross-site cookie rules getting involved, and what
 * means the browser never sends a CORS preflight. **Leaving this unset is the
 * right answer for the web app, and it is why the default is not configurable
 * away by accident.**
 *
 * `VITE_API_BASE_URL` exists for the two situations where there is no proxy in
 * front of the app and so no same origin to be had:
 *
 *   - A native shell (Capacitor). The webview serves the bundle from
 *     `capacitor://localhost`, which no dev server is proxying for, so the app
 *     has to name the API outright. See `CAPACITOR.md` — and read the section on
 *     the refresh cookie before you point it at anything, because cross-origin
 *     is precisely where that stops working.
 *   - A built bundle opened from a phone on the LAN without going through Vite.
 *
 * Both are cross-origin, so both need the API's `CORS_ORIGINS` widened to match
 * — see `.env.example`. That is a deliberate, local-only act, which is the other
 * reason this is a variable and not a default.
 *
 * The trailing slash is trimmed so `http://192.168.1.20:17311/` and the same URL
 * without the slash cannot produce `//api/v1/…`, which some proxies do not treat
 * as the same path.
 *
 * Note that this is substituted at build time, not read at run time — Vite
 * inlines `import.meta.env.*` into the bundle. Changing it means restarting the
 * dev server or rebuilding, and one built bundle can only ever talk to one API.
 */
const configured: unknown = import.meta.env.VITE_API_BASE_URL

export const API_BASE_URL: string =
  typeof configured === 'string' ? configured.trim().replace(/\/+$/, '') : ''

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // The repo-root .env is the single source of truth for ports, shared with
  // docker-compose and the API. '' as the prefix loads unprefixed vars too.
  const env = loadEnv(mode, '..', '')
  const webPort = Number(env.WEB_PORT ?? 17310)
  const apiPort = Number(env.API_PORT ?? 17311)

  // Both the dev server and `vite preview` need to reach the API, and they need
  // to reach it the same way, or "it works in dev" stops meaning anything. The
  // preview server is where the service worker is actually exercised (see
  // `devOptions` below), so it is the one that has to be honest.
  const apiProxy = {
    '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
    // Uploaded images. Without this the request falls through to the SPA fallback
    // and every <img> quietly gets index.html with a 200 — a broken picture and no
    // error anywhere to explain it. In production the reverse proxy does this job.
    '/media': { target: `http://localhost:${apiPort}`, changeOrigin: true },
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // ---------------------------------------------------------------------
        // The one rule this whole block exists to enforce: **no API response is
        // ever cached.**
        //
        // Herbatka is multi-user and every interesting endpoint answers relative
        // to the caller — your shelf, your households, your friends' reviews. A
        // cached `/api/**` response is three separate bugs waiting: it can hand
        // one signed-in user the body served to the previous one on a shared
        // phone, it can resurrect a household after you have left it, and it can
        // keep answering after logout when the whole point of logout is that it
        // stops. Offline support for *data* is not worth any of that, and this
        // app has no offline story to speak of anyway — it is a network app with
        // a home-screen icon.
        //
        // So: the precache holds the app shell (the HTML, the JS, the CSS, the
        // two Newsreader woff2s and the icons) and nothing else, and `/api/**`
        // and `/media/**` are pinned to NetworkOnly. `/media` is in there for the
        // same reason `/api` is — an uploaded image is a photograph of somebody's
        // kitchen shelf, not a static asset.
        // ---------------------------------------------------------------------
        registerType: 'autoUpdate',
        // A deferred external script rather than the virtual module: registering
        // the worker is not something any component should have to import, and
        // deferring keeps it behind the first paint.
        injectRegister: 'script-defer',
        // The icons are already in `public/`, so `globPatterns` below has them.
        // Left on (the default) the plugin adds every manifest icon a second
        // time and the precache manifest ships four duplicate entries.
        includeManifestIcons: false,
        workbox: {
          // Deliberately narrow, and deliberately not the plugin's default: this
          // list is every kind of file the built shell is made of and nothing
          // that could carry a user's data. woff2 is added because the two
          // self-hosted Newsreader cuts are part of the shell — without them a
          // second visit repaints its headings.
          globPatterns: ['**/*.{html,css,js,woff2,png,svg,ico,webmanifest}'],
          // The SPA fallback. An `/api` or `/media` request is never a
          // navigation, but `navigateFallbackDenylist` costs nothing and the
          // failure it prevents — the service worker answering an API call with
          // index.html and a 200 — is silent and baffling.
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/media\//, /^\/docs\b/, /^\/openapi\.json$/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/media/'),
              handler: 'NetworkOnly',
            },
          ],
          // `registerType: 'autoUpdate'` already implies both; spelled out so the
          // behaviour is readable here rather than inferred from the plugin.
          // A new build takes over the open tab instead of waiting for every tab
          // to close, which for an app installed on a phone is effectively never.
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
        },
        // -------------------------------------------------------------------
        // No service worker in dev, and this is the sensible setting rather than
        // the lazy one.
        //
        // A worker in front of the dev server sits between the browser and Vite's
        // module graph, which is the thing HMR is. It also breaks `/dev/ocr`
        // specifically: the bench pulls a ~2.9 MB tesseract WASM core and
        // `.traineddata` language files at run time, and a worker that either
        // caches or merely intercepts those turns a page that works into one that
        // half-loads with nothing in the console to explain it.
        //
        // The worker is verified against `vite preview` instead — which is the
        // honest place to verify it anyway, since dev builds no precache manifest
        // and so cannot exercise the only part of this config that matters.
        //
        // The other half of keeping dev clean is the `preview.port` below: a
        // worker registers per origin, so preview must not share one with dev, or
        // a single `vite preview` leaves a worker sitting on 17310 that outlives
        // it and serves a precached index.html to every later `make dev`.
        // -------------------------------------------------------------------
        devOptions: { enabled: false },
        manifest: {
          id: '/',
          name: 'Herbatka',
          short_name: 'Herbatka',
          description:
            "Track your teas: what's in them, what you thought of them, and how much is " +
            'left in the tin.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          // Both are literals off the dark half of the ramp in `src/index.css`,
          // because a manifest cannot hold two schemes: `theme_color` is
          // `--color-neutral-900` (the nav bar, which is what the status bar sits
          // against) and `background_color` is `--color-neutral-950` (the page
          // ground, which is what the launch screen paints before React exists).
          // Light-theme users get the right colour anyway — `index.html` carries a
          // pair of media-queried `theme-color` metas, and those win over this.
          theme_color: '#1b1d18',
          background_color: '#121310',
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              // Separate from the two above rather than `purpose: 'any maskable'`
              // on one file: a maskable icon is a different drawing (full-bleed
              // ground, mark shrunk into the safe circle), and declaring one file
              // as both means whichever job it is doing, it is doing it wrong.
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    envDir: '..',
    server: {
      port: webPort,
      // Without strictPort, Vite silently moves to the next free port when 17310
      // is busy — and then the API proxy and CORS origin both point at nothing.
      // Failing loudly is the whole point of reserving a port block.
      strictPort: true,
      proxy: apiProxy,
    },
    preview: {
      // 17314, out of the block PLAN.md reserves at 17314–17319. Not 17310: see
      // the note in `devOptions` — a service worker outlives the server that
      // registered it, and the one origin it must never be left on is the dev
      // server's.
      port: Number(env.PREVIEW_PORT ?? 17314),
      strictPort: true,
      proxy: apiProxy,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test-setup.ts',
    },
  }
})

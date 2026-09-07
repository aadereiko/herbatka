import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor scaffolding. Nothing here has been run on a device — see
 * `CAPACITOR.md` for what is and is not verified, and for the refresh-cookie
 * problem that stands between this file and a working native build.
 *
 * ## appId
 *
 * `dev.herbatka.app` — reverse DNS for `herbatka.dev`, plus a segment for the
 * shell. There is no registered domain behind it, which is the usual state of a
 * pet project, and `.dev` is the convention for exactly that; `com.example.*` is
 * rejected by App Store Connect and `com.herbatka.*` claims a `.com` somebody
 * else owns. **It is permanent.** On both stores the bundle id is the app's
 * identity: change it after the first submission and you have published a
 * different app, and every install of the old one stops receiving updates. Pick
 * the domain you actually intend to use before anything ships.
 *
 * ## webDir
 *
 * `dist`, relative to this file — so `npm run build` first, then `npx cap sync`,
 * every time. Capacitor does not build; it copies. A native run against a stale
 * `dist` is the most common way to spend an hour debugging a bug you already
 * fixed.
 */
const config: CapacitorConfig = {
  appId: 'dev.herbatka.app',
  appName: 'Herbatka',
  webDir: 'dist',

  // ---------------------------------------------------------------------------
  // Live reload against the LAN dev server. Commented out on purpose: with
  // `server.url` set, the native shell stops serving the bundle it was built
  // with and loads that address instead — so a config accidentally committed
  // with this enabled produces a released app that shows a white screen the
  // moment it is off your Wi-Fi.
  //
  // To use it: run `make dev-lan`, take the address it prints, and put it here,
  // then `npx cap sync` and run the app from Xcode or Android Studio. Editing a
  // component then hot-reloads inside the native shell, which is the only
  // pleasant way to work on anything native.
  //
  // `cleartext` is required because it is plain http, and both platforms refuse
  // that by default (iOS App Transport Security, Android's network security
  // config). Capacitor relaxes both only when this flag is set, and only for the
  // debug build.
  //
  //   server: {
  //     url: 'http://192.168.1.20:17310',
  //     cleartext: true,
  //   },
  //
  // Note what this does *not* fix: it changes where the HTML comes from, not the
  // webview's origin for cookie purposes on every platform, and it is not how
  // the app would be shipped. Auth behaviour under live reload is not evidence
  // about auth behaviour in a real build. See CAPACITOR.md.
  // ---------------------------------------------------------------------------
}

export default config

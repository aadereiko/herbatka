# Herbatka in a native shell

Scaffolding for wrapping the built web app in an iOS and Android shell with
[Capacitor](https://capacitorjs.com). **Nothing in here has been compiled or run
on a device or a simulator** — see [What is actually verified](#what-is-actually-verified).

There are two separate ways to get this app onto a phone and it is worth being
clear which one you want, because only one of them works today:

| | PWA (install from the browser) | Capacitor (native shell) |
|---|---|---|
| Status | **works** | scaffolded, does not sign in |
| Needs | a browser and https | Xcode / Android Studio, a signing identity |
| Auth | unchanged — the refresh cookie is same-origin | **broken.** [See below](#the-refresh-cookie-is-the-blocker) |
| Distribution | a URL | the App Store / Play Console |

If the goal is "the app on my phone", the PWA is the whole answer and it is
already done: serve `dist` over https, open it in Safari or Chrome, Add to Home
Screen. Capacitor is for when you need something a webview cannot do — the
camera roll for the tin photographs, a share target, a widget.

---

## What is actually verified

Both platforms were scaffolded on a machine with **no Xcode (Command Line Tools
only), no CocoaPods, no Android SDK and no simulators**, so:

| Step | Result |
|---|---|
| `npx cap add ios` | ✅ succeeded — `ios/`, 43 files, 1.3 MB |
| `npx cap add android` | ✅ succeeded — `android/`, 79 files, 1.4 MB |
| `npx cap doctor` | ✅ "iOS looking great 👌 / Android looking great 👌" |
| `npx cap open android` | ❌ `[error] Unable to launch Android Studio. Is it installed?` |
| `xcodebuild …` | ❌ `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance` |
| Gradle build | not attempted — `./gradlew` downloads a ~130 MB Gradle distribution and there is no SDK for it to build against |
| Running either app | **not attempted and not possible** |

`cap add` succeeding proves less than it looks like it does: it copies a project
template and runs `cap sync`, and neither of those needs a compiler. The bundle
id, app name and web assets *are* correctly wired into both templates — that much
was checked by reading the generated files — but the first honest test of any of
this is a build, and no build has happened.

Worth knowing: Capacitor 8 uses **Swift Package Manager**, not CocoaPods, so the
missing `pod` is not on the critical path. Xcode is.

---

## Getting to a first build

Install in this order. Each step is a prerequisite of the next.

### iOS

1. **Xcode** from the Mac App Store (~10 GB, and it wants a while). Command Line
   Tools are not enough: `xcodebuild`, the iOS SDK and the simulators all ship
   inside Xcode.
2. Point the toolchain at it — the CLT install left `xcode-select` aimed at the
   wrong directory, which is the error above:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -runFirstLaunch
   ```
3. Open Xcode once, accept the licence, and let it install the iOS platform.
4. An Apple ID in Xcode → Settings → Accounts. A free one signs builds for your
   own device; the $99/year Developer Program is only needed for TestFlight and
   the store.

```bash
cd web
npm run build        # Capacitor copies, it does not build. Always this first.
npx cap sync ios     # copy dist/ into ios/ and refresh the plugin list
npx cap open ios     # opens ios/App/App.xcworkspace
```

Then in Xcode: pick your device, set a Team under Signing & Capabilities, press
Run. The first run on a physical device also needs the phone to trust the
developer certificate (Settings → General → VPN & Device Management).

### Android

1. **Android Studio** (~1 GB, plus SDK downloads).
2. From its SDK Manager: an SDK Platform (API 35 or whatever
   `android/variables.gradle` names), the SDK Build-Tools and the Platform-Tools.
3. Export the SDK location so the CLI can find it, in your shell profile:
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools"
   ```
   Neither `ANDROID_HOME` nor `ANDROID_SDK_ROOT` is set on this machine and
   `~/Library/Android/sdk` does not exist, which is the whole of the Android
   blocker.
4. A JDK 21+. Homebrew's OpenJDK 25 is already installed here and will do.

```bash
cd web
npm run build
npx cap sync android
npx cap open android   # opens android/ in Android Studio
```

Gradle downloads its own distribution and the dependency graph on the first
build. Budget a few hundred megabytes and a slow first run.

### Live reload against the dev server

Uncomment the `server` block in `capacitor.config.ts`, put the address
`make dev-lan` prints into `server.url`, `npx cap sync`, and run from the IDE.
The shell then loads the Vite dev server instead of the copied bundle, so editing
a component hot-reloads inside the native app.

Two warnings, both of which have bitten people:

- **Never commit it enabled.** A release built with `server.url` set is a white
  screen for anyone not on your Wi-Fi.
- **It is not a test of the shipped app.** Under live reload the webview's origin
  is your dev server, not `capacitor://localhost`, which means the auth problem
  below can look fixed when it is not.

---

## The refresh cookie is the blocker

This is the one thing standing between the scaffold and an app that can sign in,
and it has deliberately **not** been implemented — it is a change to
authentication that cannot be verified without a native build, and shipping
unverifiable auth changes is how sessions break for everyone including the web
users who are currently fine.

### Why it breaks

Today the session is two tokens and only one of them is visible to JavaScript:

- the **access token**, 15 minutes, in a module-level variable in
  `src/lib/token.ts` — never in `localStorage`, so an XSS cannot walk off with it;
- the **refresh token**, 30 days, in an `httpOnly` cookie set by
  `_set_refresh_cookie` in `api/app/api/v1/routers/auth.py`, scoped to
  `Path=/api/v1/auth`, `SameSite=Lax`, `Secure` off in dev. JavaScript cannot read
  it at all, which is the entire point.

That works because the browser and the API share an origin: the app is served
from the same host that `/api/v1/*` is proxied on, so the cookie is first-party
and `SameSite=Lax` is satisfied. In a native shell none of that holds. The
webview serves the bundle from its own local origin —

| Platform | Webview origin (Capacitor default) |
|---|---|
| iOS | `capacitor://localhost` |
| Android | `https://localhost` |

— and the API is somewhere else entirely. Every call becomes cross-site, and the
cookie stops arriving, for a stack of independent reasons:

1. **`SameSite=Lax` means "not on cross-site subrequests".** A `fetch` from
   `capacitor://localhost` to `https://api.example.com` is exactly that. The
   cookie is not sent, `/auth/refresh` sees `refresh_token is None`, and returns
   `401 Missing refresh token`.
2. **Fixing that requires `SameSite=None`, which requires `Secure`,** which
   requires the API on real https. A LAN dev API on plain http cannot set a
   usable cross-site cookie at all.
3. **Even then, WKWebView applies ITP.** Third-party cookies are blocked or
   partitioned by default on iOS, and a cookie for the API host is third-party
   relative to `capacitor://localhost`. This is the one that does not have a
   configuration fix.
4. **`capacitor://` is not a scheme the cookie spec contemplates**, so behaviour
   around storing and returning cookies for it is inconsistent between platform
   versions rather than merely restrictive.

Android is likelier to work than iOS — its origin is at least `https://` and its
`CookieManager` accepts third-party cookies — but "likelier to work on one of two
platforms" is not an auth strategy.

### The fix, and where it would go

The standard answer is to stop using a cookie *on native only*: keep the refresh
token in platform secure storage — the iOS Keychain, Android's
`EncryptedSharedPreferences` — and send it explicitly. (Note that
`@capacitor/preferences` is **not** that; it is `UserDefaults` and
`SharedPreferences`, unencrypted. A refresh token wants a Keychain plugin.)

The encouraging part is that the seam already exists and does not need to be
carved. The service layer is already transport-agnostic:
`issue_refresh_token`, `rotate_refresh_token` and `revoke_refresh_token` in
`api/app/services/auth.py` take and return a raw token string and know nothing
about cookies. Rotation, reuse detection and the "revoke every session on
reuse" branch are all untouched by any of this. Everything cookie-shaped is in
the router, in four named places: `RefreshCookie`, `_set_refresh_cookie`,
`_clear_refresh_cookie` and `_token_response`.

So the change is roughly:

- **API.** Let `/auth/refresh` and `/auth/logout` also accept the raw token from
  the request body or an `Authorization`-style header, and let `_token_response`
  return it in the JSON body instead of a `Set-Cookie` when the caller is native.
  Which branch to take is a client-declared mode; that is safe, because the token
  is the credential either way and the channel grants nothing extra — but it is
  precisely why **the web client must keep using the cookie.** Returning a 30-day
  refresh token in a JSON body to a browser hands XSS the thing the `httpOnly`
  flag exists to protect.
- **Web client.** `runRefresh()` in `src/lib/api.ts` is the only caller of
  `/auth/refresh`, and `src/lib/token.ts` is the only holder of session state.
  A native build would give `token.ts` a second slot backed by secure storage and
  have `runRefresh` send it. One function and one module, both already isolated
  for the same reason.
- **CORS.** `capacitor://localhost` (and `https://localhost` for Android) added
  to `CORS_ORIGINS`. `allow_credentials=True` is already set and means `*` is not
  an option the spec would honour.

None of that is large. All of it is unverifiable from here.

---

## The other things that will not work on the first run

Listed because "auth is the blocker" is only true once you get past these.

**Every uploaded image 404s.** The API returns `image_url` as a root-relative
path — `/media/<name>`, from `media_url_prefix` in `app/core/config.py`. In a
browser that resolves against the app's origin and the proxy handles it. In the
shell it resolves against `capacitor://localhost/media/…`, which is inside the
bundle and does not exist. Teas, shops and households all render
`EntityImage`, so this is visible immediately and everywhere. Fixing it means
absolutising media URLs the same way `VITE_API_BASE_URL` absolutises API calls —
`src/lib/api-base.ts` is where that constant lives.

**The app icon is Capacitor's, not Herbatka's.** The PWA icons in `public/` do
not carry over; native icon sets are a different set of files in
`ios/App/App/Assets.xcassets` and `android/app/src/main/res/mipmap-*`. Generate
them with `@capacitor/assets` from the same `favicon.svg` that
`scripts/icons.mjs` uses. Splash screens likewise.

**The layout is a desktop layout.** PLAN.md's M7 lists a mobile layout pass —
"the stock screen is a phone-in-the-kitchen screen and should be designed as
one" — and it has not been done. Wrapping the app does not change that: the
native shell will show exactly the desktop-oriented layout the browser shows,
just in a smaller viewport. Packaging is not a responsive pass, and neither this
document nor the scaffold attempts one. The same caveat applies to the installed
PWA.

**No safe-area handling.** No `viewport-fit=cover`, no `env(safe-area-inset-*)`.
That is why `index.html` sets the iOS status bar style to `default` rather than
`black-translucent` — translucent would run the app under the notch with nothing
padding it away.

---

## Choices made here, and why

**`appId: 'dev.herbatka.app'`.** Reverse DNS for a `herbatka.dev` that nobody has
registered, which is the normal state of a pet project; `.dev` is the convention
for exactly that. `com.example.*` is rejected by App Store Connect, and
`com.herbatka.*` claims a `.com` somebody else may own. **It is permanent** —
on both stores the bundle id *is* the app's identity, and changing it after a
release publishes a different app that existing installs never hear from again.
Settle the domain before anything ships.

**`webDir: 'dist'`.** Capacitor copies, it never builds. `npm run build` before
every `cap sync`, or you ship the previous bundle and debug a fixed bug.

**`ios/` and `android/` are committed.** That is Capacitor's own recommendation:
they are project sources you will edit — signing, permissions, icons — not build
output. Regenerating them with `cap add` throws those edits away.

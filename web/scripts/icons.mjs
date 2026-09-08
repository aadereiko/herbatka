/**
 * Regenerate the PWA icons in `public/` from `public/favicon.svg`.
 *
 *     node scripts/icons.mjs        # or: npm run icons
 *
 * Run it when the favicon changes. The PNGs it writes are committed, because a
 * build must not depend on a browser being installed — this is a once-in-a-while
 * authoring step, the same way `npm run types` is.
 *
 * ## Why a browser and not a library
 *
 * There is no rasteriser on this machine: no `rsvg-convert`, no ImageMagick, no
 * `cairosvg`, and `sips` cannot read SVG. The alternatives were all downloads —
 * `sharp`, `@resvg/resvg-js`, `@vite-pwa/assets-generator` — each pulling a
 * platform-specific native binary into `devDependencies` for four PNGs that
 * change perhaps twice in the life of the project. Chrome is already here, it is
 * the renderer the icons will actually be viewed in, and it costs the repo
 * nothing. `--headless=old` rather than the new headless mode: the new one hangs
 * on this machine before it ever writes a file.
 *
 * ## Why the artwork is inlined below instead of read from favicon.svg
 *
 * It is not — the paths are parsed out of `favicon.svg` at run time, so there is
 * one drawing in this repo and not two. Only the *composition* differs per icon,
 * and that is the whole reason this file exists:
 *
 *   - **any** (192, 512) — the favicon exactly: the green disc full-bleed, the
 *     corners transparent. This is the icon shown as-is, so a disc is a disc.
 *   - **maskable** (512) — the green fills the whole square edge to edge, because
 *     a launcher will crop this to a circle, a squircle or a teardrop of its own
 *     choosing and any transparent corner becomes a bitten-off one. The sprig is
 *     scaled to 0.80, which puts its outermost point at 71% of the icon's width
 *     — inside the 80% safe circle the maskable spec guarantees, with room to
 *     spare. (The sprig's true maximum radius is 28.38 of the 64-unit viewBox,
 *     measured off the path geometry rather than the bounding box, which
 *     overstates it by a third.)
 *   - **apple-touch-icon** (180) — the same full-bleed square. iOS composites the
 *     icon onto black rather than honouring transparency, so a disc on
 *     transparent would arrive as a green coin on a black tile.
 *
 * The colours are the two literals in `favicon.svg` and are read from it too.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const publicDir = join(here, '..', 'public')

const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** The disc and the sprig group, lifted verbatim out of the favicon. */
function readArtwork() {
  const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8')
  const disc = svg.match(/<circle[^>]*\/>/)?.[0]
  const sprig = svg.match(/<g transform[\s\S]*?<\/g>/)?.[0]
  const ground = disc?.match(/fill="(#[0-9a-f]{6})"/i)?.[1]
  if (!disc || !sprig || !ground) {
    throw new Error('favicon.svg no longer has the <circle> + <g> shape this script expects')
  }
  return { disc, sprig, ground }
}

/**
 * `scale` re-scales the sprig *around the icon centre*, on top of the 0.86 the
 * favicon already applies to it. `bleed` swaps the disc for a full square.
 */
function page({ size, scale, bleed }) {
  const { disc, sprig, ground } = readArtwork()
  const ground_ = bleed ? `<rect width="64" height="64" fill="${ground}"/>` : disc
  const wrapped =
    scale === 1
      ? sprig
      : `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${sprig}</g>`
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
${ground_}
${wrapped}
</svg>`
}

const ICONS = [
  { file: 'pwa-192x192.png', size: 192, scale: 1, bleed: false },
  { file: 'pwa-512x512.png', size: 512, scale: 1, bleed: false },
  { file: 'pwa-maskable-512x512.png', size: 512, scale: 0.8, bleed: true },
  { file: 'apple-touch-icon-180x180.png', size: 180, scale: 0.8, bleed: true },
]

const work = mkdtempSync(join(tmpdir(), 'herbatka-icons-'))
try {
  for (const [index, icon] of ICONS.entries()) {
    const html = join(work, `${icon.file}.html`)
    writeFileSync(html, page(icon))
    const out = join(publicDir, icon.file)
    // `timeout` + "did the file appear?" rather than trusting the exit code.
    // `--screenshot` writes the PNG and then this Chrome frequently does not
    // exit at all on macOS; waiting on it would hang the script for ever, and
    // treating the kill as a failure would throw away a perfectly good icon.
    spawnSync(
      CHROME,
      [
        '--headless=old',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--hide-scrollbars',
        // Without this the shot comes back on opaque white and every corner the
        // launcher rounds off is a white crumb.
        '--default-background-color=00000000',
        '--force-device-scale-factor=1',
        // One profile per shot, and not a shared one: the previous run leaves a
        // lock behind that the next Chrome waits on for ever instead of failing.
        `--user-data-dir=${join(work, `profile-${index}`)}`,
        `--window-size=${icon.size},${icon.size}`,
        `--screenshot=${out}`,
        `file://${html}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 30_000, killSignal: 'SIGKILL' },
    )
    const bytes = statSync(out, { throwIfNoEntry: false })?.size ?? 0
    if (bytes === 0) throw new Error(`Chrome wrote no ${icon.file}. Is CHROME_BIN right?`)
    console.log(`wrote public/${icon.file} (${bytes} bytes)`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

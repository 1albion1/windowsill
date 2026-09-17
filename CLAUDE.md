# Windowsill

A transparent, always-on-top Windows overlay where photos of your own cats walk along the taskbar. Electron main + renderer, no framework, no bundler, no TypeScript.

## Running it

```bash
npm start          # never `electron .` — see below
npm run dev        # with DevTools
npm run icons      # regenerate .ico after editing assets/*.svg
npm run check      # pre-release checks — run before every release
npm run install:local  # install the built .exe on this machine
npm run dist       # public installer, no cats bundled
npm run dist:mine  # installer with cats/ baked in, for personal machines
```

**`npm start` goes through `tools/launch.mjs` on purpose.** VS Code exports `ELECTRON_RUN_AS_NODE=1` to its terminals, which makes any Electron binary boot as plain Node — it exits silently or dies on the first `app.` call. The launcher strips it. If you ever invoke Electron directly (a capture harness, a one-off script), clear the variable yourself:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe script.js
```

## How it fits together

| | |
| --- | --- |
| `src/main/` | Window, tray, protocol, cat loading, settings. CommonJS. |
| `src/preload/` | `preload.js` for the overlay, `welcome.js` for the welcome window. |
| `src/renderer/` | Overlay and welcome UI. **ES modules** (`<script type="module">`). |
| `tools/` | Build and import scripts. ESM `.mjs`, run under plain Node. |
| `assets/` | SVG sources plus generated `.ico`. The `.ico` files are committed. |

Main and preload are CommonJS; renderer and tools are ESM. `package.json` has no `"type": "module"`, so `node --check` on a renderer file will fail unless you copy it to `.mjs` first.

## Five things that will bite you

**Everything is served from one origin.** UI, cat images and artwork all come from `cats://app/` (`/ui/`, `/pets/`, `/art/`). This is not decoration: the renderer reads sprite pixels back out of a canvas to build hit-masks, and a second origin would taint the canvas and break click-through. Do not load cat images from `file://` or a second scheme.

**Click-through is toggled, not static.** The overlay runs with `setIgnoreMouseEvents(true, { forward: true })` so it still receives mousemove. When the renderer finds the cursor over a non-transparent pixel of a cat it asks main to go solid, and back again on exit. If you add UI to the overlay, it will be invisible to the mouse unless you extend that hit test.

**`Cat#mirror()` is the single source of truth for flipping.** It combines where the cat is headed with which way its photo faces. Both rendering and hit-testing call it. If you inline the flip in one of them, clicks land beside the cat instead of on it.

**Cats live in different places depending on how the app started.** `app.getAppPath()/cats` from source, `app.getPath('userData')/cats` when packaged, because the packaged app folder is a read-only asar. Always go through `catsRoot`, resolved in `resolvePaths()`.

**Assets must be read from `assetsRoot`, not `__dirname`.** They ship as `extraResources`, so packaged they sit in `process.resourcesPath/assets`, outside the asar. `nativeImage.createFromPath` cannot read from inside an asar.

## Cats

A cat is a folder of cutout PNGs. Everything about it can be inferred:

- **Pose** comes from the filename stem — `sit.png`, `walk.png`, `sleep.png`.
- **Facing** comes from a `-left` / `-right` / `-front` suffix. Default is right.
- **Scale** is derived in `deriveAutoScales()` by holding the cat's on-screen area roughly constant between poses, so a curled sleeping cat is not rendered as tall as a sitting one. Verified within 2–4% of hand-tuned values on a real photo set.

A `cat.json` overrides any of it, and explicit config always wins over the filename. **Do not make configuration mandatory again** — a folder containing only `sit.png` must keep working, because most users will never write JSON.

The recognised pose names live in the `poses` arrays in `behavior.js` and nowhere else. Every one of them is a filename someone may use, so a new state needs its own name first in its own chain — otherwise the behaviour exists but `chase.png` silently does nothing, which is how `chase` was broken until 0.2.1. `npm run check` enforces that the README, the welcome window and `prepare-cat` all list the same set.

Photos are poses, not frames. All motion — walk bob, breathing, landing squash, mid-air tumble — is computed in `Cat#animation()`. If a cat looks stiff, that is the function to edit, not the artwork.

## Releasing

The user wants every release installed on their machine afterwards. The order is:

1. `npm run check` — must be all green
2. `npm run dist`
3. `gh release create vX.Y.Z dist/Windowsill-X.Y.Z-setup.exe --notes-file ...`
4. `npm run install:local`

**Silent is not unattended.** The existing install is per-machine, under `C:\Program Files\Windowsill`, so Windows raises a UAC prompt that NSIS's `/S` cannot suppress and the installer blocks until someone approves it. Do not try to route around that — say plainly that the prompt is on screen and waiting. A per-user install would need no prompt, but switching means uninstalling the per-machine copy first, which is the user's call.

`install:local` reads the install location from the registry rather than assuming, because an upgrade inherits whatever the previous install chose, and verifies the registered version matches `package.json` so a half-finished upgrade fails loudly.

## Privacy rules for this repo

- `cats/*/` is gitignored. **Never commit cat photos.** `cats/README.md` is the only tracked thing in there.
- `npm run dist` must not bundle `cats/`. That build is what strangers download and it ships with the drawn fallback cat only. `npm run dist:mine` is the one that includes them.
- Commits use `23285988+1albion1@users.noreply.github.com`, set locally on this repo. Do not switch it to the global work address.

## Icons

`assets/icon.svg` is the full mark; `assets/icon-small.svg` drops the window frame for the 16 and 24px entries, because below about 32px the frame turns to noise and the tail detaches from the cat. `assets/tray.svg` is the bare silhouette. `tools/make-icons.mjs` renders all three and writes the `.ico` containers by hand — there is no ICO dependency, and the format is simple enough that there should not be one.

The cat paths are duplicated across the three SVGs. If you change the drawing, change all three.

## Verifying UI changes

The overlay and the welcome window can both be captured without screenshotting the user's desktop: load the page in a throwaway `BrowserWindow` with the real protocol handler and preload, then `webContents.capturePage()`. Prefer this over asking the user what they see, and over capturing the screen — their desktop is not yours to photograph.

**A capture harness pointed at the repo proves nothing about the installer.** 0.2.0 shipped with a broken image in the welcome window: `extraResources` filtered assets by extension, the referenced `.svg` was not on the list, and the page rendered perfectly from source while the packaged app showed a broken image. Nothing errored — the file was simply absent.

Run `npm run check` before any release. It verifies that every pose name in `behavior.js` is documented in both the README and the welcome window, that artwork referenced as `/art/...` exists and ships unfiltered, that it is present in the packaged build, and that the public build carries no cats. Add a check there whenever something breaks silently rather than loudly.

## Conventions

- Comments explain *why*, especially where a line looks arbitrary but is load-bearing. Match that density; do not narrate what the code already says.
- No dependencies in the shipped app. `sharp` and `electron-builder` are devDependencies used by tools only.
- British-ish prose in user-facing text, sentence case in UI labels.

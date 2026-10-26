# Multik architecture — stable Lighttable baseline

Audited 25 October 2026 against runtime `c771eb8` and documentation base
`46b5ccb`. This describes the implemented application, not the original Classic
roadmap. The previous document is preserved verbatim in
[docs/history/ARCHITECTURE-pre-baseline.md](docs/history/ARCHITECTURE-pre-baseline.md).
The product contract is [PRODUCT_SPEC.md](docs/lighttable/PRODUCT_SPEC.md); publication provenance is
[docs/lighttable/DEPLOYMENT.md](docs/lighttable/DEPLOYMENT.md).

## Applications, stack and build

Two applications share one hosting origin but have separate entry points and
browser data. Classic remains at `/`; Lighttable runs at `/lighttable/`. The live
owner-private host is
<https://multik-photo-room.alexanderhot.chatgpt.site/lighttable/>. Source is maintained
in `alxktnk-web/Multik`; GitHub Actions verifies source without deploying Pages.

Lighttable uses TypeScript, Vite 6, DOM/Pointer Events, WebGL2, a native IndexedDB
adapter and a custom service worker. There is no React/Preact, Workbox, `idb` or
`exifr` dependency, photo-processing server or account sync. Hosting access control
does not move the browser's photo library to the server. Vitest covers logic;
Playwright/Chromium scripts exercise the browser. Use Node 22 and the lockfile.

`npm run build` builds Lighttable into `dist-lighttable/`, assembles it with
`deployment/classic-baseline.tar.gz` into `dist-combined/`, then stages `dist/` for
the existing Sites manifest. Assembly checks every Classic file byte for byte
(13 in this baseline). It does not rebuild Classic from `src/app`.
`npm run build:classic` is a separate source build. The vendored tar is a required
build input. Documentation-only changes need no new runtime deployment.

## File map

Paths below are relative to `src/lighttable/` unless stated otherwise.

| Area | Files and responsibility |
| --- | --- |
| Entry/orchestration | `main.ts`, `ui/workspace.ts`: persistent workspace, session/renderer/navigation wiring, orientation, actions and locks |
| Presentation | `style.css`, `fonts.css`, `ui/adaptive.css`, `ui/home.css`, `ui/import.css`, local Manrope, `ui/icons.ts` local SVG |
| Editor/source strips | `ui/editor.ts`, `ui/film-rails.ts`: tools, direct controls, source selection and rail visibility |
| Collections/import | `ui/library.ts`, `ui/import-roll.ts`, `ui/covers.ts`, `ui/favorite-notice.ts`: Mixes/Library, two-roll flow, thumbnails, membership Undo |
| Model | `model/types.ts`, `model/session.ts`, `model/transforms.ts`, `model/levels.ts`, `model/parameters.ts`: composition, RAM draft/Undo, geometry and control bounds |
| Navigation | `model/navigation.ts`: serial save boundaries, pair loading, browsing context, conflict copy |
| Input | `input/gestures.ts`: pointer ownership, View swipe/tap, Move drag/pinch, cancellation |
| GPU | `render/renderer.ts`, `shaders.ts`, `levels.ts`, `film-profile.ts`, `dense-profile.ts`: preparation, direct preview and shared export math |
| GPU lifecycle | `render/assets.ts`, `resources.ts`, `scheduler.ts`: serial decode, allocations, limits and one pending animation frame |
| Persistence | `data/types.ts`, `repository.ts`, `import.ts`: records/validation, IDB transactions and staged import |
| Export | `ui/export-dialog.ts`: historical name; direct native Share with RAM JPEG retry, no dialog |
| PWA/build (repository root) | `lighttable/pwa/`, `vite.lighttable.config.ts`, `scripts/lighttable-pwa.mjs`, `lighttable-assemble.mjs`, `lighttable-stage.mjs`; UI activation in `ui/pwa.ts` |
| Preserved Classic (root) | `src/app/`, `src/core/`, `src/gl/`, `lab/`, `public/`: separate historical implementation/research |

Lighttable reuses the deterministic RNG in `src/core/rng.ts`; it does not run
Classic's development pipeline. `data/legacy-reader.ts` and adoption helpers remain
in source, but the current Library has no legacy import UI. Their presence is not
a promise of migration, rendering parity or a supported Classic workflow.

## Composition and browser data

Database `multik-lighttable`, version 1, contains `assets`, `rolls`, `jobs`,
`projects`, `compositions` and `prefs`. Classic's `multik-app` remains separate.
Normal updates neither clear databases nor migrate Classic.

- An **asset** retains its original Blob unchanged, revision 1, plus JPEG preview
  up to 1024px and thumbnail up to 160px. Stored dimensions describe the preview;
  export decodes the original again. Browser decoding handles EXIF orientation;
  explicit ICC/HDR gain-map interpretation is not implemented.
- A **roll** holds an ordered immutable source list. Native import offers
  6/12/24/36, default 12, and requires exactly the chosen count. Preparation is
  serial; unfinished imports use ownership-scoped staged jobs. Cancellation cannot
  delete committed rolls or unrelated assets.
- A **project** selects two rolls and current indices. Each normal Mix stores one
  composition per source pair within that project. Pair IDs include project,
  roll/source identity and source revisions. Swiping advances both indices by one
  with wraparound; it does not enumerate all possible combinations.
- A **composition** is schema 1, manual-pair mode, 36×27mm frame, two layers with
  exactly one placement each, source/frame rotations, transforms/Levels, effects,
  seed, profile and optimistic revision. Portrait sources initially lie sideways
  in the common film direction. Frame and source rotation are distinct.
- A **Library variant** stores a full composition snapshot, its own favorite
  project, shared original references, membership and thumbnail. Its editable
  sources are not replaced by a JPEG. Canonical state keys ignore record identity
  and revision, normalizing neutral Levels/unit scale for deduplication.

Saved Library snapshots are immutable. Their first dirty save boundary creates
a hidden `kind: 'draft'` working project; later edits update that working copy.
A new heart saves another immutable variant. Unlike removes membership only;
snapshot/assets remain, and `Removed · Undo` restores membership for eight seconds.
Membership Undo is distinct from edit Undo.

`Session` owns a deep-copied RAM draft, saved revision, gesture checkpoint and up
to 50 Undo states. Gesture end adds at most one Undo state and marks dirty, without
writing IDB. Navigation/export/heart/collection transitions and leaving landscape
own save boundaries. Failed saves retain dirty RAM edits. Compare-and-swap revision
conflicts offer a separate copy. Unsaved edits and Undo are not guaranteed after
Safari termination or reload.

Browsing space (`mixes`/`library`) is separate from project identity. Library
persists its saved-variant anchor/order even when editing creates a working draft.
Swipes stay within Library membership; removed, empty and single-item cases retain
the working image as appropriate. Library pairs are fixed: its two selectors
choose layers, never replacement source photos.

## Rendering and color

Sources upload as `SRGB8_ALPHA8`; sampling supplies linear RGB. Halo intermediates
are `RGBA8`. Light addition occurs in floating point fragment-shader arithmetic,
followed by tone/output conversion. Lighttable does not use Classic's half-float
film-strip framebuffer or sliding-window development.

The shared preview/export shader performs:

1. Screen/tile coordinates → film millimetres → transformed source UVs.
2. Independent source Levels on **CIELAB L\*** (D65), before conditioning/addition.
   Black/mid/white remap normalized L\*. The shader preserves a\*/b\* in gamut;
   otherwise it reduces chroma at fixed L\*/Lab hue using a bounded search. Exact
   neutral Levels bypass conversion. These are not RGB-channel Levels.
3. Profile conditioning/gains and linear light addition, with source-anchored
   halo where allowed, then exposure/tone and visible-range contrast.
4. sRGB display encoding and bounded output.

| Look | Stored version | Processing |
| --- | --- | --- |
| Original | 2 | Source halo, linear addition, highlight shoulder, restrained S curve |
| Film | 3 | Film tone model; halo is positive blurred spill outside each emitter |
| Dense | 4 | Additional per-source conditioning before Film processing |
| Clear | 5 | Manual source Levels, linear addition, clipping, sRGB encoding; bypasses automatic tone/color, gains, exposure, halo and contrast |

Version-1 records normalize to 2 when copied; opt-in profile versions remain
unchanged. New pairs use Original/2. Lighttable has no grain, dust or light-leak
pipeline. Model fields and handlers for exposure, balance, contrast, halo
radius/threshold and XY remain in code; the baseline visible editor exposes
Levels, Halo strength and Looks.

Halo extraction operates independently on each source after its Levels, before
addition, using padded source-space masks and separable blur. Two medium sources
cannot jointly cross the emitter threshold. Cached masks follow source transforms.
Position/scale/rotation/halo strength reuse textures; Levels or radius/threshold
changes refresh affected masks/blur without CPU readback. Seeded halo variation
stays stable across movement and export.

## Input and the interactive hot path

Portrait is View; landscape opens the editor with explicit View/Move, Levels,
Halo and Looks. View permits horizontal pair/variant swipes and a short tap to
hide/restore chrome. Move owns selected-layer translation and anchored pinch scale
(.5–4). Two fingers do not pan/zoom the viewport. View, Levels and Halo disable
pinch. Pointer cancellation, blur and visibility changes restore an incomplete
gesture; completed gestures retain their RAM Undo checkpoint.

Pointer updates mutate the RAM model and invalidate the renderer. A latest-state
scheduler coalesces them into one pending `requestAnimationFrame`; no idle loop
runs. Canvas/context stay mounted. Warm movement must not decode, upload textures,
compile shaders, encode JPEG, call `readPixels` or write IDB, including finger lift.
Tool/layer switches preserve geometry and independent Levels. A swipe may save
and load at its explicit navigation boundary.

Preview sources decode serially, normally at 1024px. Preview framebuffer tiers
are 1024/768/512 with DPR capped at 1.5. Prepared-source caching targets 24MiB;
active/pending sources are pinned. Texture allocation has a 96MiB guard. These
track GPU texture estimates, not total Safari RAM or measured hardware usage.
Selection/context generations reject stale async loads. Context loss discards
invalid handles and reloads the pair; hidden documents pause the scheduler.

## JPEG export and native Share

Save first commits dirty metadata through Navigation, snapshots the composition
and decodes originals serially at up to 4000px edge. The same presentation shader
renders into a separate 1024px tile target, using `readPixels` and a CPU output
canvas. Output is 4000×3000 or 3000×4000 JPEG at .95, not arbitrary original
resolution. The exporter also accepts 2000px internally; the UI has no size choice.

Export pauses interactive rendering and guards tracked textures at 160MiB. It
does not overwrite visible drafts or originals. Tiling/readback, encoding,
cancellation and cleanup belong to export. Heart/cover actions separately capture
small previews at explicit collection boundaries.

Save attempts `navigator.share({files})` after rendering. If Safari activation
expires, the ready File stays in RAM; the same icon retries Share synchronously
on a fresh tap without rerendering. System cancellation is quiet. There is no
download fallback or preview dialog. Selecting Save Image/Photos belongs to the
system sheet/user; browser success does not prove storage in Photos. RAM retry
files disappear on reload.

## PWA, deployment and recovery

Manifest/start URL and worker scope are `/lighttable/`. The custom worker caches
only the generated shell, checks response URL/type/MIME, rejects login HTML in
place of assets and normalizes safe redirects for Safari. Recovery/unknown paths
use the network. Photos/edits remain in IDB, outside the shell cache.

Updates wait for the visible Update action, activate through a safe save boundary
and reload only the requesting page. Another tab's controller change does not
automatically reload this one. Cleanup affects only Lighttable's cache prefix.
Recovery must not delete either database or the other application's worker/cache.
Offline launch requires a successfully installed shell. Hosting rollback does not
move or restore browser data.

Classic retains its root shell and separate cache/database. Runtime rollback and
source revert are distinct; older applications may reject newer profile/record
semantics. A saved hosting artifact is not proof of data-compatible rollback.
Deployment hashes/procedures belong in DEPLOYMENT.md, outside runtime code.

## Boundaries for future design work

Start design changes in CSS, icons and UI DOM/control layout. Preserve the
canvas/stage rectangle across tool/rail/chrome changes, whole-frame fitting,
a 44px touch-target goal (the compact landscape column currently has the documented K06 exception), long direct-control tracks, orientation and selection rules.
Library View hides strips; Library edit shows only its two fixed-source selectors;
Mixes retains full source strips.

Transforms, gesture ownership, save boundaries, source identity, immutable
snapshots, color/Levels formulas, profile versions, export, databases and worker/
build scope are behavioral contracts. Changing them requires explicit scope and
relevant regression checks; a visual redesign alone does not authorize it.
Do not alter Classic, hosting origin/access or erase browser data as a styling step.

See [ACCEPTANCE.md](docs/lighttable/ACCEPTANCE.md) and `package.json`: current checks include
`test:lighttable:viewer`, `:orientation`, `:favorites`, `:levels-landscape`, `:levels`,
`:export`. The production `:pwa` harness needs its old gesture setup updated before
claiming a fresh full PASS; past evidence is in VALIDATION. Several older scripts/docs describe removed Edit/Done/Cancel/
Pro layouts and are historical, not the current contract. Chromium establishes
browser behavior, not actual iPhone timing/memory, HEIC/HDR/P3 fidelity or native
Save-to-Photos success; those device acceptance items remain open.

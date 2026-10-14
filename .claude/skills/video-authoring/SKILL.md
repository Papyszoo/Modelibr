---
name: video-authoring
description: Authoring Modelibr docs feature videos and docs screenshots - the record→edit→analyze→collect pipeline, choreography best practices (provision off-camera, glides, camera framing, captions, cut spans, final hold), duration-cap semantics, selector dependencies on the frontend. Use when creating or editing anything under docs/videos (specs, helpers, manifest, pipeline scripts) or when a docs video looks wrong/fails to generate.
---

# Docs video authoring (Playwright screencast)

Feature videos embedded in `docs/docs/features/*.md`. Rendered **locally on a GPU
machine and published straight to the docs asset host** - workflows never render
or commit them; pages reference `/videos/…`. Release procedure: `release-workflow`.

```bash
npm run videos:generate                             # full: e2e stack → all videos → teardown
cd docs/videos && npm run generate:texture-sets     # one feature, stack already up
```

## Pipeline (run-videos.js): clean → record → edit → analyze → collect

1. **Record** - each `scripts/<slug>.spec.ts` drives the app against the E2E
   Docker stack (`FRONTEND_URL` :3002, `API_BASE_URL` :8090) and writes a raw
   2560×1440 webm (1280×720 CSS px at 2x) plus `<slug>.timeline.json` and
   caption PNGs to `.generated/raw/`.
2. **Edit** (`trim-videos.js` → `video-polish.js`) - shortens frozen stretches,
   cuts `offCamera`/`cutUntil` spans, eases the camera between `focusOn`
   framings, fades captions in, encodes 1920×1080 VP9. The opening shot, each
   caption's reading time and the `holdOn` tail are protected.
3. **Analyze** (`analyze-videos.js`) - the QA gate. Fails on missing, unreadable,
   ≥85% black, frozen tail ≥4s, or **duration > manifest cap**.
4. **Collect** - approved videos land in `docs/static/videos/`.

Reports: `.generated/reports/raw-video-analysis.json` + `final-video-analysis.json`
(durations, freeze/black, issues) - start there when a video fails. `maxDurationSeconds`
in `video-manifest.js` is a **QA ceiling, not a target**: choreograph well under it
so a slower run doesn't trip the gate; on `over-max-duration` tighten the
choreography first, raise the cap only deliberately.

`analyze-videos.js` gates clips during a run; `verify-videos.js` re-checks the
collected set against the manifest and report: `npm run videos:verify` (what
`test:all` runs) or `-- --complete` for publish strictness. It renders nothing, so
alone it only tells you the _last_ render was good. To test specs against current
code, re-record: the `docs-videos` suite in `npm run test:all` (slow tier, Docker +
GPU) does `videos:generate` then this gate (without `--complete`). A partial re-render
(`generate:sprites`) rewrites the report with only that slug, so older valid clips
are flagged _not covered by the latest analysis run_ (warning; failure under
`--complete`).

## Choreography rules

1. **Provision off-camera, demo on-camera.** All setup (API uploads,
   `clearAllData`, `waitForThumbnailsReady`, `settleImportSuggestions`) happens
   BEFORE `startFeatureRecording`. Use `helpers/demo-art.ts` for sprites,
   covers, sounds and materials instead of flat test colours.
2. **Open strong.** `startFeatureRecording(page, testInfo, { slug, caption })`
   starts on a populated, settled screen with its first caption and a short
   establishing shot. There is no chapter card.
3. **Move like a human.** `glideTo` / `glideClick` / `glideType` / `glideDrag`
   (eased, curved pointer paths) - never bare `locator.click()` or
   `page.mouse.move` on camera, they teleport the cursor. Over a WebGL canvas
   pass `maxSteps` to `glideDrag`.
4. **Frame the action.** `focusOn(page, locator | box | "full", { zoom })` points
   the camera; clicks only pan an already zoomed frame. Frame dialogs once they
   have finished opening; zoom out before something opens off-frame.
5. **Caption each beat.** `caption(page, text)` - short, plain, no em dashes;
   three or four per clip; `caption(page, null)` clears a caption whose step
   is over. The edit keeps a caption off whatever is being clicked (bottom,
   else top); pass `{ position }` only to override.
6. **Cut the waiting.** `glideClick(..., { cutUntil })` or `offCamera(page, fn)`
   around loaders, uploads and dialog fades; the cut closes once the new state
   is painted.
7. **End on the result.** `holdOn(page, target)` frames the finished state
   and holds it; then `stopFeatureRecording`. `dwell(page, ms)` keeps a screen
   up mid-clip (dead-time compression skips it). A zoom never crops its
   target: frame the whole subject (`regionAround` for a model in a canvas).
8. **Keep the recording page alone.** Never open a second page in its context
   (it shrinks the screencast frames); `withScratchPage` renders offscreen.

## Recording mechanics

- Full Chromium in new-headless (`channel: "chromium"`) so WebGL uses the GPU;
  `--force-device-scale-factor=2` makes the screencast 2x. Playwright's
  `showActions` / `showChapter` are never used.
- Recording-only CSS (injected by `navigateTo`) draws the one cursor and hides
  focus rings and tooltips; the app's own styles are untouched.
- Pacing helpers scale by `videoPaceFactor` (0.65); dead time is compressed in
  the edit anyway, so generous pauses cost nothing.
- `navigateTo(page, path)` seeds tab layout via `leftTabs`/`rightTabs` URL
  params and waits for `.p-splitter` + tab loading. Mid-clip, navigate in-app
  (`openNewTabPage` / `pickNewTabTile`), not by reloading.

## Docs screenshots

`scripts/screenshots.spec.ts` captures the four committed PNGs in
`docs/static/img/screenshots/` (1600×803 CSS px, saved at 2x). The config
excludes it unless `DOCS_SCREENSHOTS=1`; run `npm run screenshots` in
`docs/videos` when the UI they show changes.

## Selector dependencies

Videos depend on frontend selectors like E2E, but nothing gates them on PRs - they
break at docs-deploy time. Load-bearing selectors are in `helpers/video-helpers.ts`
(`.p-splitter`, `.tab-loading`, `.model-card`, `.model-card-thumbnail img`,
`.dock-add-button`, `.newtab-tile`) and
per-spec (e.g. `.texture-set-card`, `.list-toolbar`); when renaming such
classes/testids in `src/frontend`, grep `docs/videos/` too and prefer role/testid.

## Adding a new feature video

Manifest entry in `video-manifest.js`; a `scripts/<slug>.spec.ts` (provision via
API → `navigateTo` → assert ready → `startFeatureRecording` → beats →
`holdOn` → `stopFeatureRecording`); a `generate:<slug>` script in `docs/videos/package.json`;
embed the standard `<video>` block and remove the page's placeholder note.

## Failure triage

`missing` (spec crashed - run it alone with `--grep`), `black-video` (app never
rendered), `frozen-tail` (>4s tail survived trim - hung final beat),
`over-max-duration` (tighten or raise), a loader or fade still visible (wrap
the wait in `cutUntil`), a cropped dialog (framed mid-animation or before it
grew - frame it again). Judge every change by extracting frames from
`.generated/final/`, not only by the gate.

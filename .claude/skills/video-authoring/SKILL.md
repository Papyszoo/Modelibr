---
name: video-authoring
description: Authoring Modelibr docs feature videos - the record→trim→analyze→collect pipeline, choreography best practices (provision off-camera, show outcomes, cursor overlay, pacing), duration-cap semantics, selector dependencies on the frontend. Use when creating or editing anything under docs/videos (specs, helpers, manifest, pipeline scripts) or when a docs video looks wrong/fails to generate.
---

# Docs video authoring (Playwright screencast)

Feature videos embedded in `docs/docs/features/*.md`. Rendered **locally on a GPU
machine and published straight to the docs asset host** - workflows never render
or commit them; pages reference `/videos/…`. Release procedure: `release-workflow`.

```bash
npm run videos:generate                             # full: e2e stack → all videos → teardown
cd docs/videos && npm run generate:texture-sets     # one feature, stack already up
```

## Pipeline (run-videos.js): clean → record → trim → analyze → collect

1. **Record** - each `scripts/<slug>.spec.ts` drives the app against the E2E
   Docker stack (`FRONTEND_URL` :3002, `API_BASE_URL` :8090) and writes raw webm
   via `page.screencast` to `.generated/raw/`.
2. **Trim** (`trim-videos.js`) - cuts **frozen tails only** (freeze-detect →
   `recommendedEnd`). It NEVER cuts content to the duration cap; a cap-trim chops
   the demo mid-action.
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
GPU) does `videos:generate` then this gate at `--complete`. A partial re-render
(`generate:sprites`) rewrites the report with only that slug, so older valid clips
are flagged _not covered by the latest analysis run_ (warning; failure under
`--complete`).

## Choreography rules

1. **Provision off-camera, demo on-camera.** All setup (API uploads,
   `clearAllData`, waiting for thumbnails) happens BEFORE `startFeatureRecording`;
   wait for artifacts via API/`waitForThumbnails`.
2. **Show outcomes.** After every screen-changing click, hold to read the result
   (`mediumPause`/`longPause` at payoffs). End on the hero state ~1s.
3. **Move the mouse like a human.** `humanClick`/`smoothMoveTo`/`smoothDrag` -
   never bare `locator.click()`. `navigateTo()` auto-installs the cursor overlay.
4. **One storyline per video**, 3–5 beats (open → core workflow → payoff);
   interact with the subject (orbit/play/switch) - a static screen reads as broken.
5. **Chapter card first.** `startFeatureRecording` shows the manifest
   title/description; keep them accurate - they are on-screen copy.
6. **Deterministic waits before recording, visual pacing during.** Inside the
   recording, `viewerPause` is choreography, not test waiting; use
   `expect(...).toBeVisible` to sync between beats.

## Recording mechanics

- `page.screencast.start({ path, size: 1280×720, quality: 90 })`,
  `showChapter(title, {description})`, `showActions()`, `showOverlay(html)`, `stop()`.
- Pacing helpers scale by `videoPaceFactor` (0.65) - tune the factor, not sleeps.
- `navigateTo(page, path)` seeds tab layout via `leftTabs`/`rightTabs` URL params,
  waits for `.p-splitter` + tab loading, installs the overlay.
- `disableHighlights(page)` after navigation kills action highlight borders.

## Selector dependencies

Videos depend on frontend selectors like E2E, but nothing gates them on PRs - they
break at docs-deploy time. Load-bearing selectors are in `helpers/video-helpers.ts`
(`.p-splitter`, `.tab-loading`, `.model-card`, `.model-card-thumbnail img`) and
per-spec (e.g. `.texture-set-card`, `.list-toolbar`); when renaming such
classes/testids in `src/frontend`, grep `docs/videos/` too and prefer role/testid.

## Adding a new feature video

Manifest entry in `video-manifest.js`; a `scripts/<slug>.spec.ts` (provision via
API → `navigateTo` → assert ready → `startFeatureRecording` → beats →
`stopFeatureRecording`); a `generate:<slug>` script in `docs/videos/package.json`;
embed the standard `<video>` block and remove the page's placeholder note.

## Failure triage

`missing` (spec crashed - run it alone with `--grep`), `black-video` (app never
rendered), `frozen-tail` (>4s tail survived trim - hung final beat),
`over-max-duration` (tighten or raise), ends mid-action (check `recommendedEnd`).

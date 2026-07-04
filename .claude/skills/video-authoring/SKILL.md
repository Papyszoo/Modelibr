---
name: video-authoring
description: Authoring Modelibr docs feature videos — the record→trim→analyze→collect pipeline, choreography best practices (provision off-camera, show outcomes, cursor overlay, pacing), duration-cap semantics, selector dependencies on the frontend. Use when creating or editing anything under docs/videos (specs, helpers, manifest, pipeline scripts) or when a docs video looks wrong/fails to generate.
---

# Docs video authoring (Playwright screencast)

Feature videos embedded in `docs/docs/features/*.md`. Generated in CI on every
docs build (never committed — see the no-committed-binaries rule); regenerate
locally with one command from the repo root:

```bash
npm run videos:generate                       # full: e2e stack up → all videos → teardown
# or, with the e2e stack already running (tests/e2e npm run test:setup):
cd docs/videos && npm run generate:texture-sets   # one feature (see package.json for all)
```

## Pipeline (run-videos.js)

`clean → playwright record → trim → analyze → collect`

1. **Record** — each `scripts/<slug>.spec.ts` drives the app against the E2E
   Docker stack (`FRONTEND_URL` :3002, `API_BASE_URL` :8090) and writes a raw
   webm via `page.screencast` to `.generated/raw/`.
2. **Trim** (`trim-videos.js`) — cuts **frozen tails only** (freeze-detect →
   `recommendedEnd`). It NEVER cuts content to the duration cap; a cap-trim
   chops the demo mid-action (this was a real bug — texture-sets shipped
   truncated at exactly its 20s cap).
3. **Analyze** (`analyze-videos.js`) — the QA gate. Fails on: missing,
   unreadable, ≥85% black, frozen tail ≥4s, or **duration > manifest cap**.
4. **Collect** — approved videos land in `docs/static/videos/`.

Reports: `.generated/reports/raw-video-analysis.json` + `final-video-analysis.json`
(durations, freeze/black segments, per-video issues) — start there when a video
fails or looks wrong.

## Duration caps (video-manifest.js)

`maxDurationSeconds` is a **QA ceiling with CI headroom, not a target**.
Choreograph for roughly **60–70% of the cap** on a fast local machine — CI
renders without GPU and runs visibly slower, and the fixed-length pauses don't
shrink. If analyze fails `over-max-duration`: tighten the choreography first;
raise the cap only for a deliberate reason (and keep the manifest comment true).

## Choreography rules — what makes a good feature video

1. **Provision off-camera, demo on-camera.** All data setup (API uploads,
   `clearAllData`, waiting for thumbnails) happens BEFORE
   `startFeatureRecording`. Screen time is for the feature, never for loading.
   If the demo needs generated artifacts (thumbnails, waveforms), wait for them
   via API/`waitForThumbnails` pre-recording.
2. **Show outcomes, not just actions.** After every click that changes the
   screen, hold long enough to read the result (`mediumPause`/`longPause` at
   payoffs). End on the feature's "hero state" and hold ~1s — the tail-freeze
   trim keeps it tight.
3. **Move the mouse like a human.** Use `humanClick`/`smoothMoveTo`/
   `smoothDrag` — never bare `locator.click()`, which teleports. A synthetic
   cursor overlay is auto-installed by `navigateTo()` (Playwright screencast
   does not render the OS pointer; without the overlay every movement is
   invisible).
4. **One storyline per video.** A video answers "what does this feature do",
   not "what does every button do". 3–5 beats: open → core workflow → payoff.
   Anything more belongs in the written doc.
5. **Interact with the subject matter.** Orbit the 3D preview (`smoothDrag` on
   the canvas), play the sound, switch the variant — a static screen of a
   visual product reads as broken.
6. **Chapter card first.** `startFeatureRecording` shows the manifest
   title/description as an overlay; keep manifest descriptions accurate — they
   are on-screen copy.
7. **Deterministic waits before recording, visual pacing during.** Inside the
   recording, `viewerPause`-style timing is fine (it's choreography, not test
   waiting — rule 4 of the testing rules doesn't apply here). Assertions on
   app state (`expect(...).toBeVisible`) are still the way to sync with the
   app between beats.

## Recording mechanics

- `page.screencast.start({ path, size: 1280×720, quality: 90 })`,
  `showChapter(title, {description})`, `showActions()` captions (top-right),
  `showOverlay(html)` for custom callouts, `stop()`.
- Pacing helpers scale by `videoPaceFactor` (0.65) — tune the factor, not
  individual sleeps.
- `navigateTo(page, path)` — seeds tab layout via `leftTabs`/`rightTabs` URL
  params (translated into the navigation store), waits for `.p-splitter` +
  tab loading to settle, and installs the cursor overlay.
- `disableHighlights(page)` after navigation kills Playwright's action
  highlight borders.

## Selector dependencies — check on frontend changes

Videos depend on frontend selectors just like E2E does, but nothing gates them
on PRs — they break at docs-deploy time. Load-bearing selectors live in
`helpers/video-helpers.ts` (`.p-splitter`, `.tab-loading`, `.model-card`,
`.model-card-thumbnail img`) and per-spec (e.g. `.texture-set-card`,
`.list-toolbar`, `.texture-preview-canvas`, `.files-tab`,
`.file-mapping-card`). When renaming such classes/testids in
`src/frontend`, grep `docs/videos/` too — and prefer the same selector policy
as `e2e-authoring` (role/testid over CSS classes) when touching specs.

## Adding a new feature video

1. Add a manifest entry (slug, outputName, on-screen title/description,
   realistic cap) in `video-manifest.js`.
2. Add `scripts/<slug>.spec.ts` following an existing spec (provision via API →
   `navigateTo` → assert page ready → `startFeatureRecording` → beats →
   `stopFeatureRecording`).
3. Add a `generate:<slug>` script to `docs/videos/package.json`
   (`node run-videos.js --grep "<Title>" --slugs <slug>`).
4. Embed in the feature doc with the standard `<video>` block (see any
   `docs/docs/features/*.md`) and remove that page's "video placeholder" note.
5. Verify locally: `npm run generate:<slug>` with the e2e stack up, then check
   `.generated/reports/final-video-analysis.json` and watch the collected file
   in `docs/static/videos/`.

## Failure triage

| Symptom | Meaning |
| --- | --- |
| `missing` | Spec crashed before/during recording — run the spec alone with `--grep`, read Playwright output |
| `black-video` | App never rendered (stack down, wrong URL, WebGL failure) |
| `frozen-tail` | >4s static tail survived trim — usually a hung final beat |
| `over-max-duration` | Choreography too long for the cap — tighten or raise deliberately |
| Video ends mid-action | Must not happen anymore (cap-trim removed); if seen, check `recommendedEnd` in the report for a false freeze detection |

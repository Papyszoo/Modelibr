# Modelibr Documentation Video Generation

Playwright scripts that generate demo videos for the Docusaurus documentation site.

> **Videos are rendered locally, not in CI.** GitHub runners have no GPU, so the
> WebGL clips flake under software rendering - that lane blocked the docs deploy
> for several releases before it was removed in 0.5.2. Rendering now happens on a
> machine with a GPU and publishes straight to the site's `/videos/` path.
>
> Videos are **not** committed to the repository, and CI neither renders nor
> fetches them. The docs bundle CI builds does not contain them; the pages
> reference them by absolute `/videos/…` URL, which resolves against that
> separate publish.

## Where this runs

```text
local GPU machine                          CI
─────────────────                          ──
npm run videos:generate                    builds the docs-site artifact
  clean → record → edit → analyze          (no videos in it)
  → collect to docs/static/videos/
npm run videos:verify -- --complete
npm run videos:publish  ──────────────►  site /videos/   (published separately,
                                          and protected from the docs sync's
                                          --delete, so neither clobbers the other)
```

The `docs-videos` suite in `npm run test:all` (slow tier) runs the same generate
pipeline against current code, which is the only automated exercise the video
specs get now that CI does not touch them.

## Local Development

To generate videos locally for testing:

```bash
# 1. Start E2E services
docker compose -f tests/e2e/docker-compose.e2e.yml up -d --build

# 2. Wait for health checks
curl http://localhost:8090/health

# 3. Generate videos
cd docs/videos
npm ci
npx playwright install --with-deps chromium
npm run generate

# 4. Final videos are collected to docs/static/videos/ automatically
```

### Generate individual feature videos

```bash
npm run generate:models        # Model Management
npm run generate:texture-sets  # Texture Sets
npm run generate:recycled      # Recycled Files
npm run generate:ui            # User Interface
npm run generate:sprites       # Sprites
npm run generate:sounds        # Sounds
npm run generate:projects      # Projects
npm run generate:packs         # Packs
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `FRONTEND_URL` | `http://localhost:3002` | Frontend URL (E2E Docker) |
| `API_BASE_URL` | `http://localhost:8090` | Backend API URL (E2E Docker) |

## Video Specs

- **Recording**: 1280×720 CSS px at device scale 2 (2560×1440 screencast), so
  zoomed text stays sharp
- **Output**: 1920×1080 WebM (VP9), no audio
- **Browser**: full Chromium in new-headless mode, so WebGL runs on the GPU
  (`VIDEO_SOFTWARE_GL=1` forces SwiftShader to reproduce a GPU-less machine)
- **Recorder**: Playwright `page.screencast`, with one recording cursor and the
  app's focus rings and tooltips hidden (recording-only CSS); no Playwright
  action overlay
- **Post-processing**: dead time compressed, loaders cut, eased camera
  zoom/pan, step captions in the app's own colours (`video-polish.js`)

## Pipeline stages

`npm run generate` runs the full docs-video pipeline:

1. `clean-videos.js` clears raw, final, report, and collected outputs.
2. Playwright runs the feature specs and writes raw screencasts plus a
   `<slug>.timeline.json` (camera targets, captions, cut spans, final hold)
   and caption PNGs to `.generated/raw/`.
3. `trim-videos.js` edits each clip with `video-polish.js`: stretches where
   nothing moves are shortened, spans the spec marked off camera are cut, the
   camera eases between the regions the spec framed, and captions are faded
   in. The opening shot, each caption's reading time and the final hold are
   protected.
4. `analyze-videos.js` rejects missing, black, unreadable, frozen-tail, or over-max artifacts.
5. `collect-videos.js` copies approved outputs into `docs/static/videos/`.

`verify-videos.js` re-checks that collected set later, without re-rendering
anything - the same manifest caps and analysis report, applied to whatever is on
disk now:

```bash
npm run videos:verify                # from the repo root
npm run videos:verify -- --complete  # publish strictness: the whole set must be present
```

The whole pipeline (render + this gate) also runs as the `docs-videos` suite in
`npm run test:all` (slow tier), which is what checks the specs still work against
the current frontend.

### Docs screenshots

The four PNGs in `docs/static/img/screenshots/` come from
`scripts/screenshots.spec.ts`, using the same data helpers, at 2x. They are
committed, so the Playwright config skips that spec unless `DOCS_SCREENSHOTS=1`;
re-capture them when the UI they show changes:

```bash
npm run screenshots   # stack already up
```

Generated working files live under:

- `.generated/raw/`
- `.generated/final/`
- `.generated/reports/`

## Script Structure

```text
docs/videos/
├── playwright.config.ts      # Playwright test config
├── package.json              # Scripts and dependencies
├── run-videos.js             # clean -> record -> edit -> analyze -> collect
├── video-manifest.js         # canonical video list + duration caps
├── video-paths.js            # raw/final/report/static output paths
├── trim-videos.js            # edit stage: runs video-polish.js per clip
├── video-polish.js           # dead-time cuts, camera, captions (ffmpeg)
├── analyze-videos.js         # final QA gate (inside a render run)
├── verify-videos.js          # re-check the collected set later (test:all + publish)
├── collect-videos.js         # copy final videos to static/
├── helpers/
│   ├── video-helpers.ts      # navigation, cursor, glides, camera/caption timeline
│   └── demo-art.ts           # deterministic demo sprites, covers, sounds, materials
└── scripts/
    ├── model-management.spec.ts
    ├── texture-sets.spec.ts
    ├── recycled-files.spec.ts
    ├── user-interface.spec.ts
    ├── sprites.spec.ts
    ├── sounds.spec.ts
    ├── projects.spec.ts
    ├── packs.spec.ts
    └── screenshots.spec.ts   # docs screenshots (npm run screenshots)
```

## Output

Videos are embedded in Docusaurus feature pages at `docs/docs/features/*.md` using:

```html
<video controls width="100%" autoplay muted loop>
    <source src="/videos/{feature}.webm" type="video/webm" />
</video>
```

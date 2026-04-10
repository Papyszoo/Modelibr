# Modelibr Documentation Video Generation

Playwright scripts that generate demo videos for the Docusaurus documentation site.

> **Videos are generated automatically in CI.** The `generate-videos` job in the
> GitHub Actions workflow spins up the E2E Docker environment, runs the full
> screencast pipeline, and includes the finished demo videos in the Docusaurus build
> for every workflow run (`push`, `pull_request`, and `workflow_dispatch`).
>
> Videos are **not** committed to the repository — they are generated fresh for each CI docs build.

## CI Pipeline

The video generation is part of `ci-and-deploy.yml`:

```text
e2e-tests ──► generate-videos ──► build-docs ──► deploy-docs
                    │                   │
                    │   ┌───────────────┘
                    │   │ downloads final video artifact
                    │   │ places in docs/static/videos/
                    ▼   ▼
       uploads analyzed .webm   builds Docusaurus
          as artifact           with videos included
```

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
npx playwright install chromium
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

- **Resolution**: 1280×720
- **Format**: WebM
- **Browser**: Chromium (dark color scheme)
- **Recorder**: Playwright `page.screencast`
- **Post-processing**: automatic trim, artifact analysis, and collection

## Pipeline stages

`npm run generate` runs the full docs-video pipeline:

1. `clean-videos.js` clears raw, final, report, and collected outputs.
2. Playwright runs the feature specs and writes raw screencasts to `.generated/raw/`.
3. `trim-videos.js` trims clips to their manifest cap or earlier recommended end.
4. `analyze-videos.js` rejects missing, black, unreadable, frozen-tail, or over-max artifacts.
5. `collect-videos.js` copies approved outputs into `docs/static/videos/`.

Generated working files live under:

- `.generated/raw/`
- `.generated/final/`
- `.generated/reports/`

## Script Structure

```text
docs/videos/
├── playwright.config.ts      # Playwright test config
├── package.json              # Scripts and dependencies
├── run-videos.js             # clean -> record -> trim -> analyze -> collect
├── video-manifest.js         # canonical video list + duration caps
├── video-paths.js            # raw/final/report/static output paths
├── trim-videos.js            # ffmpeg-based trimming
├── analyze-videos.js         # final QA gate
├── collect-videos.js         # copy final videos to static/
├── helpers/
│   └── video-helpers.ts      # Shared navigation, pacing, and screencast helpers
└── scripts/
    ├── model-management.spec.ts
    ├── texture-sets.spec.ts
    ├── recycled-files.spec.ts
    ├── user-interface.spec.ts
    ├── sprites.spec.ts
    ├── sounds.spec.ts
    ├── projects.spec.ts
    └── packs.spec.ts
```

## Output

Videos are embedded in Docusaurus feature pages at `docs/docs/features/*.md` using:

```html
<video controls width="100%" autoplay muted loop>
    <source src="/Modelibr/videos/{feature}.webm" type="video/webm" />
</video>
```

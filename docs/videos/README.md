# Modelibr Documentation Video Generation

Playwright scripts that generate demo videos for the Docusaurus documentation site.

> **Videos are generated automatically in CI.** The `generate-videos` job in the GitHub Actions
> workflow spins up the E2E Docker environment, runs Playwright scripts to record demo videos,
> and includes them in the Docusaurus build before deploying to GitHub Pages.
>
> Videos are **not** committed to the repository — they are generated fresh on every CI run.

## CI Pipeline

The video generation is part of `ci-and-deploy.yml`:

```
e2e-tests ──► generate-videos ──► build-docs ──► deploy-docs
                    │                   │
                    │   ┌───────────────┘
                    │   │ downloads video artifact
                    │   │ places in docs/static/videos/
                    ▼   ▼
              uploads .webm    builds Docusaurus
              as artifact      with videos included
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
npm install
npx playwright install chromium
npm run generate

# 4. Videos are collected to docs/static/videos/ automatically
```

### Generate individual feature videos

```bash
npm run generate:models     # Model Management
npm run generate:recycled   # Recycled Files
npm run generate:ui         # User Interface
npm run generate:sprites    # Sprites
npm run generate:sounds     # Sounds
npm run generate:projects   # Projects
npm run generate:packs      # Packs
```

## Configuration

| Variable       | Default                 | Description                  |
| -------------- | ----------------------- | ---------------------------- |
| `FRONTEND_URL` | `http://localhost:3002` | Frontend URL (E2E Docker)    |
| `API_BASE_URL` | `http://localhost:8090` | Backend API URL (E2E Docker) |

## Video Specs

- **Resolution**: 1280×720
- **Format**: WebM (Playwright default)
- **Browser**: Chromium (dark color scheme)
- **No blue border**: Playwright highlights are disabled via CSS injection

## Script Structure

```
docs/videos/
├── playwright.config.ts      # Playwright config (video recording on)
├── package.json              # Scripts and dependencies
├── collect-videos.js         # Copy videos to static/
├── helpers/
│   └── video-helpers.ts      # Shared utilities (timing, mouse, navigation)
└── scripts/
    ├── model-management.spec.ts
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

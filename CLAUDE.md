# Modelibr — agent guide

Self-hosted, **local-first** game-asset library (3D models, textures, sounds,
sprites, env maps) for artists and game developers. Runs and stores everything
locally; core behavior must never depend on hosted services.

## Stack & layout

- `src/Domain|Application|Infrastructure|WebApi|SharedKernel` — .NET 9 Web API,
  Clean Architecture + DDD, CQRS, PostgreSQL (EF Core).
- `src/frontend` — React + TypeScript + Vite; React Query + Zustand; Jest.
- `src/asset-processor` — Node.js worker (thumbnails/renders via Puppeteer +
  Three.js + Blender CLI); Vitest.
- `src/desktop` (branch `feat/tray-host`) — Electron tray host + installers.
- `tests/` — xUnit projects, `tests/e2e` (Playwright-BDD), `tests/backup-restore-e2e`.
- Orchestration: Docker Compose (root `docker-compose.yml`; e2e has its own).

**Domain-specific conventions live in skills** (auto-loaded when relevant):
`backend-patterns`, `frontend-patterns`, `asset-processor-patterns`,
`e2e-authoring`, `test-triage`. Skills are canonical agent docs — there is no
parallel "AI documentation" set. **If a skill claim contradicts the code, trust
the code and fix the skill in the same session.**

## Commits, branches, releases

- Conventional commits (`feat(scope): …`, `fix(e2e): …`); **never add AI
  co-author trailers**.
- PRs target the current **version branch**, not `main`. The version branch
  merges to `main` only when cutting a release — `main` represents released
  versions. Rationale: installed apps auto-update via electron-updater from
  releases; keep release cadence low so users aren't prompted every few days.

## Invariants

- Local-first: no hosted AI/inference, no CDN-only runtime deps, processing
  pipelines work offline.
- Env config flows through root `.env` (+ `.env.example`); demo build uses
  `src/frontend/.env.demo`.
- Frontend HTTP only via feature `api/` modules on `lib/apiBase.ts` (axios);
  React Query = server state, Zustand = UI state, `useState` = ephemeral only.
- PostgreSQL behavior is the baseline for app and test decisions.

## Verification — run before claiming done

| Layer touched | Command |
|---|---|
| Backend | `dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"` |
| Frontend | `cd src/frontend && npm test && npm run lint && npm run format:check && npm run build` |
| Worker | `cd src/asset-processor && npm test && npm run lint && npm run format:check` |
| UI-visible behavior | the affected E2E scope (see testing rules below) |
| Anything broad | `npm run test:all -- --only=<suite,...> --yes --no-open` |

`npm run format:check` (Prettier) is a **required** CI gate and is **not**
covered by `npm run lint`: ESLint's `prettier/prettier` rule only runs on the
files ESLint lints (`**/*.js[x]`/`.ts[x]`, and `tests/` is eslint-ignored), so
formatting drift in Markdown/JSON/CSS/etc. passes lint locally but fails CI. Run
`npm run format` to auto-fix.

Never finish with known-failing checks; if a failure is environmental, say so
explicitly instead of claiming verified.

## Change ripples — check these when you change…

- **Backend API/DTO shape** → frontend feature `api/` modules, demo MSW handlers
  (`src/frontend/src/mocks/`), worker `JobApiClient` (if thumbnail-job related).
- **User-visible UI behavior** → E2E scenarios + page objects, demo mode
  (`build:demo`), feature docs (`docs/docs/features/*.md`), video scripts under
  `docs/videos/`, and the orphaned suites (rule 10 below).
- **Env/config/build paths** → `.env.example`, `.env.demo`, typed env files,
  GitHub workflows.

## Working with tests

Manifest = single source of truth: `scripts/test-runner/suites.config.mjs`.
Browse/run everything via Test Studio (`npm run test:site`); runner:
`npm run test:all` / `test:all:fast` / `test:all:full`; drift check:
`npm run test:audit`. Artifacts: `test-report/` (logs, summary.json,
history.jsonl) — full map in the `test-triage` skill.

1. **Never weaken a test to make it pass.** No deleted assertions, no blanket
   try/catch, no `.skip` without a comment naming why and who un-skips it. If a
   test is wrong, fix it and say so explicitly.
2. **Verify narrowly first, then the affected suite.** dotnet
   `--filter "FullyQualifiedName~X"`, jest/vitest `-t "name"`, playwright
   `--grep "scenario"`. Report actual output, not expectations.
3. **Tags decide CI lanes — tag honestly.** Untagged E2E = every PR; `@slow` =
   nightly; `@serial` = local-only (never GitHub); `@performance` = opt-in.
   Tagging to dodge a flake silently removes PR protection — root-cause comment
   required.
4. **Don't fix flakes with timeouts.** Known flake classes: virtualized-grid
   waits, asset-processor contention, shared-DB state. A raised timeout needs a
   comment saying what it absorbs.
5. **Features ship with tests** — xUnit / Jest / Gherkin scenario in the right
   `tests/e2e/features/` folder, following neighbors' conventions.
6. **Scenario names are stable identifiers** (grep keys + timing history).
7. **New suites go in the manifest**; `npm run test:audit` stays green.
8. **Suites are self-contained** — bring environment up, tear it down, leading
   silent teardown for crash leftovers (follow existing command patterns).
9. **Triage before touching code** — use `test-triage`; rule out environment
   (Docker/colima resources, buildx, stale containers) and check
   `history.jsonl` for "did this ever pass".
10. **UI redesigns must update the non-gating suites** — `backup-restore` and
    `storybook-visual` don't block PRs and have silently rotted before; grep
    their specs when changing Settings or shared UI.

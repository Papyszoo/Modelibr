# Modelibr - agent guide

Self-hosted, **local-first** game-asset library (3D models, textures, sounds,
sprites, env maps) for artists and game developers. Runs and stores everything
locally; core behavior must never depend on hosted services.

This file is the single instruction set for every agent working in this repo.
`CLAUDE.md` imports it; Codex and Antigravity read it directly.

## Where knowledge lives

- **`.claude/skills/`** - committed, domain-specific conventions, loaded on
  demand. Backend: `backend-patterns`, `backend-persistence`. Frontend:
  `frontend-patterns`, `design-tokens`, `ui-primitives`, `primereact-traps`,
  `storybook-stories`, `frontend-test-authoring`. Elsewhere:
  `asset-processor-patterns`, `webdav-patterns`, `e2e-authoring`, `test-triage`,
  `video-authoring`, `release-workflow`, `skill-authoring`.
  Skills are canonical agent docs - there is no parallel "AI documentation" set.
  **If a skill claim contradicts the code, trust the code and fix the skill in the
  same session.** Keep each skill near one screen (~90 lines); when one outgrows
  that, **split it into a narrower skill rather than deleting content.**
- **`.claude/notes/`** - committed engineering context: design rationale, failure
  modes, incident write-ups, what's already been ruled out. Start at
  `.claude/notes/MEMORY.md` (the index). Record durable findings there as you work.
- **`.claude/agents/`** - committed subagent definitions (below).
- **`.claude/prompts/`** - the roadmap. **Git-ignored and local only**, so don't
  cite paths inside it in committed files. `report.md` ranks the backlog;
  `v{version}/` holds the active release queue.

### This repository is PUBLIC - mind what you commit

`.claude/notes/` and `.claude/skills/` ship to GitHub. Never put into them:
machine-specific setup (local Docker/VM config, personal scripts, host paths),
production infrastructure (server addresses, credentials, deploy specifics),
business decisions (pricing, payment providers), unreleased roadmap, or pointers
into gitignored paths. That material goes in the maintainer's private agent
memory instead. When unsure, leave it out - impossible to un-publish.

## Subagents - use them to keep the main context clean

Defined in `.claude/agents/`. Two kinds:

- **Domain implementers** - `backend-dev`, `frontend-dev`, `worker-dev`,
  `e2e-author`. They load their convention skills in their own context and return
  a summary. Delegate a **scoped, well-specified** change. Don't delegate work
  that needs live iteration with the user, spans two runtimes at once, or requires
  a new shared primitive (that needs standardize-first sign-off here first).
- **Verdict returners** - `suite-runner` (runs suites), `failure-triage`
  (diagnoses a red suite). These exist to keep thousands of lines of log and
  Playwright output out of this conversation. Prefer them whenever the useful
  output is a conclusion rather than the raw text.

A subagent starts cold and re-derives repo context, so it is not free - the win
is when its skill bodies and its output would both have landed here otherwise.

## Session state - write it down, don't rely on chat history

**Keep `.claude/prompts/v{version}/` current as work progresses** - decisions,
what's done, what's uncommitted, findings, next steps. The user resumes from these
files, not from conversation history, because replaying a long session wastes
tokens. Update at natural checkpoints, not just at the end. Keep it **terse** -
bullets and pointers, not prose. Delete a prompt file when its work ships.

The version dir matches the active version branch (work on `version/0.5` →
`.claude/prompts/v0.5/`).

## Commits, branches, releases

Full conventions in the `release-workflow` skill. The hard rules:

- **Conventional commits** (`feat(scope): …`, `fix(e2e): …`).
- **Never add AI attribution to git artifacts** - no `Co-Authored-By:` trailer on
  commits, and no "Generated with Claude Code" (or similar) footer on PR bodies.
- **Nothing goes directly to `main`.** Changes reach `main` only through the
  version-branch → `main` release merge. This holds for CI-only files too
  (workflows, `tests/` tooling), not just app code - even when a workflow needs to
  be on the default branch to be dispatchable. PRs target the current **version
  branch**.
- Rationale: `main` represents released versions, and installed apps auto-update
  via electron-updater from releases - keep the release cadence low so users
  aren't prompted every few days.

## Working style

- **Batch work into feature-sized PRs.** The user dislikes small stacked PRs - he
  wants to test a complete, user-visible feature in one branch rather than
  context-switch per slice. Fold prerequisite fixes into the feature branch unless
  they're urgent on their own, and **deliver a change checklist with the PR** so he
  can test it.
- **Standardize before building.** Don't rush to implementation on shared UI or
  behavior: search the primitive catalog, grow a primitive over forking it, and if
  nothing fits, **stop and propose** (API sketch, existing adopters, which queued
  prompts reuse or strain it, explicit non-goals) and get sign-off. Protocol at the
  top of the `ui-primitives` skill.
- **Keep sessions economical.** Launch slow operations (docker builds, e2e, video
  generation) in the background and keep working rather than blocking on them.
  Timebox reproduction - if a repro gives the same result 2–3 times, stop and ask
  for the missing detail. Don't re-read screenshots; read once and extract.

## Invariants

- **Local-first:** no hosted AI/inference, no CDN-only runtime deps, processing
  pipelines work offline.
- Env config flows through root `.env` (+ `.env.example`); demo build uses
  `src/frontend/.env.demo`.
- Frontend HTTP only via feature `api/` modules on `lib/apiBase.ts` (axios);
  React Query = server state, Zustand = UI state, `useState` = ephemeral only.
- PostgreSQL behavior is the baseline for app and test decisions.
- **Tag vocabularies are strictly per asset type** - and Global Materials
  (Universal) vs Multi-Model Textures (ModelSpecific) are _separate types_ despite
  sharing a grid. Never merge or share vocabularies "to simplify".
- **Don't commit large generated binaries.** Docs videos, visual-test baselines and
  similar artifacts are generated in CI or locally and git-ignored - everyone who
  clones pays for committed blobs forever. If a CI generator is render-flaky, make
  the CI step resilient (retry) rather than checking the output in.
- **Never name the user's local machine or hardware in public content** - PR
  bodies, commit messages, code comments, workflow YAML, repo docs. Say "the local
  GPU lane" or "a local machine with a GPU". His local setup is deliberately
  separate from the public repo.

## Verification - run before claiming done

| Layer touched                       | Command                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Backend                             | `dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"`          |
| Frontend                            | `cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`                       |
| Worker                              | `cd src/asset-processor && npm test && npm run lint && npm run format:check`                                 |
| UI-visible behavior                 | the affected E2E scope (see testing rules below)                                                             |
| Docs site / README / formats / tabs | `npm run docs:audit` (CI-gated; checks docs against FileType registry, TabType union, ports, video manifest) |
| Anything broad                      | `npm run test:all -- --only=<suite,...> --yes --no-open`                                                     |

`npm run format:check` (Prettier) is a **required** CI gate and is **not**
covered by `npm run lint`: ESLint's `prettier/prettier` rule only runs on the
files ESLint lints (`**/*.js[x]`/`.ts[x]`, and `tests/` is eslint-ignored), so
formatting drift in Markdown/JSON/CSS/etc. passes lint locally but fails CI. Run
`npm run format` to auto-fix.

Never finish with known-failing checks; if a failure is environmental, say so
explicitly instead of claiming verified.

## Change ripples - check these when you change…

- **Backend API/DTO shape** → frontend feature `api/` modules, demo MSW handlers
  (`src/frontend/src/mocks/`), worker `JobApiClient` (if thumbnail-job related).
- **A new endpoint the frontend calls** → a demo MSW handler, in the same change.
  `onUnhandledRequest` is `bypass`, so an unmocked call reaches the static demo
  server and returns HTML; a component that reads a field off it throws during
  render and unmounts the page around it. No unit test can see this - they all
  mock the `api/` module - and the demo E2E project is what catches it.
- **User-visible UI behavior** → E2E scenarios + page objects, demo mode
  (`build:demo`), feature docs (`docs/docs/features/*.md`), video scripts under
  `docs/videos/`, and the orphaned suites (rule 10 below).
- **Env/config/build paths** → `.env.example`, `.env.demo`, typed env files,
  GitHub workflows.
- **Supported formats, tab types, ports** → feature docs + README;
  `npm run docs:audit` fails CI on drift (extend the audit when adding new
  machine-checkable doc facts).
- **A new tab type** → six places: `ui.ts`, `TabContent`, `NewTabPage` TILES +
  icons, `DraggableTab`, `navigationStore` label, and **both** `tabSerialization`
  allowlists.

## Working with tests

Manifest = single source of truth: `scripts/test-runner/suites.config.mjs`.
Browse/run everything via Test Studio (`npm run test:site`); runner:
`npm run test:all` / `test:all:fast` / `test:all:full`; drift check:
`npm run test:audit`. Artifacts: `test-report/` (logs, summary.json,
history.jsonl) - full map in the `test-triage` skill.

1. **Never weaken a test to make it pass.** No deleted assertions, no blanket
   try/catch, no `.skip` without a comment naming why and who un-skips it. If a
   test is wrong, fix it and say so explicitly.
2. **Verify narrowly first, then the affected suite.** dotnet
   `--filter "FullyQualifiedName~X"`, jest/vitest `-t "name"`, playwright
   `--grep "scenario"`. Report actual output, not expectations.
3. **Tags decide CI lanes - tag honestly.** Untagged E2E = every PR; `@slow` =
   nightly; `@serial` = local-only (never GitHub); `@performance` = opt-in.
   Tagging to dodge a flake silently removes PR protection - root-cause comment
   required.
4. **Don't fix flakes with timeouts.** Known flake classes: virtualized-grid
   waits, asset-processor contention, shared-DB state. A raised timeout needs a
   comment saying what it absorbs.
5. **Features ship with tests** - xUnit / Jest / Gherkin scenario in the right
   `tests/e2e/features/` folder, following neighbors' conventions.
6. **Scenario names are stable identifiers** (grep keys + timing history).
7. **New suites go in the manifest**; `npm run test:audit` stays green.
8. **Suites are self-contained** - bring environment up, tear it down, leading
   silent teardown for crash leftovers (follow existing command patterns).
9. **Triage before touching code** - use `test-triage`; rule out environment
   (Docker/colima resources, buildx, stale containers) and check
   `history.jsonl` for "did this ever pass".
10. **UI redesigns must update the non-gating suites** - `backup-restore` and
    `storybook-visual` don't block PRs and have silently rotted before; grep
    their specs when changing Settings or shared UI.
11. **Isolated e2e runs are not sufficient.** `--no-deps` single-worker runs hide
    failures that only the full parallel suite produces (accumulated state, upload
    panel overlaying cards, viewer starvation). **Run `run-e2e.js` before claiming
    e2e green.** For backend-wide refactors, run the fast e2e lane locally _before_
    opening the PR - mocked unit tests cannot see the regression classes those
    produce.

# Modelibr AI Orchestrator

This file is the single workflow source of truth for repository AI work.
Keep orchestration here.
Keep implementation patterns in scoped files under `.github/instructions/`.
Keep focused delegation logic in `.github/agents/`.

## Project Baseline

Modelibr is a self-hosted game asset library for artists and game developers.
It runs locally, stores assets locally, and must not depend on remote runtime services for core product behavior.

- Backend: .NET 9.0 Web API using Clean Architecture and DDD
- Frontend: React + TypeScript
- Worker: Node.js asset processor under `src/asset-processor/`
- Blender integration: Python addon plus Blender CLI workflow
- Database: PostgreSQL
- Orchestration: Docker Compose
- Storage: hash-based deduplication

## Invariants

- Keep the product local-first. Do not add hosted AI services, external inference APIs, or CDN-only runtime dependencies.
- Keep environment configuration in the root `.env` flow unless an existing toolchain requires a dedicated build-time file such as `src/frontend/.env.demo`.
- Use PostgreSQL behavior as the baseline for application and test decisions.
- Route frontend HTTP through feature-local API modules under `src/frontend/src/features/*/api/` backed by `src/frontend/src/lib/apiBase.ts` (axios). `ApiClient.ts` is a re-export facade for backward compatibility — do not add new fetch logic there.
- Use React Query for server state (queries + mutations) and Zustand stores for UI state (panels, navigation, preferences). Use `useState` only for component-local ephemeral state.
- When task intent is unclear or a major decision is required, explicitly ask for clarification in the conversation and pause implementation until the direction is confirmed.

## One Flow

The main agent stays responsible for synthesis, approval handling, and final QA.
Delegate specialized work to the scoped agents documented in `.github/agents/` only when that workstream is actually in scope.

### 1. Plan

- Invoke `plan` to restate the request, map affected layers, identify tests early, and propose a concrete change set.

### 2. Audit The Plan

- Invoke `plan-audit` to compare the proposed plan against existing code and docs.
- Use it to find holes, naming conflicts, missed files, missing tests, or documentation drift before editing starts.

### 3. Decide Workstreams

Dispatch only the agents required by the touched areas.
Do not pull backend guidance into a frontend-only task, and do not pull demo or docs reviewers unless the change can actually affect them.

| Workstream        | Use When                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `backend`         | `src/WebApi/**`, `src/Application/**`, `src/Domain/**`, `src/Infrastructure/**`, `src/SharedKernel/**` are changing |
| `frontend`        | `src/frontend/**` is changing                                                                                       |
| `asset-processor` | `src/asset-processor/**` is changing                                                                                |
| `e2e`             | `tests/e2e/**` is changing or UI behavior needs E2E coverage                                                        |
| `docs`            | user-facing behavior, API contracts, worker behavior, testing guidance, README, feature docs, or docs-video relevance may have changed |
| `demo`            | frontend-visible behavior, demo mocks, demo assets, or `build:demo` output may be affected                          |

### 4. Implement

- Delegate implementation to the minimal set of workstream agents.
- Those agents must follow only the scoped instruction files relevant to the files they edit.
- If a delegated implementation discovers cross-layer scope expansion, surface it back to the main agent instead of silently spreading further.

### 5. Check Docs

- Invoke `docs` when the change may affect `README.md`, `docs/docs/ai-documentation/*.md`, `.env.example`, or user-facing feature docs.
- Treat docs freshness as a required maintenance task, not an optional follow-up. When behavior changes, check whether `README.md` and the matching docs pages — especially `docs/docs/features/*.md` — still describe the product correctly.
- When a change touches a documented feature, have `docs` decide whether the feature video or docs-video script should change too, and whether selectors or scripted UI steps under `docs/videos/` have gone stale.

### 6. Check Demo Mode

- Invoke `demo` when the change may affect `src/frontend/.env.demo`, demo mocks, demo asset preparation scripts, or the demo build behavior.

### 7. QA

The main agent owns final verification.

- After any code change, run targeted checks while iterating and rerun the affected suites after each meaningful edit until they are green.
- Before closing a code change, run the full required local QA suites for every affected layer.
- Do not finish a session with known failing checks. Failures found while verifying a change must be investigated and fixed in the same session unless the user explicitly redirects scope.
- Never remove tests, weaken assertions, add blanket skips, convert failures into always-passing behavior, or otherwise reduce test quality just to get green. Test coverage and test strictness must stay at least as strong as before the change.
- When backend changes are involved, run `dotnet build Modelibr.sln` and `dotnet test Modelibr.sln --no-build`.
- When frontend changes are involved, run `cd src/frontend && npm test && npm run lint && npm run build`.
- When frontend-visible behavior changes are involved, run `cd tests/e2e && npm run test` before finishing.
- If a verification failure is caused by environment or infrastructure rather than product code, document the blocker explicitly and do not claim the change is fully verified.

## Scoped Guidance Only

These files exist to keep implementation guidance out of the always-loaded orchestrator.

- `.github/instructions/backend.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/asset-processor.instructions.md`
- `.github/instructions/e2e.instructions.md`

They should stay short, specific, and file-scoped.

## Subagents

These focused agents are the only workflow specializations this orchestrator should rely on.

- `.github/agents/plan.agent.md`
- `.github/agents/plan-audit.agent.md`
- `.github/agents/backend.agent.md`
- `.github/agents/frontend.agent.md`
- `.github/agents/asset-processor.agent.md`
- `.github/agents/e2e.agent.md`
- `.github/agents/docs.agent.md`
- `.github/agents/demo.agent.md`

## Notes

- Keep this file small enough to remain orchestration-only.
- Do not duplicate detailed backend, frontend, worker, or E2E rules here when they can live in scoped files.
- Prefer delegation plus scoped instructions over one giant always-loaded rulebook.

## CI Alignment

Local QA instructions are intentionally stricter than CI pipeline gates. CI (`ci-and-deploy.yml`, `code-quality.yml`) is a minimum bar. The agent must still run the full local verification commands listed in the QA section.

- No shortcuts: the agent must not trade correctness for speed by skipping required suites, stopping at partial verification, or leaving failing tests for a later session without explicit user approval.

- Dockerfile or compose changes may affect `docker-publish.yml` GHCR image publishing.
- Frontend-visible changes that alter demo behavior must validate `build:demo`.
- Nightly E2E (`nightly-e2e.yml`) covers `@slow` tests only — it does not replace local full-suite E2E.

## Completion Gate

Before finishing work and clearing context, the main agent must explicitly answer:

1. Which layers changed?
2. Which tests were run for those layers?
3. Did backend API or DTO shape change? If yes, were frontend API modules, docs, and demo mocks checked?
4. Did frontend-visible behavior change? If yes, were docs, demo mode, and E2E implications checked?
5. Did worker behavior or job contract change? If yes, were worker docs, API contracts, and processor/service boundaries checked?
6. Did any env/config/build path change? If yes, were `.env.example`, `.env.demo`, typed env files, and workflow implications checked?
7. Are there any user-facing regressions still unverified?
8. What remains intentionally out of scope?

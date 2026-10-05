# Modelibr - agent guide

Self-hosted, **local-first** game-asset library (3D models, textures, sounds,
sprites, env maps). Core behavior never depends on hosted services.
`CLAUDE.md` imports this file; Codex and Antigravity read it directly.

## How to work here

- **Build what the maintainer asked for, the smallest clean way.** Their vision,
  not yours. No speculative features, "foundations", extra abstraction, or
  hardening nobody asked for.
- **Ask first** before adding a database table, migration, public API or MCP tool,
  or a new page.
- A finding outside the current task is one line in the release backlog, not
  extra work in this one.
- Conventions live in `.claude/skills/` (loaded on demand); design rationale and
  past incidents in `.claude/notes/` (start at `MEMORY.md`). If a skill
  contradicts the code, trust the code and fix the skill in the same change.
- `.claude/prompts/` is the maintainer's local, git-ignored plan. Read the active
  `v{version}/README.md`; keep its State current. Don't create other files there,
  and never cite paths inside it in committed files.

## This repository is PUBLIC

Never commit: machine-specific setup (local Docker/VM config, host paths, the
maintainer's hardware), production infrastructure (server addresses, credentials,
deploy specifics), business decisions, unreleased roadmap, or pointers into
git-ignored paths. When unsure, leave it out.

## Commits and branches

- Conventional commits (`feat(scope): ...`, `fix(e2e): ...`).
- No AI attribution in git artifacts: no `Co-Authored-By:` trailer, no "Generated
  with" footer.
- Nothing goes directly to `main`, CI files included. PRs target the current
  version branch. One feature-sized PR the maintainer can test, with a short
  test checklist; no stacked micro-PRs. Details: `release-workflow` skill.

## Invariants

- Local-first: no hosted AI/inference, no CDN-only runtime deps, pipelines work offline.
- Env config flows through root `.env` (+ `.env.example`); demo build uses
  `src/frontend/.env.demo`.
- Frontend HTTP only via feature `api/` modules on `lib/apiBase.ts`. React Query =
  server state, Zustand = UI state, `useState` = ephemeral only.
- PostgreSQL behavior is the baseline for app and test decisions.
- Tag vocabularies are strictly per asset type. Global Materials (Universal) and
  Multi-Model Textures (ModelSpecific) are separate types despite sharing a grid.
- Don't commit large generated binaries (docs videos, visual baselines).
- A new endpoint the frontend calls needs a demo MSW handler in the same change.

## Verify before claiming done

| Layer touched       | Command                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Backend             | `dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"` |
| Frontend            | `cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`              |
| Worker              | `cd src/asset-processor && npm test && npm run lint && npm run format:check`                        |
| UI-visible behavior | the affected E2E scope; `run-e2e.js` before claiming E2E green                                      |
| Docs/formats/tabs   | `npm run docs:audit`                                                                                |

`format:check` is a required CI gate and `lint` does not cover it for Markdown,
JSON or CSS. Never finish with known-failing checks; if a failure is
environmental, say so instead of claiming verified.

## Tests

- Never weaken a test to make it pass. Don't fix flakes with timeouts.
- Tags decide CI lanes: untagged = every PR, `@slow` = nightly, `@serial` =
  local-only. Never tag to dodge a flake.
- The suite manifest is `scripts/test-runner/suites.config.mjs`. Authoring and
  triage: `e2e-authoring`, `frontend-test-authoring`, `test-triage` skills.

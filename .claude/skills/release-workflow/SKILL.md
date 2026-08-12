---
name: release-workflow
description: Modelibr git and release conventions - version-branch naming and protection, PR targeting, conventional commits (never an AI co-author trailer), and the version-branch→main release cadence. Use when branching, committing, opening PRs, cutting a release, or configuring branch protection.
---

# Release & git workflow

## Branches
- `main` represents **released versions only**. Installed desktop apps auto-update
  via electron-updater from GitHub Releases, so keep the release cadence low -
  users shouldn't be prompted to update every few days.
- Active development lands on a **version branch** named `version/<major>.<minor>`
  (e.g. `version/0.1`). Feature/fix branches PR **into the current version
  branch**, never directly into `main`.
- **A version branch is done once its release ships.** Post-release fixes stage
  on a new **patch branch** `version/<major>.<minor>.<patch>` (e.g.
  `version/0.3.1`, `version/0.4.1`), created from the released tip - never
  retarget more work at the already-released `version/X.Y` branch.
- `main` only advances when cutting a release: merge the version branch → `main`,
  then publish a GitHub Release.

## Version-branch protection
- A classic branch-protection rule matches the glob **`version/*`**, so every
  current and future version branch is protected automatically (no per-branch
  setup).
- The rule: require a PR before merging (0 approvals), block force-pushes and
  branch deletion, and require these CI checks - `Backend Unit Tests`,
  `Frontend Unit Tests`, `Asset Processor Tests`. They run on **every** PR via
  `ci-and-deploy.yml` (no path filter, no job-level skip), so requiring them
  never deadlocks a PR.
- `Code Quality Status` is intentionally **not** required: its workflow
  (`code-quality.yml`) is path-filtered to `src/frontend|asset-processor|desktop`,
  so on an unrelated PR the check never reports and would block merge forever.
- **Why protect at all:** CodeQL default setup only scans pull requests that
  target the default branch *or a protected branch*. An unprotected version
  branch means version-branch PRs are never scanned. Keep `version/*` protected
  so security scanning runs on every PR (and so fixed alerts can actually clear).

## Commits
- **Conventional commits**: `feat(scope): …`, `fix(e2e): …`, `ci(security): …`,
  `docs(agents): …`.
- **Never add AI attribution.** No `Co-Authored-By:` line for Claude/the
  assistant on any commit, and no "Generated with Claude Code" (or similar)
  footer on a PR body. This is a hard rule - the user wants history and PRs to
  read as his own work.

## PRs
- Target the current version branch, not `main`.
- **Nothing goes directly to `main` - including CI-only files.** Workflows and
  `tests/` tooling route through the version branch like everything else, even
  when a workflow needs to be on the default branch to be dispatchable. Accept
  that it goes live at the next release.
- **Batch into feature-sized PRs.** The user dislikes small stacked PRs - he
  wants to test a complete, user-visible feature in one branch. Fold prerequisite
  fixes into the feature branch unless they're urgent alone, and ship a change
  checklist with the PR so he can test it.
- Features ship with tests (xUnit / Jest / Vitest / Gherkin scenario) following
  the testing rules in `AGENTS.md` and the `test-triage` skill.

## Releases
- Cutting a release = merge the version branch (`version/X.Y` or patch branch
  `version/X.Y.Z`) → `main`, then publish a GitHub Release.
- **`gh release create vX.Y.Z --target main` is the one manual step.** Everything
  downstream runs off it: installers + updater feeds attach, Docker images
  publish, docs deploy.
- **Before tagging, run `npm run videos:generate` locally.** Docs video specs are
  exercised only at main-push, and a red docs CI **silently blocks Docker
  Publish** - `docker-publish.yml` fires only on "CI and Deploy Docs" success on
  main and has **no manual trigger**. This cost 0.4.0–0.4.2 their Docker images.
  Duration caps regress only at CI pace (CI paces recorded waits ~1.5× local), so
  a spec at ~90% of its cap locally will fail CI.
- **`upgrade-test.yml` needs no tag edit** - its `resolve-tags` job derives FROM/TO
  from the Releases API. That job runs the FROM version's updater code, so an
  updater fix is validated live only once two post-fix releases exist; until then
  it is red by design. electron-updater feeds (`latest*.yml` + `.blockmap`) are attached as
  release assets; the desktop **client** publishes to its own `client` update
  channel so its feed never collides with the host's.

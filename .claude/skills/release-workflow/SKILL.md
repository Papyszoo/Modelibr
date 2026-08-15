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
- **`gh release create vX.Y.Z --target main` triggers what is automated:**
  installers + updater feeds attach, Docker images publish.
- **The docs site is published by hand, and is not part of the release trigger.**
  CI only builds it and uploads the `docs-site` artifact; nothing in any workflow
  deploys it. The maintainer publishes that artifact from the machine holding the
  deploy target. **Never write that host or path into this repo.**
- **Docs videos render locally, never in CI and never committed.** CI runners have
  no GPU, so WebGL clips flake on SwiftShader; and regenerated binaries would grow
  the pack every release. Do this before tagging, without being asked:
  1. `npm run videos:generate` - renders all eight clips, fails on a blown cap.
  2. `npm run videos:verify -- --complete` - re-checks the collected set against
     the manifest caps and the analysis report (also read
     `docs/videos/.generated/reports/final-video-analysis.json` if a clip fails).
     The same gate runs unforced in `npm run test:all` as the `docs-videos` suite.
  3. `npm run videos:publish` - uploads to the docs asset host. Target comes from
     `DOCS_VIDEO_PUBLISH_TARGET` in the maintainer's local env.
  The clips are **not** in the `docs-site` bundle and CI never fetches them. They
  live under the site's own `/videos/` path, which the docs publish protects from
  deletion - so the two publishes are independent and cannot clobber each other.
- **Re-render only when a video's flow changed in the UI.** Nothing in CI exercises
  the video specs now, so this is the only thing catching selector rot after a
  redesign - see the ripple rule in `AGENTS.md`.
- **Docker Publish no longer rides on docs.** Since 0.5.1 it gates on the
  `CI Status` job rather than the whole run; a red video lane stops withholding
  images, which is what cost 0.4.0-0.5.0 theirs.
- **`upgrade-test.yml` needs no tag edit** - its `resolve-tags` job derives FROM/TO
  from the Releases API. That job runs the FROM version's updater code, so an
  updater fix is validated live only once two post-fix releases exist; until then
  it is red by design. electron-updater feeds (`latest*.yml` + `.blockmap`) are attached as
  release assets; the desktop **client** publishes to its own `client` update
  channel so its feed never collides with the host's.

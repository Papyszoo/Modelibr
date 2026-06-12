---
name: release-workflow
description: Modelibr git and release conventions — version-branch naming and protection, PR targeting, conventional commits (never an AI co-author trailer), and the version-branch→main release cadence. Use when branching, committing, opening PRs, cutting a release, or configuring branch protection.
---

# Release & git workflow

## Branches
- `main` represents **released versions only**. Installed desktop apps auto-update
  via electron-updater from GitHub Releases, so keep the release cadence low —
  users shouldn't be prompted to update every few days.
- Active development lands on a **version branch** named `version/<major>.<minor>`
  (e.g. `version/0.1`). Feature/fix branches PR **into the current version
  branch**, never directly into `main`.
- `main` only advances when cutting a release: merge the version branch → `main`,
  then publish a GitHub Release.

## Version-branch protection
- A classic branch-protection rule matches the glob **`version/*`**, so every
  current and future version branch is protected automatically (no per-branch
  setup).
- The rule: require a PR before merging (0 approvals), block force-pushes and
  branch deletion, and require these CI checks — `Backend Unit Tests`,
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
- **Never add an AI co-author trailer.** No `Co-Authored-By:` line for
  Claude/the assistant on any commit. This is a hard rule.

## PRs
- Target the current version branch, not `main`.
- Features ship with tests (xUnit / Jest / Vitest / Gherkin scenario) following
  the testing rules in `CLAUDE.md` and the `test-triage` skill.

## Releases
- Cutting a release = merge `version/X.Y` → `main`, then publish a GitHub
  Release. electron-updater feeds (`latest*.yml` + `.blockmap`) are attached as
  release assets; the desktop **client** publishes to its own `client` update
  channel so its feed never collides with the host's.

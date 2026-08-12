# Test strategy - suites and the CI split

~10 suites in scattered places: backend xUnit (4 .NET projects), frontend Jest,
asset-processor Vitest, desktop `node --test`, main E2E (Playwright + BDD, tiered
setup / chromium / serial / @slow-Blender / @performance), backup-restore E2E,
Storybook visual, WebGL extraction, and installed-app E2E across Win/macOS/Linux.

## The split (decided 2026-06-07)

The full E2E suite takes >1h, and installed-app *smoke* tests gave false
confidence - they passed while the app's DB was never created.

- **GitHub CI runs fast tests + installer tests only.** Not the full e2e sweep.
- **The local GPU lane runs as many suites as possible** - far faster than
  GitHub's shared runners - and produces a report page.

**Never trust pure smoke checks for the installed app.**

## What gates what

Required checks are **Backend / Frontend / Asset-Processor unit tests only**. E2E
and "CI Status" are non-required - a flaky E2E suite never blocks a merge, and
that is deliberate.

`version/*` branches are protected so CodeQL actually scans version-branch PRs
(CodeQL default setup only scans PRs targeting the default or a protected branch).

## Local environment

Docker runs on **colima**. VM sizing, corruption recovery and routine disk
reclaim are machine-specific, so they stay out of this public repo.

**Gotcha:** WebApi's `Program.Main` reads `RESTORE_STORAGE_PATH` /
`THUMBNAIL_STORAGE_PATH` *before* host config applies, so in-process tests must
set them as environment variables (fixed in `ModelibrWebFactory`).

## Pending follow-ups (out of scope of the runner)

- Trim GitHub CI to fast + installer.
- Harden the installed-app gate - DB-backed + real core-flow E2E, not just smoke.
- Remove stale Blender-addon plumbing from
  `.github/scripts/fetch-test-reports.sh` (it still haunts the public
  test-reports page).

## Load / scale suite (prompt 50, not built)

Local-only suite in `tests/load`: part 0 a deterministic API-driven seeder
(medium 1k / large 10k / stress 50k profiles, ledger JSON of expected counts,
stub-worker mode, pg_dump + volume snapshot cache keyed by migrations hash);
part A backend/API load (produces prompt 28's baseline numbers, includes WebDAV
PROPFIND on a 1k-model project); part B `@load` UI e2e reusing page objects
against the restored snapshot (virtuoso DOM bound, heap via CDP); part C lifecycle
(backup/restore/`MigrateAsync` timing at scale, feeds prompt 17).
`load-metrics.jsonl` trend is informational, not gating. The existing
`@performance 16-*` stays - different question (pipeline throughput vs at-scale
behavior). Real-thumbnails mode was unreliable until prompt 41 landed.

Related: [[runner-and-studio.md]], [[flakiness.md]], [[../release/process.md]]

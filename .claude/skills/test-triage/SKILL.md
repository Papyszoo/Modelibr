---
name: test-triage
description: Diagnose a failing test suite ("visual regression failed", "e2e is red", "backend tests broke") by locating the right logs and artifacts — test-report/logs, Playwright reports/traces, visual diff PNGs, TRX files — and analyzing the failure. Use whenever the user reports a test failure and wants to know what/why, or asks where test logs live.
---

# Test triage

Map what the user said to a suite id from `scripts/test-runner/suites.config.mjs`
(the manifest — single source of truth for all suites):

| User says | Suite id |
|---|---|
| visual regression / storybook / snapshots | `storybook-visual` |
| e2e / scenarios / playwright | `e2e-fast` or `e2e-full` (same artifacts) |
| backend / dotnet / xunit | `backend` (or `backend-integration` if Postgres-related) |
| frontend / jest | `frontend` |
| asset processor / thumbnails / vitest | `asset-processor` |
| backup / restore | `backup-restore` |
| desktop / tray | `desktop` (only on tray-host branches) |
| performance / throughput | `e2e-performance` |

If genuinely ambiguous, ask once; otherwise pick the obvious suite and proceed.

## Where artifacts live

Every suite run via the local runner (`npm run test:all*`) or Test Studio
(`npm run test:site`) writes — **last run only, overwritten each run**:

- `test-report/logs/<suite-id>.log` — full stdout/stderr
- `test-report/summary.json` — normalized pass/fail counts (runner runs)
- `test-report/history.jsonl` — per-run status/duration history (appended, survives)

Kind-specific artifacts on top of that:

| Suite | Failure artifacts |
|---|---|
| `backend`, `backend-integration` | TRX: `test-report/.work/<suite-id>/trx/*.trx` — failed tests are `<UnitTestResult outcome="Failed">` with `<Message>`/`<StackTrace>` |
| `frontend` | `test-report/.work/frontend/jest.json` (`testResults[].message` for failures) |
| `asset-processor` | `test-report/.work/asset-processor/vitest.json` |
| `e2e-fast` / `e2e-full` / `e2e-performance` | `tests/e2e/playwright-report/index.html` (merged HTML report); `tests/e2e/test-results/<test-dir>/` per failure: screenshots, video `.webm`, `trace.zip`, `error-context.md` |
| `backup-restore` | `tests/backup-restore-e2e/playwright-report/` + `tests/backup-restore-e2e/test-results/` |
| `storybook-visual` | `src/frontend/visual-tests/test-results/<test-dir>/` per failure: `error-context.md`, and for pixel diffs `*-expected.png` / `*-actual.png` / `*-diff.png`; baselines in `src/frontend/visual-tests/__snapshots__/` (only exists after a first baseline run) |

If `test-report/logs/<id>.log` is missing, the suite wasn't run through the
runner/Studio — check the suite's own dirs above, or offer to run it
(`npm run test:all -- --only=<id> --yes --no-open`).

## Procedure

1. Read the tail (~200 lines) of `test-report/logs/<id>.log`; extract failing
   test names and error messages. Check `test-report/history.jsonl` to see if
   the suite was passing before (regression vs long-broken).
2. Pull the kind-specific evidence:
   - **Visual regression** — two distinct failure modes:
     (a) *render gate*: a story never becomes visible (`#storybook-root` hidden
     timeout) — the failing story name is in the error line; that's a component
     bug or a story needing setup, NOT a pixel diff.
     (b) *pixel diff*: Read the `-expected`/`-actual`/`-diff` PNGs with the Read
     tool (it renders images) and describe the visual difference. Intentional UI
     change → re-baseline with `cd src/frontend && npm run test-storybook:update`;
     otherwise name the regressing story/component.
   - **Playwright e2e**: open the failing test's dir under `test-results/`,
     read `error-context.md` and the screenshot; for deep dives suggest
     `cd tests/e2e && npx playwright show-trace <trace.zip>`.
   - **dotnet**: grep the TRX for `outcome="Failed"` and read the messages.
   - **jest/vitest**: read the JSON output's failure messages.
3. Form a root-cause hypothesis. To confirm, re-run narrowly rather than the
   whole suite: dotnet `--filter "FullyQualifiedName~<name>"`, jest/vitest
   `-t "<name>"`, playwright `--grep "<scenario>"` (see
   `scripts/test-catalog/runspec.mjs` for the exact working patterns).
4. Report: failing test(s), the error, the root cause, and a suggested fix.
   Don't change code unless the user asks for a fix.

## Overall quality check ("did everything pass?")

When the user asks whether everything is green / quality has fallen:

1. `test-report/summary.json` — per-suite status + counts of the **last** runner
   run (incl. Studio's "Run everything", which shells out to the runner). A suite
   with `"status": "skipped"` or `"not-present"` did NOT run — say so explicitly,
   don't count it as passing.
2. `test-report/history.jsonl` — one line per run; compare the latest entries to
   see whether a suite regressed (was passing, now failing) or got slower.
3. `test-report/everything.log` — the combined console log of a Studio
   "Run everything"; per-suite logs are still in `test-report/logs/<id>.log`.

To produce fresh results: `npm run test:all:full` (CLI) or the **Run everything**
button in Test Studio. Docker suites clean leftovers from interrupted runs before
starting (built into the suite commands), so stale containers can't skew results.

## Caveats

- Logs are from the **last run only**; `test-report/` is cleared (except
  `history.jsonl`) at each runner start.
- Playwright HTML reports can also be browsed via Test Studio:
  `http://127.0.0.1:5178/report/tests/e2e/playwright-report/index.html`.
- E2E failures may be infra, not the test: check Docker was up and the stack
  became healthy (the log shows the `wait-for-services` output first).
- Docker runs under **colima** on this machine. Two infra signatures seen before:
  "Docker Compose requires buildx plugin" → `brew install docker-buildx` + symlink
  into `~/.docker/cli-plugins/`; build dies with `rpc error … EOF` and then
  "Cannot connect to the Docker daemon" → the colima VM OOM-crashed (needs
  ≥ 6 CPU / 8 GiB for the parallel e2e image builds: `colima start --cpu 6 --memory 8`).
- The WebApi reads `RESTORE_STORAGE_PATH`/`THUMBNAIL_STORAGE_PATH` in Program.Main
  **before** host config is applied — for in-process tests these must be set as
  environment variables (see ModelibrWebFactory), not just host configuration.

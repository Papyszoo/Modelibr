---
name: test-triage
description: Diagnose a failing test suite ("visual regression failed", "e2e is red", "backend tests broke") by locating the right logs and artifacts - test-report/logs, Playwright reports/traces, visual diff PNGs, TRX files - and analyzing the failure. Use whenever the user reports a test failure and wants to know what/why, or asks where test logs live.
---

# Test triage

Map what the user said to a suite id from `scripts/test-runner/suites.config.mjs`
(the manifest - single source of truth):

| User says                             | Suite id                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| visual regression / storybook         | `storybook-visual`                                       |
| e2e / scenarios / playwright          | `e2e-fast` or `e2e-full` (same artifacts)                |
| backend / dotnet / xunit              | `backend` (or `backend-integration` if Postgres-related) |
| frontend / jest                       | `frontend`                                               |
| asset processor / thumbnails / vitest | `asset-processor`                                        |
| backup / restore                      | `backup-restore`                                         |
| desktop / tray                        | `desktop`                                                |
| performance / throughput              | `e2e-performance`                                        |

If ambiguous, ask once; otherwise pick the obvious suite.

## Where artifacts live

Every suite run via the local runner (`npm run test:all*`) or Test Studio
(`npm run test:site`) writes - **last run only, overwritten each run**:

- `test-report/logs/<suite-id>.log` - full stdout/stderr
- `test-report/summary.json` - normalized pass/fail counts
- `test-report/history.jsonl` - per-run history (appended, survives)

Kind-specific artifacts:

| Suite                            | Failure artifacts                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend`, `backend-integration` | TRX: `test-report/.work/<suite-id>/trx/*.trx` - failed = `<UnitTestResult outcome="Failed">` with `<Message>`/`<StackTrace>`                                                                                                                                                        |
| `frontend`                       | `test-report/.work/frontend/jest.json` (`testResults[].message`)                                                                                                                                                                                                                    |
| `asset-processor`                | `test-report/.work/asset-processor/vitest.json`                                                                                                                                                                                                                                     |
| `e2e-*`                          | per suite: `tests/e2e/playwright-report-{fast,full,performance}/index.html` (merged) + `tests/e2e/test-results-{fast,full,performance}/<test-dir>/` per failure (screenshots, video `.webm`, `trace.zip`, `error-context.md`). Direct `npx playwright test` writes unsuffixed dirs. |
| `backup-restore`                 | `tests/backup-restore-e2e/playwright-report/` + `test-results/`                                                                                                                                                                                                                     |
| `storybook-visual`               | `src/frontend/visual-tests/test-results/<test-dir>/` per failure: `error-context.md`, and `*-expected/-actual/-diff.png`; baselines in `src/frontend/visual-tests/__snapshots__/`                                                                                                   |

If `test-report/logs/<id>.log` is missing, the suite wasn't run through the
runner/Studio - check the suite's own dirs, or offer
`npm run test:all -- --only=<id> --yes --no-open`.

## Procedure

1. Tail (~200 lines) `test-report/logs/<id>.log`; extract failing names and
   errors. Check `history.jsonl` for regression vs long-broken.
2. Pull kind-specific evidence:
   - **Visual regression** - (a) _render gate_: a story never becomes visible
     (`#storybook-root` timeout) - a component bug or setup issue, not a pixel
     diff; (b) _pixel diff_: Read the `-expected`/`-actual`/`-diff` PNGs with the
     Read tool and describe the difference. Intentional → re-baseline with
     `cd src/frontend && npm run test-storybook:update`; else name the regressing
     story/component.
   - **Playwright e2e**: read the failing test dir's `error-context.md` and
     screenshot; deep dive with `npx playwright show-trace <trace.zip>`.
   - **dotnet**: grep the TRX for `outcome="Failed"`.
   - **jest/vitest**: read the JSON failure messages.
3. Form a root-cause hypothesis; confirm by re-running narrowly (`dotnet --filter`,
   jest/vitest `-t`, playwright `--grep`; exact patterns in
   `scripts/test-catalog/runspec.mjs`).
4. Report failing test(s), error, root cause, suggested fix. Don't change code
   unless asked.

## Overall quality check ("did everything pass?")

1. `test-report/summary.json` - per-suite status/counts of the **last** runner
   run. `"status": "skipped"`/`"not-present"` did NOT run - say so, don't count
   it as passing.
2. `test-report/history.jsonl` - compare latest entries for a regression or
   slowdown.
3. `test-report/everything.log` - combined console log of a Studio "Run
   everything"; per-suite logs stay in `test-report/logs/<id>.log`.

Fresh results: `npm run test:all:full` (CLI) or **Run everything** in Test
Studio. Docker suites clean leftovers before starting.

## Caveats

- Logs are from the **last run only**; `test-report/` is cleared (except
  `history.jsonl`) at each runner start.
- Playwright HTML reports are also browsable via Test Studio:
  `http://127.0.0.1:5178/report/tests/e2e/playwright-report-full/index.html`.
- E2E failures may be infra: check Docker was up and the stack healthy. Docker
  runs under **colima**; two signatures: "requires buildx plugin" →
  `brew install docker-buildx` + symlink into `~/.docker/cli-plugins/`; `rpc
error … EOF` then "Cannot connect to the Docker daemon" → colima VM OOM-crashed
  (needs `colima start --cpu 6 --memory 8`).
- `RestoreOnBootProcessor` (during `Program.Main`, before host config) reads
  `RESTORE_STORAGE_PATH`/`THUMBNAIL_STORAGE_PATH`; `BackupService` reads the same
  keys from `IConfiguration`. In-process tests must set them as env vars (see
  `ModelibrWebFactory`).

# Local test runner

One command to run as many of the project's test suites as possible on this
machine (great for the Mac Mini M4, which is far faster than GitHub's shared
runners) and get a single openable HTML report.

It does **not** reimplement any test orchestration — it shells out to each
suite's existing command (e.g. `tests/e2e`'s Docker runners) and aggregates the
results.

## Usage

```bash
npm run test:all                  # interactive picker (fast tier pre-selected)
npm run test:all:fast             # run the fast tier, no prompt
npm run test:all:full             # run every suite, no prompt
npm run test:all -- --tier=slow   # run one tier (fast | slow | visual | perf)
npm run test:all -- --only=backend,frontend
npm run test:all -- --list        # list suites without running
npm run test:audit                # report test suites not tracked by the manifest
```

After a run, the report opens automatically (macOS/Linux) and is written to
`test-report/index.html` (git-ignored), with per-suite logs in
`test-report/logs/` and machine-readable `test-report/summary.json`. Playwright
suites link to their own HTML reports.

In the interactive picker: type suite numbers to toggle, `a` all, `n` none,
`f` fast, `t<tier>` to add a tier (e.g. `tslow`), Enter to run, `q` to quit.

## Behavior

- **Docker guard** — suites that need Docker are skipped (not failed) when the
  daemon is down. Some also need the dev Postgres / e2e stack; the suite's own
  command brings the stack up and tears it down where required.
- **Branch-aware** — a suite whose files aren't on the current branch (e.g. the
  `desktop` suite outside `feat/tray-host`) is reported as *not-present*, and
  starts running automatically once those files exist.
- **Honest exit code** — the process exits non-zero if any selected suite failed.

## Adding a suite

Append one entry to [`suites.config.mjs`](./suites.config.mjs). Pick a `kind`
(`dotnet | jest | vitest | node-test | playwright`) so results are parsed
correctly, set `cwd`/`command`/`tier`/`detectPath`, and `requiresDocker` if it
needs the daemon. If you forget, `npm run test:audit` will flag the new suite as
untracked.

## Files

| File | Role |
|------|------|
| `suites.config.mjs` | the manifest — single source of truth for all suites |
| `index.mjs` | entry point: args, picker, Docker guard, orchestration |
| `picker.mjs` | dependency-free interactive multi-select |
| `parsers.mjs` | per-kind command building + result parsing (TRX / JSON / TAP) |
| `discover.mjs` | drift audit (`npm run test:audit`) |
| `report.mjs` | writes `test-report/` (summary.json + index.html) and opens it |
| `util.mjs` | paths, colors, command runner, Docker check |

# Test Studio

A local, browsable catalog + control panel for every test in the repo. Browse
all tests (down to individual unit methods and all E2E scenarios), see which CI
action runs each and its triggers, view timing history (this machine vs GitHub),
and run any suite/scenario with parameters — with live streamed output.

## Usage

```bash
npm run test:site         # build catalog (incl. GitHub timings) + open the UI
npm run test:site:fast    # same, but skip the GitHub fetch (offline / quick)
npm run test:catalog      # just (re)build test-catalog/catalog.json
```

The server binds `127.0.0.1:5178` (override with `MODELIBR_TEST_SITE_PORT`).

## What you get

- **Dashboard**: one card per area (E2E, Backend, Frontend, Asset Processor, All
  Suites) with test counts, local + GitHub timings, and one-click run buttons.
- **Drill-in pages** with breadcrumbs: E2E → humanized areas ("Sounds") → feature
  cards with descriptions → scenario rows; Backend → projects → classes → methods;
  Frontend/Asset → files → cases. Global search (top bar) finds any test by name
  or tag across everything.
- **Detail pages**: tags, `@depends-on`, source notes, **which CI action runs it +
  triggers**, **timing** (local sparkline + GitHub avg/last with pass/fail dots),
  and a **run builder** — E2E params = video / trace / workers / retries / headed;
  unit params = coverage / name filter; scenarios get a prefilled `grep`.
  **Run ▶** streams live output into the console drawer and links to the report.
- **Always current**: the server watches the test sources and rebuilds the catalog
  automatically when files change — just reload the page. (New .NET tests appear
  after the next `dotnet build`; GitHub timings refresh on a 6h cache or via ↻.)

## How it works

- `build-catalog.mjs` runs the `collectors/` and writes `test-catalog/catalog.json`
  (git-ignored): suites (from the runner manifest), `dotnet --list-tests`, static
  Jest/Vitest parsing, Gherkin parsing, workflow triggers + `ci-map.mjs`, GitHub
  job timings via `gh` (cached 6h), and local history from
  `test-report/history.jsonl`.
- `server.mjs` serves the UI + catalog and runs suites. The client sends a
  **run-spec** (suite id + params); `runspec.mjs` builds the actual command from
  the manifest — user strings (grep, name filter) are passed via env and quoted,
  never interpolated into the shell. One run at a time; output streams over SSE.
- `ui/` is dependency-free vanilla JS. With no server it runs in **read-only**
  mode against a sibling `catalog.json` — that's the optional GitHub Pages snapshot
  (catalog + GitHub timings; no local data, run buttons hidden).

## Adding a test

Nothing to do for the catalog — new E2E `.feature` files, Jest/Vitest cases, and
.NET tests are picked up on the next `test:catalog`. New *suites* go in
`scripts/test-runner/suites.config.mjs` (and `npm run test:audit` flags drift). To
bind a suite to a CI job for timing history, add it to `ci-map.mjs`.

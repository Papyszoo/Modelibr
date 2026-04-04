---
name: e2e-testing
description: "Reference for Modelibr Playwright-BDD E2E tests. Use when editing tests, selectors, setup flows, or debugging reliability issues."
user-invocable: false
disable-model-invocation: true
---

# Modelibr E2E Reference

Use this as a focused reference when working on `tests/e2e/**`.

## E2E Environment

- Frontend: `localhost:3002` (E2E container)
- API: `localhost:8090` (WebAPI E2E container, maps to 8080 internally)
- Asset Processor: `localhost:3003` (worker E2E container)
- PostgreSQL: `localhost:5433` (E2E database, maps to 5432 internally)
- Docker composition: `tests/e2e/docker-compose.e2e.yml`

## Full Run vs Focused Iteration

- Full validation: run from `tests/e2e/` with `npm run test`
- Focused debugging: use `npx bddgen && npx playwright test ...` only while iterating on a narrow scenario set

Example targeted run:

```bash
cd tests/e2e
npx bddgen && npx playwright test .features-gen/features/07-sprites/
```

## Reliability Rules

- One behavior per scenario
- Use `@setup` and `@depends-on` intentionally
- Use shared state only for passing created identifiers between scenarios
- Avoid `page.reload()` when the UI can update reactively (SignalR, query invalidation). Tolerate it when no reactive path exists, using `{ waitUntil: "domcontentloaded" }`.
- Do not use placeholder assertions such as `expect(true).toBe(true)`

## Data Provisioning

- Every `Given` step should create required resources through the application if they do not already exist
- Never require manual pre-seeded test data
- Always use `UniqueFileGenerator.generate(filename)` for uploaded assets so SHA256 deduplication does not collapse scenarios

Safe uniqueness formats already used in this repo:

- `GLB`
- `PNG`
- `WAV`

Treat `FBX` and `OBJ` as copy-only inputs unless the repository already provides a safe mutation path.

## Verification Depth

For behavior that spans the full stack, verify through all relevant layers:

- UI
- API
- database

Do not stop at a single layer when a user-facing workflow depends on more than one.

## Selector Order

1. `getByRole`
2. `data-testid`
3. `#id`
4. Avoid CSS class selectors unless there is no stable alternative

Use `data-testid` values in the format `{component}-{element}-{variant?}`.

## Failure Triage

When a scenario fails:

1. Check `error-context.md` in the Playwright output folder if it exists (some test runs may not generate it)
2. Review screenshots and traces under `tests/e2e/test-results/`
3. Check `docker logs webapi-e2e`
4. Confirm service health on `http://localhost:8090/health`

---
name: frontend-test-authoring
description: Writing Modelibr frontend Jest tests — the can't-fail deletion rule, test tiers (api contract / hook+store / flow), mock infrastructure (global apiBase mock, MSW tier, typed fixtures), regression-comment convention, PrimeReact/virtuoso gotchas. Use when creating or editing any test under src/frontend. For Playwright E2E use e2e-authoring instead.
---

# Frontend test authoring (Jest + Testing Library)

## The one rule
**Every test must be able to fail while the feature is broken.** Before
writing (or keeping) a test, name the regression that would make it go red.
Forbidden: static text/placeholder assertions with no logic behind them,
"renders without crashing", asserting a mock was called with what you just
passed, mocking PrimeReact (or any component library) and asserting on the
stub. If the only thing that can fail it is a label rename, delete it.

## Convention: name the regression
Each test (or its describe block) carries a comment saying what real bug it
catches — see `ScriptList.flow.test.tsx` ("the language options were derived
from the *filtered* result set…") or `soundApi.test.ts` ("a truthy check here
would drop 'from 0 seconds'"). If you can't write that comment, see rule one.

## Three tiers — pick by what you're testing
1. **API contract tests** (`features/*/api/__tests__/`): the mocked axios
   client (globally mocked in `setupTests.ts`; cast `client.get as
   jest.Mock`). Assert request construction — URL/params serialization,
   payload shape (keys omitted vs null), response unwrapping — plus at least
   one error path. Model: `soundApi.test.ts`.
2. **Hook/store behavior**: `renderHook` + `createQueryWrapper` /
   `createTestQueryClient` from `src/test/renderWithProviders.tsx` (fresh
   QueryClient per test, retries off). Stores: test transitions/persistence,
   not `set`-wrappers. Model: `useScriptListData.test.ts`,
   `uploadProgressStore.test.ts`.
3. **Flow tests** (`X.flow.test.tsx`, one per page): real component tree via
   `renderWithProviders`, real user-event, network-level mocks. Baseline:
   load → filter → mutate → **assert the list reflects it after refetch**
   (the invalidation check) → failure path (error state, no crash, retry
   recovers). Model: `ScriptList.flow.test.tsx`. These are the layer that
   catches "app broken, tests green".

## Mock infrastructure (know what's already mocked)
- `setupTests.ts` **globally mocks `@/lib/apiBase`** — every unconfigured
  `client.get/post/…` resolves `undefined`. A component test that doesn't
  set up its API responses is testing a broken data path and must not assert
  success states. `jest.clearAllMocks()` + explicit `mockImplementation`
  per file (route by URL, like the flow tests do).
- **MSW tier** (once prompt 39 lands): flow tests opt in via
  `src/test/mswServer.ts` to run the REAL apiBase (interceptors +
  `ApiClientError`) with `onUnhandledRequest: 'error'` — unmocked requests
  fail loudly. Prefer it for new flow tests; check the helper's header for
  the opt-out mechanics.
- **Fixtures**: use the typed builders in `src/test/fixtures/` (once they
  exist — prompt 39); never hand-roll DTO literals in new tests. Typed
  fixtures turn backend DTO drift into compile errors.
- Error paths assert the real `ApiClientError` fields (`status`, `code`,
  `isOffline`, `isTimeout`) — not just "something threw".

## Gotchas
- **Jest, not Vitest** (worker uses Vitest — don't cross-pollinate config).
- `import.meta.env` doesn't exist in Jest — env comes from `process.env`
  set in `setupTests.ts`; that's why apiBase is module-mocked. Don't import
  modules that read `import.meta` at module scope without a mock.
- CSS imports resolve via `identity-obj-proxy` — the CSS moduleNameMapper
  rule must stay ABOVE the `@/` alias in `jest.config.js` (first-match-wins).
- PrimeReact overlays render into `document.body` — query panels via
  `document.querySelector('.p-dropdown-panel')`-style helpers (see
  ScriptList.flow) and use real PrimeReact, never a stub.
- react-virtuoso lists may not render rows in jsdom without viewport
  sizing — use/extend the shared helper in `src/test/`; never fix with
  timeouts.
- Tab-context dependencies: stub `@/hooks/useTabContext` per file when a
  component opens tabs (see ScriptList.flow) — that's an app-shell seam,
  not over-mocking.

## Where tests live / verify
`__tests__/*.test.ts(x)` next to the code under test. Run one file while
iterating: `npx jest path/to/file.test.tsx -t "name"`. Full gate:
`cd src/frontend && npm test && npm run lint && npm run format:check`.
Planned work: prompts 37 (prune), 39 (mock infra), 40 (flow rollout).

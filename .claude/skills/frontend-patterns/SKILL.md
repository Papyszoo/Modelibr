---
name: frontend-patterns
description: Modelibr frontend conventions — feature modules, apiBase/axios routing, React Query keys/invalidation, Zustand state split, code placement rules, styling tokens, demo mode (MSW), SignalR, tab system, Jest testing, known traps. Use when creating or editing code under src/frontend.
---

# Frontend patterns (React 19 + TypeScript + Vite)

Known debt + planned refactors live in `.claude/prompts/` (13, 18, 20, 26,
33–38). Before reworking query keys, feature boundaries, Settings, the demo
handlers, or anything per-asset-type, read the matching prompt — don't
half-implement it as a side effect.

## API layer
- All HTTP goes through feature-local API modules under `features/*/api/`
  using the shared axios client `src/lib/apiBase.ts`. No raw `fetch()`, no
  hardcoded base URLs (asset URLs via `resolveApiAssetUrl`).
- apiBase rejects with a normalized `ApiClientError` (status, code, details,
  isNetworkError/isTimeout/isOffline) — catch that, not `AxiosError`.
  Backend statuses are currently unreliable (400-for-everything in places;
  prompt 26 fixes) — branch on error `code`/`message`, not status, for
  not-found/conflict semantics.
- `services/ApiClient.ts` is a deprecated re-export facade slated for
  deletion (prompt 34) — never add to it.
- TRAP — file/preview URL helpers (`getFileUrl`, `getFilePreviewUrl`)
  currently live in `features/models/api/modelApi.ts` and are imported
  cross-feature. Known wart (prompt 34 moves them to shared) — import them,
  don't duplicate them.

## Code placement (two trees exist — know the rule)
- `features/{name}/` — feature-specific code: `api/` ({feature}Api.ts +
  `queries.ts`), `components/`, `hooks/`, `types/`, `index.ts`.
- `src/shared/` — anything reusable across features (components, hooks,
  utils, validation, styles/tokens, three, thumbnail). **New shared code
  goes here**, never in the legacy root `src/components|hooks|utils` trees
  (prompt 36 merges those; app shell = `components/layout` + `contexts` +
  tab system stays put until then).
- TRAP — the Settings UI is a 1,774-line monolith at
  `components/tabs/Settings.tsx`, NOT in `features/settings` (which holds
  only its api/). Prompt 35 fixes; meanwhile extract the section you touch.

## State split (strict)
- **Server state** → React Query only. **UI state** → Zustand stores in
  `src/stores/` (small, single-purpose). **Ephemeral** → `useState`.
- Query keys are inline string arrays with NO factory (prompt 33) and mixed
  naming (`['models']` vs `['model-tags']`). A mismatched key silently stops
  invalidating — **grep for the exact existing key before writing any
  `useQuery`/`invalidateQueries`; reuse it verbatim; never invent a
  variant.**
- Mutations invalidate related keys on success; optimistic updates where the
  neighbors do.

## Styling
- Full rules — token vocabulary, shared-primitive catalog, density/identity
  rules, Storybook gallery + themes — live in the **`design-system`** skill;
  read it before writing any CSS or UI component. Highlights:
- Design tokens: `src/shared/styles/tokens.css` — use `var(--token)`; no new
  hardcoded colors (a sweep + lint gate is prompt 20; don't add to the pile).
- Component CSS files are **global scope** — prefix class names with the
  component name; check for collisions.
- Shared UI = small dumb composable primitives, not type-aware
  mega-components; the Models tab is the design identity other tabs follow.
- **New asset type? STOP — read prompt 18.** Do not copy an existing
  `XList.tsx` (650–850 lines each) as a template; that's the six-clone
  problem being actively dismantled.

## Forms
`react-hook-form` + `zodResolver`; composable Zod schemas in
`src/shared/validation/formSchemas.ts`.

## Demo mode
- `VITE_DEMO_MODE=true` (`.env.demo`); MSW intercepts — static mocks in
  `src/mocks/handlers.ts`, interactive in `dynamicDemoHandlers.ts` (4k-line
  monolith; prompt 38 splits it); data persists in IndexedDB
  (`src/mocks/db/demoDb.ts`).
- **When backend API shape/endpoints change, update demo handlers to match**
  and validate `npm run build:demo` for demo-visible changes.

## SignalR
Real-time via `services/ThumbnailSignalRService.ts` (singleton); events:
`ThumbnailStatusChanged`, `ActiveVersionChanged`. Demo mode stubs the SignalR
endpoints in `dynamicDemoHandlers.ts` (prevents 405s).

## Tabs
New tab type = six places: the `TabType` union in `src/shared/types/ui.ts`,
a case in `TabContent.tsx`, a tile in `NewTabPage.tsx` (TILES +
`RECENT_TAB_ICON`), icon + tooltip cases in `DraggableTab.tsx`, a label case
in `navigationStore.ts` `getTabLabel`, and BOTH allowlists in
`tabSerialization.ts` (missing there = the tab type is rejected when a saved
session restores). Ripple: docs-audit checks the union against
`user-interface.md` (add a `tabLabels` entry in `scripts/docs-audit/index.mjs`).

## Shared viewer/worker logic (don't duplicate)
Three.js / geometry / pixel-decode logic that the worker's thumbnail render
or demo mode must reproduce **identically** (STL mesh build, TIFF decode,
displacement-normal shader, …) lives once in `src/asset-processor/lib/` as
injected-dep ESM, imported by relative path. See `asset-processor-patterns`,
"Shared cross-runtime code".

## Testing
- **Jest** (not Vitest) + `@testing-library/react` + `user-event`; files
  `__tests__/*.test.ts(x)`. Full conventions — tiers, mock infrastructure,
  the "must be able to fail" rule — live in the **`frontend-test-authoring`**
  skill; read it before writing any test.
- When editing a 500+ line component, extract + test the section you touch —
  don't grow it.

## Verify
`cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`
(format:check is a required CI gate NOT covered by lint — Markdown/JSON/CSS
drift passes lint but fails CI; `npm run format` auto-fixes.)

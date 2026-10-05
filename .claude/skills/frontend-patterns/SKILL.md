---
name: frontend-patterns
description: Modelibr frontend conventions - feature modules, apiBase/axios routing, React Query keys/invalidation, Zustand state split, code placement rules, styling tokens, demo mode (MSW), SignalR, tab system, Jest testing, known traps. Use when creating or editing code under src/frontend.
---

# Frontend patterns (React 19 + TypeScript + Vite)

## API layer

- All HTTP goes through feature-local modules under `features/*/api/` using the
  shared axios client `src/lib/apiBase.ts`. No raw `fetch()`, no hardcoded base
  URLs (asset URLs via `resolveApiAssetUrl`).
- apiBase rejects with a normalized `ApiClientError` (status, code, details,
  isNetworkError/isTimeout/isOffline) - catch that, not `AxiosError`. Backend
  statuses are unreliable (400-for-everything in places) - branch on error
  `code`/`message`, not status, for not-found/conflict.
- `services/ApiClient.ts` is a deprecated re-export facade slated for deletion -
  never add to it.
- TRAP - `getFileUrl`/`getFilePreviewUrl` live in
  `features/models/api/modelApi.ts` and are imported cross-feature; import them,
  don't duplicate them (they will move to shared).

## Code placement (two trees exist - know the rule)

- `features/{name}/` - feature-specific code: `api/` ({feature}Api.ts +
  `queries.ts`), `components/`, `hooks/`, `types/`, `index.ts`.
- `src/shared/` - anything reusable across features. **New shared code goes
  here**, never in the legacy root `src/components|hooks|utils` trees (queued for
  merging; the app shell + tab system stay put).
- TRAP - the Settings UI is a large monolith at `components/tabs/Settings.tsx`,
  NOT in `features/settings` (which holds only its api/). Extract the section you
  touch rather than growing it.

## State split (strict)

- **Server state** → React Query only. **UI state** → Zustand stores in
  `src/stores/` (small, single-purpose). **Ephemeral** → `useState`.
- Query keys are inline string arrays with NO factory and mixed naming
  (`['models']` vs `['model-tags']`). A mismatched key silently stops
  invalidating - **grep the exact existing key before writing any
  `useQuery`/`invalidateQueries`; reuse it verbatim; never invent a variant.**
- Mutations invalidate related keys on success; optimistic updates where the
  neighbors do.

## Styling

- Token vocabulary/density: `design-tokens`; shared primitives/visual identity:
  `ui-primitives`; gallery/themes: `storybook-stories`. Read the relevant one
  before writing CSS/UI.
- `src/shared/styles/tokens.css` - use `var(--token)`; no new hardcoded colors.
- Component CSS is **global scope** - prefix class names with the component name.
- Shared UI = small dumb composable primitives, not type-aware mega-components;
  the Models tab is the design identity other tabs follow.
- **New asset type? STOP - do not copy an existing `XList.tsx`;** that's the
  six-clone problem being dismantled.

Forms use `react-hook-form` + `zodResolver`; composable Zod schemas in
`src/shared/validation/formSchemas.ts`.

## Demo mode

- `VITE_DEMO_MODE=true` (`.env.demo`); MSW intercepts - static mocks in
  `src/mocks/handlers.ts`, interactive in `dynamicDemoHandlers.ts`, data persists
  in IndexedDB (`src/mocks/db/demoDb.ts`).
- **When backend API shape/endpoints change, update demo handlers to match** and
  validate `npm run build:demo` for demo-visible changes.

## SignalR

`services/ThumbnailSignalRService.ts` (singleton) emits `ThumbnailStatusChanged`,
`ActiveVersionChanged`, `EnvironmentMapThumbnailStatusChanged`; demo mode stubs
those endpoints in `dynamicDemoHandlers.ts` (prevents 405s).

## Tabs

New tab type = six places: the `TabType` union in `src/shared/types/ui.ts`, a case
in `TabContent.tsx`, a tile in `NewTabPage.tsx` (TILES + `RECENT_TAB_ICON`),
icon+tooltip cases in `DraggableTab.tsx`, a label case in `navigationStore.ts`
`getTabLabel`, and BOTH allowlists in `tabSerialization.ts` (missing there = the
tab type is rejected on session restore). Ripple: docs-audit checks the union
against `user-interface.md` (`tabLabels` entry in `scripts/docs-audit/index.mjs`).

Three.js / geometry / pixel-decode logic the worker render or demo mode must
reproduce **identically** lives once in `src/asset-processor/lib/` (injected-dep
ESM, relative import) - see `asset-processor-patterns`.

## Testing

- **Jest** (not Vitest) + `@testing-library/react` + `user-event`; files
  `__tests__/*.test.ts(x)`. Conventions live in **`frontend-test-authoring`**;
  read it before writing any test.
- When editing a 500+ line component, extract + test the section you touch.

## Verify

`cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`

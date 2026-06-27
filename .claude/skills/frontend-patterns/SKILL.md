---
name: frontend-patterns
description: Modelibr frontend conventions — feature modules, apiBase/axios routing, React Query vs Zustand state split, forms, demo mode (MSW), SignalR, tab system, Jest testing. Use when creating or editing code under src/frontend.
---

# Frontend patterns (React + TypeScript + Vite)

## API layer
- All HTTP goes through feature-local API modules under
  `src/frontend/src/features/*/api/` using the shared axios client
  `src/frontend/src/lib/apiBase.ts`.
- `services/ApiClient.ts` is a backward-compat re-export facade — never add new
  fetch logic or API methods there. No raw `fetch()`, no hardcoded base URLs.

## Feature module structure
`src/frontend/src/features/{name}/` contains: `api/` ({feature}Api.ts +
React Query `queries.ts`), `components/`, `hooks/`, `types/`, `index.ts` (public
re-exports).

## State split (strict)
- **Server state** → React Query: `queryOptions()` + `useQuery` hooks in feature
  `api/queries.ts`; `useMutation` with optimistic updates; invalidate related keys
  on success.
- **UI state** → Zustand stores in `src/frontend/src/stores/` (panels, navigation,
  viewer settings, upload progress, preferences).
- **Ephemeral component state** → `useState` only.

## Forms
`react-hook-form` + `zodResolver`; composable Zod schemas in
`src/frontend/src/shared/validation/formSchemas.ts`.

## Demo mode
- Activates with `VITE_DEMO_MODE=true` (`src/frontend/.env.demo`); MSW intercepts
  API calls — static mocks in `src/mocks/handlers.ts`, interactive in
  `dynamicDemoHandlers.ts`; data persists in IndexedDB (`src/mocks/db/demoDb.ts`).
- **When backend API shape/endpoints change, check demo handlers for matching
  updates**, and validate `npm run build:demo` for demo-visible changes.
- Demo impact surface: `.env.demo`, `vite.config.js`, `vite-env.d.ts`,
  `package.json` (`build:demo`), `scripts/prepare-demo-assets.js`.

## SignalR
- Real-time events via `services/ThumbnailSignalRService.ts` (singleton);
  events: `ThumbnailStatusChanged`, `ActiveVersionChanged`.
- Demo mode stubs SignalR endpoints in `dynamicDemoHandlers.ts` (prevents 405s).

## Tabs
New tab type = three places: a case in `TabContent.tsx`, an entry in
`useTabMenuItems()`, and the `TabType` union in `src/shared/types/ui.ts`.

## Shared viewer/worker logic (don't duplicate)
Three.js / geometry / pixel-decode logic you write for the viewer that the
worker's thumbnail render or demo mode must produce **identically** (STL mesh
build, TIFF decode, displacement-normal shader, …) is **shared code** — put it
once in `src/asset-processor/lib/` as an injected-dep ESM and import it by
relative path, rather than copying it into both viewers. See the
`asset-processor-patterns` skill, "Shared cross-runtime code".

## Design system
Build shared UI as small composable primitives, not type-aware mega-components;
the Models tab is the design identity other asset tabs follow.

## Testing
- **Jest** (not Vitest) + `@testing-library/react` + `user-event`;
  files `__tests__/*.test.ts(x)`.

## Verify
`cd src/frontend && npm test && npm run lint && npm run build`

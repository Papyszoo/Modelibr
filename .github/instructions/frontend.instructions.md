---
name: "Modelibr Frontend Instruction"
description: "Use when editing Modelibr React and TypeScript frontend files. Covers feature module structure, React Query, Zustand, apiBase, demo mode, form handling, tabs, and verification."
applyTo: "src/frontend/**"
---

# Frontend Patterns

## API Layer

- Route HTTP through feature-local API modules under `src/frontend/src/features/*/api/` using the shared axios client from `src/frontend/src/lib/apiBase.ts`.
- `src/frontend/src/services/ApiClient.ts` is a re-export facade for backward compatibility — do not add new fetch logic or API methods there.
- Never add raw `fetch()` calls or hardcoded base URLs.

## Feature Module Structure

Each feature lives under `src/frontend/src/features/{name}/` with:

- `api/` — HTTP calls (`{feature}Api.ts`) and React Query definitions (`queries.ts`)
- `components/` — React components
- `hooks/` — feature-specific hooks
- `types/` — feature-scoped DTOs and interfaces
- `index.ts` — public re-exports

## State Management

- **Server state**: React Query (`@tanstack/react-query`). Define `queryOptions()` and `useQuery` hooks in feature `api/queries.ts`. Use `useMutation` with optimistic updates for writes. Invalidate related query keys on success.
- **UI state**: Zustand stores under `src/frontend/src/stores/` for panels, navigation, viewer settings, upload progress, and preferences.
- **Component-local state**: `useState` for ephemeral UI state that doesn't need to survive component unmount.

## Forms

- Use `react-hook-form` with `zodResolver` and Zod schemas from `src/frontend/src/shared/validation/formSchemas.ts`.
- Keep validation schemas composable and reusable across dialogs.

## Demo Mode

- Demo mode activates when `VITE_DEMO_MODE=true` (set in `src/frontend/.env.demo`).
- MSW intercepts API calls via handlers in `src/frontend/src/mocks/`. Static mocks live in `handlers.ts`; interactive mocks in `dynamicDemoHandlers.ts`.
- Demo data persists in IndexedDB via `src/frontend/src/mocks/db/demoDb.ts`.
- When backend API shape or endpoints change, check if demo handlers need matching updates.

## SignalR

- Real-time events flow through `src/frontend/src/services/ThumbnailSignalRService.ts` (singleton).
- Events: `ThumbnailStatusChanged`, `ActiveVersionChanged`.
- Demo mode stubs SignalR endpoints in `dynamicDemoHandlers.ts` to prevent 405 errors.

## Tabs

- When adding a new tab type: add a case in `TabContent.tsx` switch, an entry in `useTabMenuItems()`, and update the `TabType` union in `src/frontend/src/shared/types/ui.ts`.

## Testing

- Vitest + `@testing-library/react` + `@testing-library/user-event`.
- Test files follow `__tests__/*.test.tsx` or `*.test.ts` convention.

## Verification

- Verify frontend work with `cd src/frontend && npm test && npm run lint && npm run build`.

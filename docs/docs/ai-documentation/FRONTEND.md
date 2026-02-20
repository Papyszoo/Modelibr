---
sidebar_position: 2
---

# Frontend Development Guide

React application with TypeScript, Three.js for 3D rendering, PrimeReact UI components, and React Query for server state.

## Quick Start

```bash
cd src/frontend
npm install
npm run dev          # Start at http://localhost:5173
```

**Environment:** Set `VITE_API_BASE_URL` in the root `.env`

---

## Project Structure

```
src/frontend/src/
├── features/              # Feature-based modules (primary code location)
│   ├── texture-set/       # Texture set management (44 files)
│   ├── model-viewer/      # 3D viewer and controls (38 files)
│   ├── models/            # Model list and upload
│   ├── recycled-files/    # Recycle bin functionality
│   ├── stage-editor/      # Stage/environment editing
│   ├── sprite/            # Sprite sheets
│   ├── pack/              # Asset packs (thin wrapper → ContainerViewer)
│   ├── project/           # Project management (thin wrapper → ContainerViewer)
│   ├── thumbnail/         # Thumbnail display
│   └── history/           # Upload history
├── shared/                # Shared components and types
│   ├── components/        # ContainerViewer, UploadableGrid
│   └── types/             # ContainerTypes (adapter pattern)
├── components/            # Shared UI components
├── hooks/                 # Shared custom hooks
├── contexts/              # React Context providers
├── services/              # API clients
│   └── ApiClient.ts       # Legacy facade (avoid importing from components)
├── stores/                # Zustand stores
└── utils/                 # Helper functions
```

---

## Server State (React Query)

- Query client config: `src/lib/react-query.ts` (app-wide `QueryClient`)
- App wiring: `src/main.tsx` (`ErrorBoundary` + `QueryClientProvider` + devtools)
- Feature queries: `features/*/api/queries.ts` exports `queryOptions` + `useQuery` wrappers
- Mutations: prefer `useMutation` in components and `queryClient.invalidateQueries()` on success/settle
- API calls: prefer feature-local modules like `features/pack/api/packApi.ts` over importing `services/ApiClient` in components
- Axios base client: `src/lib/apiBase.ts` centralizes request/response interceptors (default `Accept` header + normalized `ApiClientError` for consistent `error.message` handling)
- Recent migration examples:
    - `features/texture-set/components/TextureSetList.tsx` now uses React Query `useMutation` for create/delete texture-set actions.
    - `features/thumbnail/hooks/useThumbnail.ts` now invalidates model queries on SignalR thumbnail/version events.
    - `features/stage-editor/components/StageList.tsx` now uses `useMutation` for stage creation instead of inline async try/catch writes.
    - `features/model-viewer/components/ModelInfo.tsx` now uses `useMutation` for tag/description saves and texture-set disassociation with model query invalidation.
    - `features/texture-set/components/TextureSetModelList.tsx` now uses `useMutation` for model linking and invalidates model list/detail queries.
    - `features/sounds/components/SoundCard.tsx` now uses `getFileUrl(...)` consistently and restores the `.sound-card` root class (required by sound card styling and e2e selectors).
    - `features/texture-set/components/TextureSetList.tsx` now uses `features/texture-set/api/queries.ts` (`queryOptions` + `useTextureSetsQuery`) for server state reads while keeping load-more UX.
    - `features/stage-editor/components/StageList.tsx` now uses `features/stage-editor/api/queries.ts` (`useStagesQuery`) for reads and invalidation-based refresh after create.
    - `features/models/components/ModelVersionHistory.tsx` now uses `features/model-viewer/api/queries.ts` (`useModelVersionsQuery`) for version list loading.
    - `components/tabs/Settings.tsx` now uses `features/settings/api/queries.ts` (`useSettingsQuery`) for initial settings load.

---

## Form Validation

- Preferred stack: `react-hook-form` + `zod` + `@hookform/resolvers`
- Shared schemas live in `src/shared/validation/formSchemas.ts`
- Keep form UX behavior unchanged when migrating (same submit/cancel flow, same toasts/messages)
- Current migrated examples:
    - `features/texture-set/dialogs/CreateTextureSetDialog.tsx`
    - `features/texture-set/dialogs/SetHeader.tsx`
    - `features/sprite/components/SpriteList.tsx` (category create/edit + sprite rename dialog controls)
    - `components/tabs/Settings.tsx` (settings form fields)
    - `features/sounds/components/SoundList.tsx` (category create/edit dialog)
    - `features/pack/components/PackList.tsx` (create pack dialog)
    - `features/project/components/ProjectList.tsx` (create project dialog)

---

## Code Splitting

- Tab content in `components/layout/TabContent.tsx` uses `React.lazy` + `Suspense` for heavy feature entries so the initial bundle is reduced.
- Lazy-loaded tab views include: `ModelViewer`, `TextureSetList`, `TextureSetViewer`, `PackList`, `PackViewer`, `ProjectList`, `ProjectViewer`, `SpriteList`, `SoundList`, `StageList`, `StageEditor`, and `RecycledFilesList`.
- Fallback behavior remains tab-local via a lightweight loading state rendered inside the tab content area.

---

## Features

### Texture Sets

**Purpose:** Manage PBR texture collections that can be applied to 3D models. Each model version can have independent default texture sets. Texture sets are distinguished by **kind**:

- **Model-Specific (Baked)** — default; textures baked for a specific model's UV layout.
- **Universal (Tileable)** — seamless material textures (e.g., "Brick Wall", "Wood Floor") that can tile and be shared across models.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend components | `features/texture-set/components/` (22 files) |
| Frontend dialogs | `features/texture-set/dialogs/` (20 files) |
| Frontend hooks | `features/texture-set/hooks/` |
| Frontend types | `features/texture-set/types/index.ts` (`TextureSetKind`, `UvMappingMode` enums) |
| Backend API | `WebApi/Endpoints/TextureSetEndpoints.cs` |
| Backend domain | `Domain/Models/TextureSet.cs`, `Domain/ValueObjects/TextureSetKind.cs` |
| E2E tests | `tests/e2e/features/00-texture-sets/` |

**Key behaviors (from E2E tests):**

- Create texture sets by uploading images (auto-named from filename)
- Choose kind (Model-Specific or Universal) at creation time
- Filter list by kind using the tab bar (Model-Specific / Global Materials). Default tab is "Global Materials"
- Drag-and-drop texture sets between kind tabs to change their kind via API
- Custom tab buttons (not PrimeReact SelectButton) serve as drop targets for kind changes
- Universal sets show a "Universal (Tileable)" label in stats
- Universal sets have UV mapping mode toggle (Standard / Physical) in the 3D preview settings
- Physical mode shows a "Tile Size" slider (0.1–5m) that controls `uvScale` (world-space size of one tile)
- Standard mode shows Tile X / Tile Y sliders for direct repeat values
- UV mapping mode and scale auto-save after 1 second of debounce when adjusted
- Link texture sets to model versions (versions are independent)
- Set default texture per version (triggers thumbnail regeneration)
- Preview different textures in 3D viewer without setting as default

**Effects of changes:**

- Changing default texture set → triggers thumbnail worker job
- Linking/unlinking → updates ModelVersion associations
- Deleting texture set → affects all linked model versions
- Updating tiling scale / UV mapping → only allowed for Universal kind (API returns 400 for ModelSpecific)
- Adding texture to Universal set → auto-enqueues thumbnail generation (sphere preview)
- "Regenerate Thumbnail" button on Universal set viewer → re-queues sphere render job
- "Regenerate Thumbnail" option in TextureSetGrid context menu (right-click) for Universal sets
- Changing kind to Universal → auto-enqueues thumbnail generation on the backend

**EXR texture preview:**

The `TexturePreview` component supports EXR file rendering. EXR files are detected by filename extension. For EXR files, the component first attempts to load a server-side preview via `GET /files/{id}/preview` (a lightweight PNG generated by the worker during texture set processing). If the preview is available, it is displayed directly. If no preview exists (404), it falls back to direct EXR parsing: the file is fetched as `ArrayBuffer`, decoded using Three.js's `EXRLoader` (`three/examples/jsm/loaders/EXRLoader.js`), and rendered to a `<canvas>` element with Reinhard tone mapping. Single-channel EXR extraction is also supported. Components that display textures (`TextureCard`, `FilesTab`, `HeightCard`) use `TexturePreview` instead of raw `<img>` tags to enable EXR/HDR support. `HeightCard` uses the same CSS classes (`texture-card-with-preview`/`texture-preview-image`) and overlay pattern as `TextureCard` for consistent preview layout.

Direct EXR fallback protection: files exceeding 10 MB (`MAX_EXR_BYTES`) are skipped in the fallback path (an error state is shown instead of attempting decode). However, server-side previews work for EXR files of any size. Decoded EXR images are downsampled to a maximum canvas size of 512×512 to avoid excessive memory usage. The fetch uses an `AbortController` so pending downloads are cancelled on component unmount.

**File preview system:**

Thumbnail previews are auto-generated on file upload for all ImageSharp-compatible image formats (PNG, JPEG, BMP, GIF, WebP) as well as EXR files (via Magick.NET with Reinhard tone mapping). For texture files, 4 thumbnails are generated: RGB (composite), R (red channel), G (green channel), and B (blue channel). For sprite files, 1 RGB thumbnail is generated. Thumbnails are 256px (longest dimension, aspect ratio preserved) and saved as PNG at `{uploadRoot}/previews/{sha256Hash}.png` (RGB) and `{uploadRoot}/previews/{sha256Hash}_{channel}.png` (per-channel). Deduplicated files share the same preview since the path is hash-based.

The backend serves previews via `GET /files/{id}/preview?channel=rgb|r|g|b` (default: rgb). The worker can also upload previews for exotic formats (TGA) via `POST /files/{id}/preview/upload`.

All frontend preview surfaces use `getFilePreviewUrl(fileId, channel?)` from `modelApi.ts` instead of serving raw files. Components updated: `TextureCard`, `FilesTab`, `TextureSetGrid`, `HeightCard`, `SpriteList`, `TexturePreview`. The `TexturePreview` component is a simple `<img>` wrapper that applies channel-specific URL parameters based on the `sourceChannel` prop.

Generation is handled by `FileThumbnailGenerator` (Infrastructure layer, registered as singleton). It uses `IFilePreviewService` for storage and path resolution. The MIME type `"image/*"` (used by the domain for generic textures) is treated as a supported type. EXR files are detected by their 4-byte magic number (`0x76 0x2F 0x31 0x01`) and loaded via Magick.NET (ImageMagick) with Reinhard tone mapping matching the worker's `toneMapReinhard` function. Standard formats are loaded via ImageSharp. TGA files gracefully fail at the ImageSharp load step and are caught.

**3D texture preview shapes (`TexturedGeometry.tsx`):**

The texture-set viewer renders a 3D preview of applied textures on selectable geometry shapes: box, sphere, cylinder, or torus. The cylinder uses `openEnded: false` (caps visible).

Key rendering features:
- **Vertex welding**: All primitives are passed through `mergeVertices()` (from `BufferGeometryUtils`) before rendering. This welds shared vertices so displacement mapping doesn't tear the mesh at edges/seams.
- **Icosahedron for sphere**: The sphere uses `IcosahedronGeometry(radius, 5)` instead of `SphereGeometry` to provide uniform vertex distribution and eliminate pole-pinching artifacts.
- **Simple UV scaling**: The `uvScale` value from the database is used directly as `texture.repeat.set(scale, scale)`. No complex physical tiling calculations.
- **IBL lighting**: The preview uses `<Stage environment="city">` from `@react-three/drei` for Image-Based Lighting, providing realistic reflections and depth.

The component loads textures (standard + EXR) asynchronously, sets correct color spaces (sRGB for color textures, linear for data textures), and applies `RepeatWrapping`.

**Thumbnail generation for Universal sets:**

Universal (Global Material) texture sets get auto-generated sphere-preview thumbnails. When textures are added to a Universal set, the backend auto-enqueues a thumbnail job. The asset processor's `TextureSetProcessor` renders a sphere with the textures applied (albedo, normal, roughness, metallic, etc.), generates a single static image (30° angle, 15° elevation), and uploads the result. The frontend `TextureSetGrid` prefers the generated thumbnail URL over the albedo texture for Universal sets that have a `thumbnailPath`. The `TextureSetViewer` header shows a "Regenerate Thumbnail" button for Universal sets.

---

### Model Viewer

**Purpose:** Display 3D models with texture preview, version switching, and viewer controls.

**Where to look:**
| Layer | Location |
|-------|----------|
| Main viewer | `features/model-viewer/components/ModelViewer.tsx` (26KB - main orchestrator) |
| 3D rendering | `features/model-viewer/components/Model.tsx`, `TexturedModel.tsx` |
| Version strip | `features/model-viewer/components/VersionStrip.tsx` |
| Viewer settings | `features/model-viewer/components/ViewerSettings.tsx` |
| Model info panel | `features/model-viewer/components/ModelInfo.tsx` |
| Model hierarchy | `features/model-viewer/components/ModelHierarchy.tsx` |
| UV map display | `features/model-viewer/components/UVMapWindow.tsx` |
| Texture selector | `features/model-viewer/components/TextureSetSelectorWindow.tsx` |
| Backend API | `WebApi/Endpoints/ModelEndpoints.cs`, `ModelVersionEndpoints.cs` |
| E2E tests | `tests/e2e/features/01-model-viewer/` |

**Key behaviors (from E2E tests):**

- Render models in 3D canvas with controls visible
- Control buttons: Add Version, Viewer Settings, Model Info, Texture Sets, Model Hierarchy, Thumbnail Details, UV Map
- Version dropdown with thumbnail previews
- Switching versions updates viewer and file info

**Effects of changes:**

- Viewer changes → affects thumbnail generation (if settings differ)
- Version switching → loads different 3D file and associated textures
- Texture selection → updates 3D preview in real-time

---

### Model List

**Purpose:** Display library of 3D models with thumbnails, search, upload, and navigation to viewer.

**Where to look:**
| Layer | Location |
|-------|----------|
| Main list component | `features/models/components/ModelList.tsx` |
| Grid component | `features/models/components/ModelGrid/ModelGrid.tsx` |
| Grid types & props | `features/models/components/ModelGrid/types.ts` |
| Grid hook | `features/models/components/ModelGrid/useModelGrid.ts` |
| Filters bar | `features/models/components/ModelGrid/ModelsFilters.tsx` |
| Card width control | `features/models/components/ModelGrid/CardWidthButton.tsx` |
| Context menu | `features/models/components/ModelGrid/ModelContextMenu.tsx` |
| Header/controls | `features/models/components/ModelListHeader.tsx` |
| Version history | `features/models/components/ModelVersionHistory.tsx` |
| Empty/error states | `features/models/components/EmptyState.tsx`, `ErrorState.tsx` |
| Upload progress | `features/models/components/UploadProgress.tsx` |
| Backend API | `WebApi/Endpoints/ModelEndpoints.cs` |
| E2E tests | `tests/e2e/features/00-texture-sets/01-setup.feature` (model creation) |

**Key behaviors:**

- Display model cards with thumbnails
- Upload via drag-and-drop or file picker
- Click model card to open in viewer
- Show upload progress and status
- Context menu for model actions (delete, add to pack, add to project)
- ModelGrid is a reusable standalone component accepting `projectId`, `packId`, `textureSetId` props
- Filters are additive (pack + project can be combined)
- When a prop is provided, its corresponding filter is pre-selected and disabled
- Card width controlled via icon button with OverlayPanel slider

**Effects of changes:**

- Upload → creates thumbnail job, fires SignalR notification
- Delete → soft deletes to recycled files
- Click → opens ModelViewer in new tab

---

### Recycled Files

**Purpose:** Soft delete and restore models, versions, texture sets, sprites, sounds, and individual files. Protects shared files from permanent deletion.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend | `features/recycled-files/components/` |
| Backend API | `WebApi/Endpoints/RecycledFilesEndpoints.cs` |
| Backend API | `WebApi/Endpoints/FilesEndpoints.cs` (`DELETE /files/{id}` for soft-delete) |
| E2E tests | `tests/e2e/features/04-recycled-files/` (7 feature files) |

**Key behaviors (from E2E tests):**

- Recycled items disappear from main grids
- Recycled items appear in Recycle Bin (sections: Models, Model Versions, Texture Sets, Files, Sprites, Sounds)
- Thumbnails and previews display for all recycled item types (backend serves files/thumbnails regardless of soft-delete status)
- Recycled files list auto-refreshes on every mount (`staleTime: 0`) — no manual Refresh button
- Restore moves items back to main grids
- Permanent delete removes from database and disk
- Shared file protection: cannot permanently delete files used elsewhere
- Re-uploading a file whose hash matches a recycled file cleans up the recycled record

**File deletion flow:**

- **Files tab** (texture set viewer): "Delete" button below preview soft-deletes individual files → moves to Recycled Files
- **Texture Types tab**: × icon unlinks texture from type (file remains)
- **Recycled Files**: "Delete Forever" hard-deletes from both disk and database

**Effects of changes:**

- Soft delete → sets `IsDeleted=true`, removes from main queries
- Restore → clears `IsDeleted`, item reappears
- Permanent delete → cascading deletion respects shared files

---

### Upload Window

**Purpose:** Show upload progress for model files with batch support and history.

**Where to look:**
| Layer | Location |
|-------|----------|
| Upload progress | `components/UploadProgressWindow.tsx` (or similar) |
| Batch upload | Uses `batchId` parameter on uploads |
| History | `features/history/` |
| Backend API | `WebApi/Endpoints/ModelEndpoints.cs`, `BatchUploadEndpoints.cs` |
| E2E tests | `tests/e2e/features/03-upload-window/` |

**Key behaviors (from E2E tests):**

- Shows filename and extension during upload
- "Open in Tab" button navigates to model viewer
- Clicking "Open in Tab" twice activates existing tab (no duplicates)
- "Clear Completed" removes finished uploads from window
- Batch uploads group multiple files

**Effects of changes:**

- Upload → creates Model, triggers thumbnail generation
- Batch upload → groups uploads with shared batchId
- Open in Tab → creates or activates model viewer tab

---

### Dock System

**Purpose:** Tab-based panel management with URL state persistence. Enables shareable deep links to specific views.

**Where to look:**
| Layer | Location |
|-------|----------|
| Tab context | `contexts/TabContext.tsx` |
| Tab hook | `hooks/useTabContext.tsx` |
| Tab serialization | `utils/tabSerialization.ts` |
| Layout components | `components/layout/DockPanel.tsx`, `SplitterLayout.tsx` |
| URL state | Uses `nuqs` library |
| E2E tests | `tests/e2e/features/02-dock-system/` |

**Key behaviors (from E2E tests):**

- Tabs persist in URL (e.g., `?leftTabs=modelList,model-1&activeLeft=model-1`)
- Opening model adds tab to URL automatically
- Duplicate tabs are deduplicated on URL load
- URL deduplication removes repeated tab IDs

**Effects of changes:**

- Tab changes → URL updates (enables browser back/forward)
- URL changes → tabs update (enables bookmarks/sharing)
- Tab close → removes from URL

---

### Packs & Projects (ContainerViewer)

**Purpose:** Manage asset containers (Packs and Projects) that group Models, Texture Sets, Sprites, and Sounds. Both views share identical behavior via a shared `ContainerViewer` component.

**Architecture:** Strategy/Adapter pattern using `ContainerAdapter` interface.

**Where to look:**
| Layer | Location |
|-------|----------|
| Shared viewer | `shared/components/ContainerViewer.tsx` (~1500 lines - main logic) |
| Shared types | `shared/types/ContainerTypes.ts` (ContainerDto, ContainerAdapter) |
| Shared CSS | `shared/components/ContainerViewer.css` (container-\* prefix) |
| Pack wrapper | `features/pack/components/PackViewer.tsx` (~55 lines - thin adapter) |
| Project wrapper | `features/project/components/ProjectViewer.tsx` (~55 lines - thin adapter) |
| Backend API | `WebApi/Endpoints/PackEndpoints.cs`, `ProjectEndpoints.cs` |

**Key behaviors:**

- Pack/Project viewers are thin wrappers that provide a `ContainerAdapter` to `ContainerViewer`
- `ContainerAdapter` maps container-specific API methods (e.g., `ApiClient.addModelToPack` vs `ApiClient.addModelToProject`)
- All UI logic, state management, dialogs, and grid rendering live in the shared `ContainerViewer`
- Add/remove models, texture sets, sprites, sounds via dialog pickers
- Drag-and-drop file upload for textures, sprites, and sounds directly into container
- Context menus for item actions (remove from container)
- Collapsible sections with click-to-toggle headers and count badges
- Pagination with "Load More" pattern for each asset section (models, textures, sprites, sounds)
- Drag-and-drop upload works even on collapsed section headers
- Title displays "Pack: \{name\}" or "Project: \{name\}" format
- Header shows counts for all asset types including sounds

**Effects of changes:**

- Changes to `ContainerViewer.tsx` affect BOTH Pack and Project views
- To add container-specific behavior, extend the `ContainerAdapter` interface
- CSS uses `container-` prefix (not `pack-` or `project-`)
- Pagination uses `ApiClient.*Paginated()` methods directly (not through adapter)

---

### Thumbnails

**Purpose:** Display model thumbnails with real-time generation status via SignalR.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend components | `features/thumbnail/` |
| Thumbnail display | `features/model-viewer/components/ThumbnailWindow.tsx` |
| Model list display | `features/models/components/ModelGrid/ModelGrid.tsx` (thumbnail cards) |
| Backend API | `WebApi/Endpoints/ThumbnailEndpoints.cs` (487 lines - many endpoints) |
| Worker service | `src/thumbnail-worker/` (see `docs/WORKER.md`) |
| SignalR updates | Worker sends status via SignalR hub |

**Key behaviors:**

- Auto-generated on model upload
- Status: NotGenerated, Pending, Processing, Ready, Failed
- SignalR broadcasts status changes in real-time via `AllModelsGroup`
- `ThumbnailSignalRService` is a singleton — `connect()` awaits pending connections to avoid StrictMode races
- `useThumbnailSignalR([])` in `App.tsx` ensures connection at app startup
- Auto-reconnect re-joins `AllModelsGroup` automatically
- `useThumbnail` hook independently subscribes to SignalR for cache-busted thumbnail refresh
- Custom thumbnails can be uploaded

**Effects of changes:**

- Changing default texture → triggers thumbnail regeneration
- Version upload → new thumbnail job queued
- Worker failure → status stays at "Failed"

---

## API Integration

**ALWAYS use ApiClient** - never use fetch directly:

```typescript
import apiClient from "../../services/ApiClient";

const models = await apiClient.getModels();
const textureSet = await apiClient.getTextureSet(id);
```

### Pagination

All list endpoints support server-side pagination via "Load More" pattern. Use paginated methods for list views:

```typescript
// Paginated methods (bypass cache, used in list components)
const result = await apiClient.getModelsPaginated(page, pageSize); // → PaginatedResponse<Model>
const result = await apiClient.getSoundsPaginated({ page, pageSize }); // → { sounds, totalCount, page, pageSize, totalPages }
const result = await apiClient.getSpritesPaginated({ page, pageSize });
const result = await apiClient.getTextureSetsPaginated({ page, pageSize });
```

List components use `PaginationState` from `types/index.ts` to track `page`, `totalPages`, `totalCount`, and `hasMore`. The `loadMore` parameter controls whether results append to the existing list (`true`) or replace it (`false` / default). Category filtering for Sounds/Sprites is applied client-side after fetching paginated data.

---

## State Management

| Type            | When to use                   | Example                           |
| --------------- | ----------------------------- | --------------------------------- |
| **Zustand**     | Navigation, tabs, persistence | `useNavigationStore`              |
| **Zustand**     | Cached API data               | `useApiCacheStore`                |
| **Zustand**     | Panel sizes, card widths      | `usePanelStore`, `cardWidthStore` |
| **Context**     | Cross-component (dock layout) | `DockContext`                     |
| **React Query** | Server state, entity data     | `useQuery`, `useMutation`         |
| **Local state** | Component-specific            | `useState`                        |

### Navigation Store (`stores/navigationStore.ts`)

The primary store for tab and window management. Replaces the former URL-based state (`useQueryState`/nuqs) and `TabContext`.

- **Multi-window aware**: Each browser tab gets a UUID in `sessionStorage`, stored as a key in `activeWindows: Record<windowId, WindowState>`
- **WindowState**: `{ tabs: Tab[], activeTabId, activeRightTabId, splitterSize, lastActiveAt }`
- **Independent panel active tabs**: Left and right panels track their active tab independently via `activeTabId` (left) and `activeRightTabId` (right). Clicking a tab in one panel does not affect the other panel's active tab. `SplitterLayout` derives per-panel active tabs from these two fields.
- **Persisted to localStorage** via Zustand `persist` middleware (survives F5)
- **Cross-window sync**: `BroadcastChannel('modelibr_navigation')` for tab moves, window close events
- **Session recovery**: `recentlyClosedTabs` (max 10) and `recentlyClosedWindows` (max 5) stored in the global store
- **Stale window GC**: Windows inactive >24h are automatically pruned on init
- **Tab creation**: Always use `createTab(type, id?, name?)` factory — populates `params`, `internalUiState`, and legacy accessors
- **Per-tab UI state**: `tab.internalUiState` persists sub-tab indices, scroll positions, etc. via `useTabUiState(tabId, key, default)` hook

#### Key hooks

| Hook                 | File                          | Purpose                                                                                              |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `useWindowInit`      | `hooks/useWindowInit.ts`      | Initialize window in store, setup BroadcastChannel, pagehide broadcast (no store mutation on unload) |
| `useDeepLinkHandler` | `hooks/useDeepLinkHandler.ts` | Parse URL deep links (`/view/model/123`), open tab, clean URL                                        |
| `useTabUiState`      | `hooks/useTabUiState.ts`      | Generic `[value, setter]` for persistent per-tab UI state                                            |
| `useSessionRecovery` | `hooks/useSessionRecovery.ts` | Access recently closed windows and restore them                                                      |

---

## Design Philosophy

- **Named exports only**: All components use named exports (`export function ComponentName` / `export const ComponentName`). No `export default` except `App.tsx` and `main.tsx`. Barrel files (`index.ts`) re-export with `export { Name } from './File'`.
- **Single responsibility**: One component, one job
- **Direct API calls**: No unnecessary abstractions
- **Local state default**: Lift only when needed
- **Don't create hooks** unless reused 3+ times

---

## Technology Stack

- **React 18+**, TypeScript, Vite
- **Three.js** + React Three Fiber + Drei
- **PrimeReact** UI components
- **Zustand** for navigation/tab state (persisted to localStorage)
- **React Query** for server state

---

## Testing

```bash
npm test              # Run tests
npm run storybook     # Component docs at http://localhost:6006
```

---

## Related Docs

- Backend API: `docs/BACKEND_API.md`
- Worker: `docs/WORKER.md`
- E2E Tests: `tests/e2e/README.md`

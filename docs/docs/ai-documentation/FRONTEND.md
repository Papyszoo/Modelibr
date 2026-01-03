---
sidebar_position: 2
---

# Frontend Development Guide

React 18+ application with TypeScript, Three.js for 3D rendering, and PrimeReact UI components.

## Quick Start

```bash
cd src/frontend
npm install
npm run dev          # Start at http://localhost:5173
```

**Environment:** Set `VITE_API_BASE_URL` in root `.env` or `src/frontend/.env`

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
│   ├── pack/              # Asset packs
│   ├── project/           # Project management
│   ├── thumbnail/         # Thumbnail display
│   └── history/           # Upload history
├── components/            # Shared UI components
├── hooks/                 # Shared custom hooks
├── contexts/              # React Context providers
├── services/              # API clients
│   └── ApiClient.ts       # Backend API (ALWAYS use this)
├── stores/                # Zustand stores
└── utils/                 # Helper functions
```

---

## Features

### Texture Sets

**Purpose:** Manage PBR texture collections that can be applied to 3D models. Each model version can have independent default texture sets.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend components | `features/texture-set/components/` (22 files) |
| Frontend dialogs | `features/texture-set/dialogs/` (20 files) |
| Frontend hooks | `features/texture-set/hooks/` |
| Backend API | `WebApi/Endpoints/TextureSetEndpoints.cs` |
| Backend domain | `Domain/Models/TextureSet.cs` |
| E2E tests | `tests/e2e/features/00-texture-sets/` |

**Key behaviors (from E2E tests):**
- Create texture sets by uploading images (auto-named from filename)
- Link texture sets to model versions (versions are independent)
- Set default texture per version (triggers thumbnail regeneration)
- Preview different textures in 3D viewer without setting as default

**Effects of changes:**
- Changing default texture set → triggers thumbnail worker job
- Linking/unlinking → updates ModelVersion associations
- Deleting texture set → affects all linked model versions

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
| Backend API | `WebApi/Endpoints/ModelsEndpoints.cs`, `ModelVersionEndpoints.cs` |
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
| Grid display | `features/models/components/ModelGrid.tsx` |
| Header/controls | `features/models/components/ModelListHeader.tsx` |
| Version history | `features/models/components/ModelVersionHistory.tsx` |
| Empty/error states | `features/models/components/EmptyState.tsx`, `ErrorState.tsx` |
| Upload progress | `features/models/components/UploadProgress.tsx` |
| Backend API | `WebApi/Endpoints/ModelEndpoints.cs` (upload), `ModelsEndpoints.cs` (CRUD) |
| E2E tests | `tests/e2e/features/00-texture-sets/01-setup.feature` (model creation) |

**Key behaviors:**
- Display model cards with thumbnails
- Upload via drag-and-drop or file picker
- Click model card to open in viewer
- Show upload progress and status
- Context menu for model actions (delete, etc.)

**Effects of changes:**
- Upload → creates thumbnail job, fires SignalR notification
- Delete → soft deletes to recycled files
- Click → opens ModelViewer in new tab

---

### Recycled Files

**Purpose:** Soft delete and restore models, versions, texture sets, sprites. Protects shared files from permanent deletion.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend | `features/recycled-files/components/` |
| Backend API | `WebApi/Endpoints/RecycledFilesEndpoints.cs` |
| E2E tests | `tests/e2e/features/04-recycled-files/` (7 feature files) |

**Key behaviors (from E2E tests):**
- Recycled items disappear from main grids
- Recycled items appear in Recycle Bin
- Restore moves items back to main grids
- Permanent delete removes from database
- Shared file protection: cannot permanently delete files used elsewhere

**Effects of changes:**
- Soft delete → sets `IsRecycled=true`, removes from main queries
- Restore → clears `IsRecycled`, item reappears
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

### Thumbnails

**Purpose:** Display model thumbnails with real-time generation status via SignalR.

**Where to look:**
| Layer | Location |
|-------|----------|
| Frontend components | `features/thumbnail/` |
| Thumbnail display | `features/model-viewer/components/ThumbnailWindow.tsx` |
| Model list display | `features/models/components/ModelGrid.tsx` (thumbnail cards) |
| Backend API | `WebApi/Endpoints/ThumbnailEndpoints.cs` (487 lines - many endpoints) |
| Worker service | `src/thumbnail-worker/` (see `docs/WORKER.md`) |
| SignalR updates | Worker sends status via SignalR hub |

**Key behaviors:**
- Auto-generated on model upload
- Status: NotGenerated, Pending, Processing, Ready, Failed
- SignalR broadcasts status changes in real-time
- Frontend polls or listens for thumbnail completion
- Custom thumbnails can be uploaded

**Effects of changes:**
- Changing default texture → triggers thumbnail regeneration
- Version upload → new thumbnail job queued
- Worker failure → status stays at "Failed"

---

## API Integration

**ALWAYS use ApiClient** - never use fetch directly:

```typescript
import apiClient from '../../services/ApiClient'

const models = await apiClient.getModels()
const textureSet = await apiClient.getTextureSet(id)
```

---

## State Management

| Type | When to use | Example |
|------|-------------|---------|
| **URL state** | Tabs, navigation, shareable | `useQueryState` from nuqs |
| **Context** | Cross-component global state | TabContext |
| **Local state** | Component-specific | `useState` |
| **Zustand** | Cached API data | `useApiCacheStore` |

---

## Design Philosophy

- **Single responsibility**: One component, one job
- **Direct API calls**: No unnecessary abstractions
- **Local state default**: Lift only when needed
- **Don't create hooks** unless reused 3+ times

---

## Technology Stack

- **React 18+**, TypeScript, Vite
- **Three.js** + React Three Fiber + Drei
- **PrimeReact** UI components
- **nuqs** for URL state

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

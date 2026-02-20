---
sidebar_label: "Backend API"
sidebar_position: 1
---

# Backend API Reference

.NET 9.0 Web API built with Clean Architecture and Domain-Driven Design (DDD) principles.

:::info For AI Agents
This documentation is designed for AI agents to quickly understand the backend structure and locate code.
:::

## Base URL

- **Development:** `http://localhost:5009`
- **Docker (HTTP):** `http://localhost:8080`

## Quick Reference

### Model Upload & Management (10 endpoints)

| Method   | Endpoint                                  | Description                                                            |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `POST`   | `/models`                                 | Upload new 3D model                                                    |
| `POST`   | `/models/{modelId}/files`                 | Add file to existing model                                             |
| `POST`   | `/models/{modelId}/tags`                  | Update model tags/description                                          |
| `GET`    | `/models`                                 | List all models (?packId, ?projectId, ?textureSetId, ?page, ?pageSize) |
| `GET`    | `/models/{id}`                            | Get model details                                                      |
| `GET`    | `/models/{id}/file`                       | Download model file                                                    |
| `PUT`    | `/models/{id}/default-texture-set`        | Set default texture for version                                        |
| `POST`   | `/models/{id}/active-version/{versionId}` | Set active version                                                     |
| `DELETE` | `/models/{id}`                            | Soft delete model                                                      |
| `DELETE` | `/models/{modelId}/versions/{versionId}`  | Soft delete version                                                    |

### Model Versions (6 endpoints)

| Method | Endpoint                                                | Description              |
| ------ | ------------------------------------------------------- | ------------------------ |
| `POST` | `/models/{modelId}/versions`                            | Create new version       |
| `POST` | `/models/{modelId}/versions/{versionId}/files`          | Add file to version      |
| `GET`  | `/models/{modelId}/versions`                            | List all versions        |
| `GET`  | `/models/{modelId}/versions/{versionId}`                | Get version details      |
| `GET`  | `/models/{modelId}/versions/{versionId}/file`           | Download renderable file |
| `GET`  | `/models/{modelId}/versions/{versionId}/files/{fileId}` | Download specific file   |

### Files (5 endpoints)

| Method   | Endpoint                     | Description                                       | Auth        |
| -------- | ---------------------------- | ------------------------------------------------- | ----------- |
| `POST`   | `/files`                     | Upload a file (auto-generates thumbnail previews) | None        |
| `GET`    | `/files/{id}`                | Download any file by ID (incl. soft-deleted)      | None        |
| `GET`    | `/files/{id}/preview`        | Download PNG preview (?channel=rgb\|r\|g\|b)      | None        |
| `POST`   | `/files/{id}/preview/upload` | Upload PNG preview for a file (used by worker)    | `X-Api-Key` |
| `DELETE` | `/files/{id}`                | Soft-delete file (moves to Recycled Files)        | None        |

> **Note:** `GET /files/{id}` and `GET /files/{id}/preview` serve both active and soft-deleted files, enabling thumbnail display in the Recycled Files view. The same applies to model and model version thumbnail endpoints.

### Thumbnails - Models (4 endpoints)

| Method | Endpoint                            | Description                  | Auth        |
| ------ | ----------------------------------- | ---------------------------- | ----------- |
| `GET`  | `/models/{id}/thumbnail`            | Get thumbnail status         | None        |
| `POST` | `/models/{id}/thumbnail/regenerate` | Queue thumbnail regeneration | None        |
| `POST` | `/models/{id}/thumbnail/upload`     | Upload custom thumbnail      | `X-Api-Key` |
| `GET`  | `/models/{id}/thumbnail/file`       | Download thumbnail image     | None        |

### Thumbnails - Texture Sets (5 endpoints)

| Method | Endpoint                                  | Description                              | Auth        |
| ------ | ----------------------------------------- | ---------------------------------------- | ----------- |
| `POST` | `/texture-sets/{id}/thumbnail/upload`     | Upload WebP thumbnail for texture set    | `X-Api-Key` |
| `POST` | `/texture-sets/{id}/thumbnail/png-upload` | Upload PNG thumbnail for texture set     | `X-Api-Key` |
| `GET`  | `/texture-sets/{id}/thumbnail/file`       | Download WebP thumbnail image            | None        |
| `GET`  | `/texture-sets/{id}/thumbnail/png-file`   | Download PNG thumbnail image             | None        |
| `POST` | `/texture-sets/{id}/thumbnail/regenerate` | Queue texture set thumbnail regeneration | None        |

### Texture Sets (16 endpoints)

| Method   | Endpoint                                                 | Description                                                                                                          |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/texture-sets`                                          | List all texture sets (?packId, ?projectId, ?kind, ?page, ?pageSize)                                                 |
| `GET`    | `/texture-sets/{id}`                                     | Get texture set details (includes kind, tilingScaleX/Y, uvMappingMode, uvScale)                                      |
| `GET`    | `/texture-sets/by-file/{fileId}`                         | Get texture set containing a file                                                                                    |
| `POST`   | `/texture-sets`                                          | Create new texture set (JSON, optional kind: 0=ModelSpecific, 1=Universal)                                           |
| `POST`   | `/texture-sets/with-file`                                | Create texture set with file upload (?kind query param)                                                              |
| `PUT`    | `/texture-sets/{id}`                                     | Update texture set                                                                                                   |
| `PUT`    | `/texture-sets/{id}/kind`                                | Change texture set kind (0=ModelSpecific, 1=Universal); auto-enqueues thumbnail generation when changed to Universal |
| `PUT`    | `/texture-sets/{id}/tiling-scale`                        | Update tiling scale + UV mapping (Universal only; optional uvMappingMode, uvScale)                                   |
| `DELETE` | `/texture-sets/{id}`                                     | Soft delete texture set                                                                                              |
| `DELETE` | `/texture-sets/{id}/hard`                                | Hard delete (keeps files)                                                                                            |
| `POST`   | `/texture-sets/{id}/textures`                            | Add texture to set                                                                                                   |
| `DELETE` | `/texture-sets/{packId}/textures/{textureId}`            | Remove texture from set                                                                                              |
| `PUT`    | `/texture-sets/{setId}/textures/{textureId}/type`        | Change texture type                                                                                                  |
| `POST`   | `/texture-sets/{packId}/model-versions/{modelVersionId}` | Associate with model version                                                                                         |
| `DELETE` | `/texture-sets/{packId}/model-versions/{modelVersionId}` | Disassociate from model version                                                                                      |
| `POST`   | `/texture-sets/{packId}/models/{modelId}/all-versions`   | Associate with all model versions                                                                                    |

### Recycled Files (4 endpoints)

| Method   | Endpoint                                      | Description             |
| -------- | --------------------------------------------- | ----------------------- |
| `GET`    | `/recycled`                                   | List all recycled items |
| `POST`   | `/recycled/{entityType}/{entityId}/restore`   | Restore recycled item   |
| `GET`    | `/recycled/{entityType}/{entityId}/preview`   | Preview delete impact   |
| `DELETE` | `/recycled/{entityType}/{entityId}/permanent` | Permanently delete      |

### Worker API - Thumbnail Jobs (4 endpoints)

| Method | Endpoint                                      | Description                            |
| ------ | --------------------------------------------- | -------------------------------------- |
| `POST` | `/thumbnail-jobs/dequeue`                     | Dequeue next job (workers only)        |
| `POST` | `/thumbnail-jobs/{jobId}/complete`            | Mark model job complete (workers only) |
| `POST` | `/thumbnail-jobs/texture-sets/{jobId}/finish` | Mark texture set job complete/failed   |
| `POST` | `/test/thumbnail-complete/{modelId}`          | Test completion notification (dev)     |

**Total:** 49 endpoints

## Pagination

List endpoints (`/models`, `/texture-sets`, `/sprites`, `/sounds`) support optional server-side pagination via query parameters:

| Parameter  | Type | Description                                      |
| ---------- | ---- | ------------------------------------------------ |
| `page`     | int  | Page number (1-based). Required with `pageSize`. |
| `pageSize` | int  | Items per page. Required with `page`.            |

**When paginated** (both `page` and `pageSize` provided), returns:

```json
{
  "items": [...],
  "totalCount": 100,
  "page": 1,
  "pageSize": 20,
  "totalPages": 5
}
```

**When not paginated** (params omitted), returns a flat array for backward compatibility. WebDAV and other internal consumers rely on this.

## Architecture Overview

The backend follows Clean Architecture with strict layer separation:

```
WebApi → Application → Domain ← Infrastructure
              ↓              ↑
         SharedKernel ← ← ← ← ↑
```

### Key Files

| What                       | Where                                        |
| -------------------------- | -------------------------------------------- |
| API Endpoints              | `src/WebApi/Endpoints/*.cs`                  |
| Commands/Queries           | `src/Application/*/`                         |
| Domain Entities            | `src/Domain/Models/*.cs`                     |
| Repository Interfaces      | `src/Application/Abstractions/Repositories/` |
| Repository Implementations | `src/Infrastructure/Data/Repositories/`      |
| DI Registration            | `src/*/DependencyInjection.cs`               |

## Texture Types

```
Albedo, Normal, Metallic, Roughness, AmbientOcclusion, Emissive, Height, Opacity
```

## File Upload Limits

- **Kestrel MaxRequestBodySize**: 1 GB (configured in `Program.cs`)
- **FormOptions MultipartBodyLengthLimit**: 1 GB (configured in `Program.cs`)
- **nginx client_max_body_size**: 1024 MB (configured in `nginx/nginx.conf`)
- **Application-level validation**: Configured via Settings page, stored in database (`maxFileSizeBytes`)

Files are stored using hash-based deduplication (`HashBasedFileStorage`). When permanently deleting entities, orphaned `File` records and physical files are cleaned up if no other entity references the same hash.

## Error Handling

Errors are returned as JSON with `error.code` and `error.message`.

## Read-Only Query Pattern for Specialized Components

Specialized infrastructure components (WebDAV, Blender addon layer) that need complex data graphs should **query DbContext directly** rather than using shared repositories.

### Why?

- **Repositories stay lean** - Frontend calls don't over-fetch data
- **Specialized queries** - Each component crafts exactly the includes it needs
- **Read-only optimization** - Use `AsNoTracking()` for performance
- **Self-contained** - Optimizations don't affect other consumers

### Pattern

```csharp
// In specialized infrastructure component (e.g., VirtualAssetStore)
private async Task<Project?> GetProjectWithFullAssetGraph(IServiceProvider sp, string name)
{
    var dbContext = sp.GetRequiredService<ApplicationDbContext>();

    return await dbContext.Projects
        .AsNoTracking()           // Read-only, no change tracking
        .Include(p => p.Models)
            .ThenInclude(m => m.Versions)
                .ThenInclude(v => v.Files)
        .Include(p => p.Sounds)
            .ThenInclude(s => s.File)
        .AsSplitQuery()           // Prevent cartesian explosion
        .FirstOrDefaultAsync(p => p.Name == name);
}
```

### When to Use

| Use Case                   | Approach                            |
| -------------------------- | ----------------------------------- |
| Frontend API endpoints     | Use repositories (lean queries)     |
| WebDAV virtual file system | Direct DbContext with full includes |
| Blender addon data export  | Direct DbContext with full includes |
| Write operations           | Always use repositories             |

### Key Rules

1. **Read-only access only** - Never modify entities fetched this way
2. **Always use `AsNoTracking()`** - Since we're not tracking changes
3. **Use `AsSplitQuery()`** - When including multiple collections to avoid cartesian products
4. **Keep in Infrastructure layer** - This pattern is for Infrastructure components, not Application layer

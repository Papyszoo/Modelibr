# API Endpoints Overview

Complete overview of all Modelibr Backend API endpoints.

## Endpoints Summary

### Models (5 endpoints)

| Method | Endpoint | Purpose | Content Type |
|--------|----------|---------|--------------|
| POST | `/models` | Upload new 3D model | multipart/form-data |
| POST | `/models/{modelId}/files` | Add file to model | multipart/form-data |
| GET | `/models` | List all models | - |
| GET | `/models/{id}` | Get model details | - |
| GET | `/models/{id}/file` | Download model file | - |

### Files (1 endpoint)

| Method | Endpoint | Purpose | Content Type |
|--------|----------|---------|--------------|
| GET | `/files/{id}` | Download any file | - |

### Thumbnails (4 endpoints)

| Method | Endpoint | Purpose | Content Type |
|--------|----------|---------|--------------|
| GET | `/models/{id}/thumbnail` | Get thumbnail status | - |
| POST | `/models/{id}/thumbnail/regenerate` | Queue thumbnail regeneration | - |
| POST | `/models/{id}/thumbnail/upload` | Upload custom thumbnail | multipart/form-data |
| GET | `/models/{id}/thumbnail/file` | Download thumbnail image | - |

### Texture Packs (9 endpoints)

| Method | Endpoint | Purpose | Content Type |
|--------|----------|---------|--------------|
| GET | `/texture-packs` | List all texture packs | - |
| GET | `/texture-packs/{id}` | Get texture pack details | - |
| POST | `/texture-packs` | Create texture pack | application/json |
| PUT | `/texture-packs/{id}` | Update texture pack | application/json |
| DELETE | `/texture-packs/{id}` | Delete texture pack | - |
| POST | `/texture-packs/{id}/textures` | Add texture to pack | application/json |
| DELETE | `/texture-packs/{packId}/textures/{textureId}` | Remove texture from pack | - |
| POST | `/texture-packs/{packId}/models/{modelId}` | Associate pack with model | - |
| DELETE | `/texture-packs/{packId}/models/{modelId}` | Disassociate from model | - |

### Thumbnail Jobs - Worker API (3 endpoints)

| Method | Endpoint | Purpose | Content Type |
|--------|----------|---------|--------------|
| POST | `/api/thumbnail-jobs/dequeue` | Get next job (workers) | application/json |
| POST | `/api/thumbnail-jobs/{jobId}/complete` | Complete job (workers) | application/json |
| POST | `/api/test/thumbnail-complete/{modelId}` | Test notification (dev) | application/json |

## Total: 22 Endpoints

- **5** Model management endpoints
- **1** File download endpoint
- **4** Thumbnail endpoints
- **9** Texture pack endpoints
- **3** Worker/testing endpoints

## Endpoints by HTTP Method

### GET (8 endpoints)
- `/models`
- `/models/{id}`
- `/models/{id}/file`
- `/models/{id}/thumbnail`
- `/models/{id}/thumbnail/file`
- `/files/{id}`
- `/texture-packs`
- `/texture-packs/{id}`

### POST (10 endpoints)
- `/models`
- `/models/{modelId}/files`
- `/models/{id}/thumbnail/regenerate`
- `/models/{id}/thumbnail/upload`
- `/texture-packs`
- `/texture-packs/{id}/textures`
- `/texture-packs/{packId}/models/{modelId}`
- `/api/thumbnail-jobs/dequeue`
- `/api/thumbnail-jobs/{jobId}/complete`
- `/api/test/thumbnail-complete/{modelId}`

### PUT (1 endpoint)
- `/texture-packs/{id}`

### DELETE (3 endpoints)
- `/texture-packs/{id}`
- `/texture-packs/{packId}/textures/{textureId}`
- `/texture-packs/{packId}/models/{modelId}`

## Content Types

### Request Content Types
- `multipart/form-data` - File uploads (3 endpoints)
- `application/json` - JSON data (7 endpoints)
- No body - GET and some POST/DELETE (12 endpoints)

### Response Content Types
- `application/json` - Most endpoints
- Binary data - File/thumbnail downloads
- No content - DELETE operations (204)

## Authentication & Authorization

Currently no authentication required. Future versions may implement:
- API key authentication
- OAuth 2.0
- Role-based access control

## Rate Limiting

No rate limiting currently implemented.

## CORS Configuration

Development CORS allows:
- `http://localhost:3000`
- `https://localhost:3000`

Configure additional origins in application settings.

## SignalR Hubs

Real-time communication via SignalR:

### Thumbnail Hub
- **URL**: `/thumbnailHub`
- **Events**: `ThumbnailStatusChanged`

### Thumbnail Job Hub
- **URL**: `/thumbnailJobHub`
- **Events**: `JobAdded`, `JobUpdated`, `JobCompleted`

## See Also

- [Main API Documentation](./README.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Model Endpoints](./endpoints/models.md)
- [Thumbnail Endpoints](./endpoints/thumbnails.md)
- [Texture Pack Endpoints](./endpoints/texture-packs.md)
- [Worker API](./endpoints/thumbnail-jobs.md)

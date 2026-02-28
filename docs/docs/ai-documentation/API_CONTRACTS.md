# API Contracts Documentation

This document describes the API endpoints used by the frontend and E2E tests. It serves as a contract reference to ensure tests match actual API behavior.

## Models

### List Models

```http
GET /models
GET /models?packId={id}
GET /models?projectId={id}
```

**Response:**

```json
[
    {
        "id": 1,
        "name": "test-cube",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z",
        "activeVersionId": 1,
        "thumbnailUrl": "/models/1/thumbnail/file?t=..."
    }
]
```

### Get Model Details

```http
GET /models/{id}
```

**Response:** Returns model details WITHOUT versions array. Use version-specific endpoints for version data.

```json
{
  "id": 1,
  "name": "test-cube",
  "activeVersionId": 1,
  "files": [...],
  "packs": [...],
  "projects": [...],
  "textureSets": [...]
}
```

> **Note:** No `versions` property exists in this response.

### Upload Model (Create)

```http
POST /models
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: Model file (.glb, .fbx, etc.)

### Upload New Version

```http
POST /models/{id}/versions?setAsActive=false
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: Model file

**Required query param:** `setAsActive=false` or `setAsActive=true`

### Set Active Version

```http
POST /models/{id}/active-version/{versionId}
```

### Delete Model (Soft)

```http
DELETE /models/{id}
```

### Delete Version (Soft)

```http
DELETE /models/{modelId}/versions/{versionId}
```

---

## Sprites

### List Sprites

```http
GET /sprites
```

### Get Sprite

```http
GET /sprites/{id}
```

### Create Sprite

```http
POST /sprites
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: Image file
- `name`: Sprite name
- `spriteType`: 1 (static), 2 (sprite sheet), 3 (GIF), 4 (APNG), 5 (WebP)
- `categoryId` (optional): Category to assign

### Update Sprite

```http
PUT /sprites/{id}
Content-Type: application/json
```

**Body:**

```json
{
    "name": "new-name",
    "categoryId": 1
}
```

> **Note:** Uses PUT, not PATCH.

### Delete Sprite (Soft)

```http
DELETE /sprites/{id}
```

---

## Sprite Categories

### List Categories

```http
GET /sprite-categories
```

**Response:**

```json
{
    "categories": [{ "id": 1, "name": "Test Category", "description": "..." }]
}
```

### Create Category

```http
POST /sprite-categories
Content-Type: application/json
```

**Body:**

```json
{
    "name": "Category Name",
    "description": "Optional description"
}
```

### Update Category

```http
PUT /sprite-categories/{id}
```

### Delete Category

```http
DELETE /sprite-categories/{id}
```

---

## Packs

### List Packs

```http
GET /packs
```

### Get Pack

```http
GET /packs/{id}
```

### Create Pack

```http
POST /packs
Content-Type: application/json
```

**Body:**

```json
{
    "name": "Pack Name",
    "description": "Optional"
}
```

### Add Model to Pack

```http
POST /packs/{packId}/models/{modelId}
```

### Remove Model from Pack

```http
DELETE /packs/{packId}/models/{modelId}
```

---

## Projects

### List Projects

```http
GET /projects
```

### Create Project

```http
POST /projects
Content-Type: application/json
```

**Body:**

```json
{
    "name": "Project Name",
    "description": "Optional"
}
```

### Add Model to Project

```http
POST /projects/{projectId}/models/{modelId}
```

### Remove Model from Project

```http
DELETE /projects/{projectId}/models/{modelId}
```

---

## Texture Sets

### List Texture Sets

```http
GET /texture-sets?kind=0&page=1&pageSize=20
```

Query params:

- `kind` (optional): `0` = ModelSpecific, `1` = Universal
- `page`, `pageSize`: pagination

Response includes `thumbnailPath` (string, nullable) for each texture set.

### Get Texture Set Detail

```http
GET /texture-sets/{id}
```

Response includes `thumbnailPath` and `pngThumbnailPath` (string, nullable).

### Create Texture Set

```http
POST /texture-sets
Content-Type: application/json
```

```json
{
    "name": "My Texture Set",
    "kind": 0
}
```

- `kind` (optional): `0` = ModelSpecific (default), `1` = Universal

### Create Texture Set with File

```http
POST /texture-sets/with-file?kind=1
Content-Type: multipart/form-data
```

- `kind` query param (optional): `0` or `1`

### Update Texture Set Kind

```http
PUT /texture-sets/{id}/kind
Content-Type: application/json
```

```json
{
    "kind": 1
}
```

- `kind`: `0` = ModelSpecific, `1` = Universal
- Returns updated texture set response

### Update Tiling Scale (Universal sets only)

```http
PUT /texture-sets/{id}/tiling-scale
Content-Type: application/json
```

```json
{
    "tilingScaleX": 2.0,
    "tilingScaleY": 2.0
}
```

Returns `400` if the texture set is not Universal kind.

### Associate with Model Version

```http
POST /texture-sets/{packId}/model-versions/{modelVersionId}
```

---

## Thumbnails

### Get Model Thumbnail

```http
GET /models/{id}/thumbnail/file
```

### Regenerate Model Thumbnail

```http
POST /models/{id}/thumbnail/regenerate
```

### Upload Custom Model Thumbnail

```http
POST /models/{id}/thumbnail/upload
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: Image file (PNG, JPG, WebP)

### Get Texture Set Thumbnail (WebP)

```http
GET /texture-sets/{id}/thumbnail/file
```

### Get Texture Set Thumbnail (PNG)

```http
GET /texture-sets/{id}/thumbnail/png-file
```

### Regenerate Texture Set Thumbnail

```http
POST /texture-sets/{id}/thumbnail/regenerate
```

Auto-enqueues a sphere-preview render job for Universal texture sets.

### Upload Texture Set Thumbnail (WebP)

```http
POST /texture-sets/{id}/thumbnail/upload
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: WebP thumbnail file

### Upload Texture Set Thumbnail (PNG)

```http
POST /texture-sets/{id}/thumbnail/png-upload
Content-Type: multipart/form-data
```

**Form fields:**

- `file`: PNG poster image

### Finish Texture Set Thumbnail Job

```http
POST /thumbnail-jobs/texture-sets/{jobId}/finish
Content-Type: application/json
```

```json
{
    "success": true,
    "metadata": { "frames": 30, "format": "webp" },
    "errorMessage": null
}
```

---

## Common Patterns

### Error Response

```json
{
    "error": "ErrorCode",
    "message": "Human-readable message"
}
```

### Soft Delete Pattern

All delete endpoints perform soft deletes. Items move to recycle bin and can be restored.

### File URLs

File downloads use the pattern: `/files/{fileId}/download`

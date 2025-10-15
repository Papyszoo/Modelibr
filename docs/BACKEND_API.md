# Backend API Reference

.NET 9.0 Web API built with Clean Architecture and Domain-Driven Design (DDD) principles.

## Base URL

- **Development:** `http://localhost:5009`
- **Docker (HTTP):** `http://localhost:8080`
- **Docker (HTTPS):** `https://localhost:8081`

## Quick Reference

### Model Management (5 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/models` | Upload new 3D model |
| `POST` | `/models/{modelId}/files` | Add file to existing model |
| `GET` | `/models` | List all models |
| `GET` | `/models/{id}` | Get model details |
| `GET` | `/models/{id}/file` | Download model file |

### Files (1 endpoint)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/files/{id}` | Download any file by ID |

### Thumbnails (4 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models/{id}/thumbnail` | Get thumbnail status |
| `POST` | `/models/{id}/thumbnail/regenerate` | Queue thumbnail regeneration |
| `POST` | `/models/{id}/thumbnail/upload` | Upload custom thumbnail |
| `GET` | `/models/{id}/thumbnail/file` | Download thumbnail image |

### Texture Sets (9 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/texture-sets` | List all texture sets |
| `GET` | `/texture-sets/{id}` | Get texture set details |
| `POST` | `/texture-sets` | Create new texture set |
| `PUT` | `/texture-sets/{id}` | Update texture set |
| `DELETE` | `/texture-sets/{id}` | Delete texture set |
| `POST` | `/texture-sets/{id}/textures` | Add texture to pack |
| `DELETE` | `/texture-sets/{packId}/textures/{textureId}` | Remove texture from pack |
| `POST` | `/texture-sets/{packId}/models/{modelId}` | Associate pack with model |
| `DELETE` | `/texture-sets/{packId}/models/{modelId}` | Disassociate pack from model |

### Stages (6 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stages` | List all stages |
| `GET` | `/stages/{id}` | Get stage details |
| `POST` | `/stages` | Create new stage |
| `PUT` | `/stages/{id}` | Update stage configuration |
| `POST` | `/stages/{id}/generate-tsx` | Generate and save TSX file |
| `GET` | `/stages/{id}/tsx` | Download TSX file |

### Worker API - Thumbnail Jobs (3 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/thumbnail-jobs/dequeue` | Dequeue next job (workers only) |
| `POST` | `/api/thumbnail-jobs/{jobId}/complete` | Mark job complete (workers only) |
| `POST` | `/api/test/thumbnail-complete/{modelId}` | Test completion notification (dev) |

**Total:** 28 endpoints

## Common Usage Examples

### Upload a 3D Model
```bash
curl -X POST http://localhost:5009/models \
  -F "file=@model.obj"
```

Response:
```json
{
  "id": 1,
  "name": "model",
  "createdAt": "2024-01-15T10:30:00Z",
  "files": [
    {
      "id": 1,
      "originalFileName": "model.obj",
      "storedFileName": "abc123.obj",
      "sizeInBytes": 245760,
      "uploadedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### List All Models
```bash
curl http://localhost:5009/models
```

### Get Model Details
```bash
curl http://localhost:5009/models/1
```

### Download Model File
```bash
curl http://localhost:5009/models/1/file -o downloaded-model.obj
```

### Check Thumbnail Status
```bash
curl http://localhost:5009/models/1/thumbnail
```

Response:
```json
{
  "status": "Ready",
  "thumbnailId": 5,
  "generatedAt": "2024-01-15T10:31:00Z"
}
```

Status values: `NotGenerated`, `Pending`, `Processing`, `Ready`, `Failed`

### Download Thumbnail
```bash
curl http://localhost:5009/models/1/thumbnail/file -o thumbnail.webp
```

### Regenerate Thumbnail
```bash
curl -X POST http://localhost:5009/models/1/thumbnail/regenerate
```

### Create Texture Set
```bash
curl -X POST http://localhost:5009/texture-sets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Metal Materials",
    "description": "Metallic PBR textures"
  }'
```

### Add Texture to Pack
```bash
curl -X POST http://localhost:5009/texture-sets/1/textures \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": 10,
    "textureType": "Albedo"
  }'
```

Texture types: `Albedo`, `Normal`, `Metallic`, `Roughness`, `AmbientOcclusion`, `Emissive`, `Height`, `Opacity`

### Associate Texture Set with Model
```bash
curl -X POST http://localhost:5009/texture-sets/1/models/5
```

## Endpoint Details

See the Quick Reference section above for all available endpoints. Each endpoint follows RESTful conventions with consistent error handling and response formats.

## Architecture Overview

The backend follows Clean Architecture with strict layer separation:

```
WebApi → Application → Domain ← Infrastructure
              ↓              ↑
         SharedKernel ← ← ← ← ↑
```

### Layers

**Domain Layer** (`src/Domain/`)
- Core business entities: `Model`, `File`, `Thumbnail`, `TextureSet`
- Value objects: `FileType` with validation
- Business logic and invariants
- No external dependencies

**Application Layer** (`src/Application/`)
- CQRS: Commands and Queries
- Command/Query handlers
- Repository interfaces
- Application services

**Infrastructure Layer** (`src/Infrastructure/`)
- EF Core with PostgreSQL
- Repository implementations
- File storage (hash-based deduplication)
- External service integrations

**WebApi Layer** (`src/WebApi/`)
- Minimal API endpoints
- HTTP request/response handling
- Authentication/authorization (future)

**SharedKernel**
- Result pattern for error handling
- Error types
- Common primitives

### Key Design Patterns

**CQRS** - Separate commands (writes) from queries (reads)

**Repository Pattern** - Abstract data access

**Result Pattern** - Explicit error handling without exceptions

**Value Objects** - Domain concepts with built-in validation (e.g., `FileType.ValidateForModelUpload()`)

**Factory Methods** - Controlled entity creation (e.g., `Model.Create()`, `File.Create()`)

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Wavefront OBJ | `.obj` | Popular 3D geometry format |
| Autodesk FBX | `.fbx` | Industry standard |
| COLLADA | `.dae` | Open standard for 3D assets |
| 3D Studio Max | `.3ds` | Legacy format |
| Blender | `.blend` | Native Blender format |
| glTF/GLB | `.gltf`, `.glb` | Modern web-optimized format |

## Error Handling

The API uses the Result pattern for explicit error handling. Errors are returned as JSON:

```json
{
  "error": {
    "code": "FileType.InvalidForModelUpload",
    "message": "File type '.txt' is not valid for model upload"
  }
}
```

Common error codes:
- `FileType.InvalidForModelUpload` - Unsupported file format
- `Model.NotFound` - Model doesn't exist
- `File.NotFound` - File doesn't exist
- `TextureSet.NotFound` - Texture set doesn't exist
- `Thumbnail.NotReady` - Thumbnail not yet generated

## Configuration

### Environment Variables

```bash
# ASP.NET Core
ASPNETCORE_ENVIRONMENT=Development

# Upload Storage
UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads

# Database (via connection string)
POSTGRES_USER=modelibr
POSTGRES_PASSWORD=password
POSTGRES_PORT=5432
```

### Connection String

Configured in `appsettings.json`, overridable via environment variables:
```
ConnectionStrings__Default=Host=localhost;Port=%POSTGRES_PORT%;Database=Modelibr;Username=%POSTGRES_USER%;Password=%POSTGRES_PASSWORD%;
```

The backend automatically expands environment variables using `%VARIABLE_NAME%` syntax.

## Development Setup

### Prerequisites
- .NET 9.0 SDK
- PostgreSQL (or use Docker)

### Quick Start
```bash
# Restore packages
dotnet restore Modelibr.sln

# Build
dotnet build Modelibr.sln

# Run tests
dotnet test Modelibr.sln --no-build

# Start API
cd src/WebApi
export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
dotnet run
```

API available at: `http://localhost:5009`

### Docker
```bash
# Configure environment
cp .env.example .env

# Start full stack (API + DB + Frontend + Worker)
docker compose up -d

# API available at:
# - HTTP: http://localhost:8080
# - HTTPS: https://localhost:8081
```

### Database Migrations

```bash
# Add migration (from repository root)
dotnet ef migrations add MigrationName -p src/Infrastructure -s src/WebApi

# Apply migrations
dotnet ef database update -p src/Infrastructure -s src/WebApi
```

## Testing

### Unit Tests
```bash
dotnet test tests/Domain.Tests
dotnet test tests/Application.Tests
dotnet test tests/Infrastructure.Tests
```

### Integration Tests
```bash
dotnet test tests/WebApi.Tests
```

### Manual Testing
```bash
# Upload test model (create your own test .obj file)
curl -X POST -F "file=@test-model.obj" http://localhost:5009/models

# Verify upload
curl http://localhost:5009/models
```

## SignalR Integration

The backend includes SignalR hubs for real-time communication:

### Thumbnail Jobs Hub
- **Hub URL:** `/hubs/thumbnail-jobs`
- **Purpose:** Notify workers of new thumbnail jobs
- **Events:**
  - `JobEnqueued` - New job available for processing
  - `JobCompleted` - Job finished successfully
  - `JobFailed` - Job failed with error

Workers connect to this hub to receive real-time notifications instead of polling.

## Health Checks

```bash
curl http://localhost:5009/health
```

Response:
```json
{
  "status": "Healthy",
  "checks": {
    "database": "Healthy",
    "storage": "Healthy"
  }
}
```

## Performance Considerations

### File Storage
- **Hash-based deduplication** - Identical files stored once
- **Streaming downloads** - Large files streamed efficiently
- **Configurable storage path** - Use fast storage for uploads

### Database
- **Indexed queries** - Fast model/file lookups
- **Connection pooling** - Efficient database connections
- **EF Core compiled queries** - Optimized query performance

### Thumbnails
- **Async processing** - Thumbnails generated in background
- **Worker scalability** - Multiple workers process queue
- **SignalR notifications** - Instant job pickup

## Security Considerations

### Current State
- No authentication/authorization (development phase)
- File type validation on upload
- File size limits configured
- **Stage file storage:** Path traversal prevention, sanitized file names

### Future Enhancements
- JWT authentication
- Role-based authorization
- API key for workers
- Rate limiting
- CORS configuration for production

---

## Stage Management API

Stages allow users to create reusable 3D scene configurations with lights and effects, which can be exported as TypeScript React components.

### List All Stages

**Endpoint:** `GET /stages`

**Response:**
```json
{
  "stages": [
    {
      "id": 1,
      "name": "Sunset Studio",
      "tsxFilePath": "stages/SunsetStudio.tsx",
      "createdAt": "2024-10-15T10:00:00Z",
      "updatedAt": "2024-10-15T12:30:00Z"
    }
  ]
}
```

### Get Stage by ID

**Endpoint:** `GET /stages/{id}`

**Response:**
```json
{
  "id": 1,
  "name": "Sunset Studio",
  "configurationJson": "{\"lights\":[...]}",
  "tsxFilePath": "stages/SunsetStudio.tsx",
  "createdAt": "2024-10-15T10:00:00Z",
  "updatedAt": "2024-10-15T12:30:00Z"
}
```

### Create Stage

**Endpoint:** `POST /stages`

**Request Body:**
```json
{
  "name": "My Custom Stage",
  "configurationJson": "{\"lights\":[{\"id\":\"1\",\"type\":\"ambient\",\"color\":\"#ffffff\",\"intensity\":0.5}]}"
}
```

**Response:**
```json
{
  "id": 2,
  "name": "My Custom Stage"
}
```

### Update Stage

**Endpoint:** `PUT /stages/{id}`

**Request Body:**
```json
{
  "configurationJson": "{\"lights\":[...]}"
}
```

**Response:**
```json
{
  "id": 2,
  "name": "My Custom Stage"
}
```

### Generate TSX File

**Endpoint:** `POST /stages/{id}/generate-tsx`

Generates a TypeScript React component file from the stage configuration and saves it to the file system.

**Response:**
```json
{
  "filePath": "stages/MyCustomStage.tsx",
  "tsxCode": "import { JSX, ReactNode } from 'react';\n..."
}
```

**Generated TSX Structure:**
- Valid TypeScript React component
- Imports for React Three Fiber and Drei
- Configured lights from stage
- Children prop for 3D models
- Orbit controls

### Download TSX File

**Endpoint:** `GET /stages/{id}/tsx`

Downloads the generated TSX file.

**Response:** File download with content-type `text/plain`

**Example Usage:**
```bash
curl -X POST http://localhost:5009/stages/1/generate-tsx
curl -O http://localhost:5009/stages/1/tsx
```

### Stage Configuration Schema

The `configurationJson` field contains a JSON object with the following structure:

```json
{
  "lights": [
    {
      "id": "unique-id",
      "type": "ambient|directional|point|spot",
      "color": "#ffffff",
      "intensity": 1.0,
      "position": [x, y, z],  // Optional, not for ambient
      "angle": 0.523,         // Optional, spot light only
      "penumbra": 0.1,        // Optional, spot light only
      "distance": 10,         // Optional, point/spot only
      "decay": 2              // Optional, point/spot only
    }
  ]
}
```

**Supported Light Types:**
- **ambient**: Global illumination
- **directional**: Sun-like directional light with shadows
- **point**: Omnidirectional point light
- **spot**: Cone-shaped spotlight with shadows

### Stage File Storage

- **Directory:** `{UPLOAD_STORAGE_PATH}/stages/`
- **File naming:** Stage name sanitized + `.tsx` extension
- **Security:** Path validation prevents directory traversal
- **Component names:** Automatically sanitized for TypeScript validity

## Related Documentation

- **Stage TSX Generation:** `docs/STAGE_TSX_GENERATION.md` for detailed usage guide
- **Clean Architecture Guide:** See `.github/copilot-instructions.md` for detailed DDD/Clean Architecture patterns
- **Project README:** `README.md` for full application setup
- **Worker Service:** `docs/WORKER.md` for thumbnail worker documentation

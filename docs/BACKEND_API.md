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

### Texture Packs (9 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/texture-packs` | List all texture packs |
| `GET` | `/texture-packs/{id}` | Get texture pack details |
| `POST` | `/texture-packs` | Create new texture pack |
| `PUT` | `/texture-packs/{id}` | Update texture pack |
| `DELETE` | `/texture-packs/{id}` | Delete texture pack |
| `POST` | `/texture-packs/{id}/textures` | Add texture to pack |
| `DELETE` | `/texture-packs/{packId}/textures/{textureId}` | Remove texture from pack |
| `POST` | `/texture-packs/{packId}/models/{modelId}` | Associate pack with model |
| `DELETE` | `/texture-packs/{packId}/models/{modelId}` | Disassociate pack from model |

### Worker API - Thumbnail Jobs (3 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/thumbnail-jobs/dequeue` | Dequeue next job (workers only) |
| `POST` | `/api/thumbnail-jobs/{jobId}/complete` | Mark job complete (workers only) |
| `POST` | `/api/test/thumbnail-complete/{modelId}` | Test completion notification (dev) |

**Total:** 22 endpoints

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

### Create Texture Pack
```bash
curl -X POST http://localhost:5009/texture-packs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Metal Materials",
    "description": "Metallic PBR textures"
  }'
```

### Add Texture to Pack
```bash
curl -X POST http://localhost:5009/texture-packs/1/textures \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": 10,
    "textureType": "Albedo"
  }'
```

Texture types: `Albedo`, `Normal`, `Metallic`, `Roughness`, `AmbientOcclusion`, `Emissive`, `Height`, `Opacity`

### Associate Texture Pack with Model
```bash
curl -X POST http://localhost:5009/texture-packs/1/models/5
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
- Core business entities: `Model`, `File`, `Thumbnail`, `TexturePack`
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
- `TexturePack.NotFound` - Texture pack doesn't exist
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

### Future Enhancements
- JWT authentication
- Role-based authorization
- API key for workers
- Rate limiting
- CORS configuration for production

## Related Documentation

- **Clean Architecture Guide:** See `.github/copilot-instructions.md` for detailed DDD/Clean Architecture patterns
- **Project README:** `README.md` for full application setup
- **Worker Service:** `docs/WORKER.md` for thumbnail worker documentation

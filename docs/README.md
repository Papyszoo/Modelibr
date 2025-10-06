# Modelibr Documentation

Comprehensive documentation for the 3D model file upload service.

## Quick Start Guides

- **[Backend API](BACKEND_API.md)** - .NET Web API reference and usage examples
- **[Frontend](FRONTEND.md)** - React application development guide  
- **[Thumbnail Worker](WORKER.md)** - Node.js thumbnail generation service

## Detailed Documentation

### Backend Endpoints
Detailed endpoint documentation in `backend/endpoints/`:
- [models.md](backend/endpoints/models.md) - Model upload and management
- [files.md](backend/endpoints/files.md) - File download
- [thumbnails.md](backend/endpoints/thumbnails.md) - Thumbnail operations
- [texture-packs.md](backend/endpoints/texture-packs.md) - Texture pack CRUD
- [thumbnail-jobs.md](backend/endpoints/thumbnail-jobs.md) - Worker job API
- [models-query.md](backend/endpoints/models-query.md) - Advanced queries

### Frontend Components
Component, hook, and service documentation in `frontend/`:
- **Components:** `frontend/components/` - DockPanel, ModelList, Scene, etc.
- **Hooks:** `frontend/hooks/` - useFileUpload, useTabContext, etc.
- **Services:** `frontend/services/` - ApiClient
- **Contexts:** `frontend/contexts/` - TabContext
- **Utils:** `frontend/utils/` - fileUtils, tabSerialization, etc.
- **Guides:** 
  - [GETTING_STARTED.md](frontend/GETTING_STARTED.md) - Setup and examples
  - [ARCHITECTURE.md](frontend/ARCHITECTURE.md) - Design patterns

## Additional Resources

- **[worker-api-integration.md](worker-api-integration.md)** - Worker-specific API details
- **[signalr-test.html](signalr-test.html)** - SignalR connection testing tool
- **[sample-cube.obj](sample-cube.obj)** - Test 3D model file

## Getting Help

1. **Backend issues:** Check [BACKEND_API.md](BACKEND_API.md)
2. **Frontend issues:** Check [FRONTEND.md](FRONTEND.md#debugging)
3. **Worker issues:** Check [WORKER.md](WORKER.md#troubleshooting)
4. **Docker issues:** Check main [README.md](../README.md#troubleshooting)

---

For complete project setup and architecture details, see [README.md](../README.md) and [.github/copilot-instructions.md](../.github/copilot-instructions.md).

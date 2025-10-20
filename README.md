# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-blue)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-Latest-orange)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A modern 3D model file upload service built with .NET 9.0 and React, featuring hash-based storage deduplication and an interactive 3D model viewer.

## 🌟 Features

### Core Features
- **Unified Upload & Library Interface**: Drag-and-drop 3D model uploads integrated directly into the library view
- **Multi-Panel Tabbed Workspace**: Modern split-pane interface with configurable tabs for models, textures, and animations  
- **3D Model Support**: Support for popular 3D file formats (OBJ, FBX, DAE, 3DS, Blender, glTF/GLB)
- **Hash-based Deduplication**: Intelligent storage system that prevents duplicate files
- **Interactive 3D Viewer**: Real-time 3D model rendering with Three.js TSL (Three.js Shading Language)
- **Real-time Thumbnail Processing**: SignalR-based queue system with Node.js worker service for automatic thumbnail generation
- **Animated Thumbnails**: Orbit animations encoded as WebP with configurable quality and framerate

### Organization & Management
- **Projects**: Organize models and texture sets into logical projects/folders for better asset management
- **Packs**: Group related models and texture sets together into distributable packs
- **Batch Upload History**: Track and review all upload operations with detailed history
- **Model Tagging**: Tag models with custom metadata for improved searchability and organization
- **Settings Management**: Configurable application settings with persistent storage

### Texture & Material System
- **Texture Sets**: Create and manage PBR texture collections (Albedo, Normal, Metallic, Roughness, AO, Emissive, Height, Opacity)
- **Real-time PBR Preview**: Physically based rendering with metalness and roughness controls
- **Texture Preview Panel**: Interactive preview with geometry selector (sphere, cube, plane, cylinder, torus)
- **Model-Texture Association**: Link texture sets to specific models with default texture set support
- **Advanced Material Editor**: Control material properties with real-time preview updates

### 3D Scene Features
- **Stage Editor**: Save and load complete 3D scene configurations including camera position, lighting, and render settings
- **Classification Views**: Specialized thumbnail views optimized for different model categories
- **Interactive Controls**: Full orbit controls, zoom, and pan for detailed model inspection

### Architecture & Development
- **Clean Architecture**: Well-structured backend following SOLID principles and DDD patterns
- **CQRS Pattern**: Separate command and query responsibilities for better scalability
- **Modern React Frontend**: Responsive UI with PrimeReact components and advanced state management
- **Containerized Deployment**: Full Docker support with multi-service orchestration
- **Component Documentation**: Storybook integration for interactive component development and documentation

## 📸 Screenshots

> **📝 Note**: Screenshots are being updated. The previous screenshots showed error states from running the frontend without a backend. New screenshots showing the working application with uploaded models will be added soon.
> 
> To generate new screenshots:
> 1. Run `docker compose up -d` 
> 2. Access http://localhost:3000
> 3. Upload a 3D model file (OBJ, FBX, GLTF, etc.)
> 4. Take screenshots showing the working interface

<!-- TODO: Add screenshots of:
- Modern Split-Pane Interface: Modern tabbed workspace with integrated 3D model library, drag-and-drop upload, and multi-panel layout
- Integrated Upload & Library: Unified interface combining model upload via drag-and-drop with library management and tabbed workspace  
- 3D Model Viewer: Interactive 3D viewer showing a loaded model with PBR materials
-->

## 🏗️ Architecture

Modelibr follows Clean Architecture principles with clear separation of concerns:

```
├── src/
│   ├── Domain/           # Core business entities and rules
│   │   └── Models/       # Model, File, Thumbnail, TextureSet, Project, Pack, Stage
│   ├── Application/      # Use cases and application services  
│   │   └── Features/     # CQRS commands and queries by feature
│   ├── Infrastructure/   # Data access and external services
│   │   ├── Persistence/  # EF Core DbContext and configurations
│   │   ├── Repositories/ # Repository implementations
│   │   └── Storage/      # Hash-based file storage
│   ├── SharedKernel/     # Shared domain primitives (Result pattern, Error types)
│   ├── WebApi/          # REST API endpoints and presentation
│   │   └── Endpoints/    # Minimal API endpoint definitions
│   ├── frontend/        # React frontend application
│   │   └── features/     # Feature-based component organization
│   └── worker-service/  # Node.js thumbnail generation service
├── tests/
│   ├── Domain.Tests/         # Domain layer unit tests
│   ├── Application.Tests/    # Application layer unit tests
│   ├── Infrastructure.Tests/ # Infrastructure integration tests
│   └── WebApi.Tests/         # API integration tests
└── docker-compose.yml   # Multi-container orchestration
```

### Technology Stack

**Backend:**
- .NET 9.0 Web API
- Entity Framework Core
- PostgreSQL
- Clean Architecture pattern
- Minimal APIs with endpoint mapping

**Frontend:**
- React 18+ with TypeScript
- Modern split-pane tabbed interface  
- Three.js with TSL for 3D rendering
- React Three Fiber with Stage component for automatic scene setup
- React Three Drei for advanced 3D helpers
- PrimeReact UI component library
- PrimeFlex CSS utilities
- Vite for development and build
- Drag-and-drop file upload integration
- Advanced state management with URL persistence (nuqs)
- Zustand for global state management
- SignalR for real-time updates
- Leva for interactive controls
- Storybook for component documentation and development

**Infrastructure:**
- Docker & Docker Compose
- PostgreSQL 16
- nginx for production frontend serving
- SignalR for real-time worker coordination

**Thumbnail Processing:**
- Node.js worker service with Three.js rendering
- Real-time queue system with SignalR notifications
- Multiple worker support with load balancing
- Orbit animation generation with configurable angles
- WebP encoding with animated thumbnails and poster images
- Puppeteer-based browser rendering for 3D model processing

## 🚀 Getting Started

### Prerequisites

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js 18+](https://nodejs.org/)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/) (for containerized setup)

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/Papyszoo/Modelibr.git
   cd Modelibr
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env file with your settings
   ```

3. **Start the application**
   ```bash
   docker compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000 (integrated upload/library interface)
   - API: http://localhost:8080
   - Thumbnail Worker: http://localhost:3001 (health check)
   - PostgreSQL: localhost:5432

### Development Setup

#### Recommended: Docker Compose (Full Stack)

1. **Clone and configure**
   ```bash
   git clone https://github.com/Papyszoo/Modelibr.git
   cd Modelibr
   cp .env.example .env
   ```

2. **Start all services**
   ```bash
   docker compose up -d
   ```

This will start the complete application stack:
- Frontend: http://localhost:3000 (integrated upload/library interface)
- API: http://localhost:8080
- Thumbnail Worker: http://localhost:3001 (health check)
- PostgreSQL: localhost:5432

#### Alternative: Local Development

##### Backend (.NET API)

1. **Install .NET 9.0 SDK**
   - Download from [official .NET site](https://dotnet.microsoft.com/download/dotnet/9.0)
   - Or use the installation script (see copilot instructions for details)

2. **Build and test**
   ```bash
   dotnet restore Modelibr.sln
   dotnet build Modelibr.sln
   dotnet test Modelibr.sln --no-build
   ```

3. **Start the API**
   ```bash
   cd src/WebApi
   export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
   dotnet run
   ```

The API will be available at http://localhost:5009

##### Frontend (React)

1. **Install dependencies**
   ```bash
   cd src/frontend
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

The frontend will be available at http://localhost:3000

3. **View component documentation (Storybook)**
   ```bash
   npm run storybook
   ```

Storybook will be available at http://localhost:6006 with interactive component examples.

##### Thumbnail Worker (Node.js)

1. **Install dependencies**
   ```bash
   cd src/worker-service
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env file with API connection settings
   ```

3. **Start the worker**
   ```bash
   npm start
   ```

The worker service will be available at http://localhost:3001 (health check)

## 💡 Frontend Features

### Component Organization

The frontend is organized by features:

- **models/** - Model library, grid view, and upload functionality
- **texture-set/** - Texture set management and PBR preview
- **model-viewer/** - Interactive 3D model viewer with orbit controls
- **stage-editor/** - Save and load scene configurations
- **project/** - Project management components
- **pack/** - Pack management components  
- **thumbnail/** - Thumbnail display with status states
- **history/** - Upload history tracking

### Key Components

**ModelGrid** - Responsive grid of models with thumbnails and metadata

**TextureSetViewer** - Interactive PBR material preview with geometry selection

**Scene** - Three.js 3D viewer with automatic lighting and camera positioning

**StageEditor** - UI for configuring and saving 3D scene states

**UploadableGrid** - Drag-and-drop upload integration for models and textures

### State Management

- **URL State** - Tab configuration and navigation persisted in URL parameters
- **Zustand Stores** - Global state for settings, projects, and packs
- **React Context** - Tab management and shared component state
- **Local State** - Component-specific state with React hooks

## 📁 Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Wavefront OBJ | `.obj` | Popular 3D geometry format |
| Autodesk FBX | `.fbx` | Industry standard for 3D assets |
| COLLADA | `.dae` | Open standard for 3D asset exchange |
| 3D Studio Max | `.3ds` | Legacy 3D Studio format |
| Blender | `.blend` | Native Blender format |
| glTF/GLB | `.gltf`, `.glb` | Modern web-optimized 3D format |

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| **Web API** | | |
| `ASPNETCORE_ENVIRONMENT` | ASP.NET Core environment | `Development` |
| `WEBAPI_HTTP_PORT` | API HTTP port | `8080` |
| `WEBAPI_HTTPS_PORT` | API HTTPS port (local dev only) | `8081` |
| `UPLOAD_STORAGE_PATH` | Directory for uploaded files | `/var/lib/modelibr/uploads` |
| **Frontend** | | |
| `FRONTEND_PORT` | Frontend port mapping | `3000` |
| `VITE_API_BASE_URL` | Frontend API base URL | `http://localhost:8080` |
| **Database** | | |
| `POSTGRES_USER` | PostgreSQL username | `modelibr` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `ChangeThisStrongPassword123!` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| **Thumbnail Worker** | | |
| `WORKER_PORT` | Thumbnail worker port | `3001` |
| `WORKER_ID` | Worker instance identifier | `worker-1` |
| `MAX_CONCURRENT_JOBS` | Worker concurrent jobs | `3` |
| `RENDER_WIDTH` | Thumbnail width | `256` |
| `RENDER_HEIGHT` | Thumbnail height | `256` |
| `RENDER_FORMAT` | Thumbnail image format | `png` |
| `LOG_LEVEL` | Worker logging level | `info` |
| `ENABLE_ORBIT_ANIMATION` | Generate orbit animations | `true` |
| `ORBIT_ANGLE_STEP` | Degrees per frame (360/step = frames) | `12` |
| `CAMERA_HEIGHT_MULTIPLIER` | Camera height relative to distance | `0.75` |
| `ENABLE_FRAME_ENCODING` | Encode to animated WebP | `true` |
| `ENCODING_FRAMERATE` | Animation framerate (fps) | `10` |
| `WEBP_QUALITY` | WebP quality (0-100) | `75` |
| `JPEG_QUALITY` | JPEG quality for poster (0-100) | `85` |
| **Thumbnail Storage** | | |
| `THUMBNAIL_STORAGE_ENABLED` | Enable thumbnail storage | `true` |
| `THUMBNAIL_STORAGE_PATH` | Thumbnail storage directory | `/var/lib/modelibr/thumbnails` |
| `SKIP_DUPLICATE_THUMBNAILS` | Skip existing thumbnails | `true` |

### Database Configuration

The application uses PostgreSQL with Entity Framework Core. Connection strings are configured in `appsettings.json` and can be overridden via environment variables or user secrets.

## 🎮 API Endpoints

### Model Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models` | Get all uploaded models (supports filtering by packId or projectId) |
| `GET` | `/models/{id}` | Get model details by ID |
| `POST` | `/models` | Upload a new 3D model |
| `POST` | `/models/{modelId}/files` | Add file to existing model |
| `POST` | `/models/{modelId}/tags` | Update model tags |
| `GET` | `/models/{id}/file` | Download/stream model file |
| `PUT` | `/models/{id}/defaultTextureSet` | Set default texture set for model |

### File Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/files` | Upload a standalone file |
| `GET` | `/files/{id}` | Download/stream file by ID |

### Thumbnail Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models/{id}/thumbnail` | Get thumbnail status |
| `POST` | `/models/{id}/thumbnail/regenerate` | Queue thumbnail regeneration |
| `POST` | `/models/{id}/thumbnail/upload` | Upload custom thumbnail |
| `GET` | `/models/{id}/thumbnail/file` | Download thumbnail image |
| `GET` | `/models/{id}/classification-views/{viewName}` | Get classification-specific thumbnail view |

### Texture Set Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/texture-sets` | List all texture sets |
| `GET` | `/texture-sets/{id}` | Get texture set details |
| `GET` | `/texture-sets/by-file/{fileId}` | Get texture set containing specific file |
| `POST` | `/texture-sets` | Create new texture set |
| `POST` | `/texture-sets/with-file` | Create texture set with initial file |
| `PUT` | `/texture-sets/{id}` | Update texture set |
| `DELETE` | `/texture-sets/{id}` | Delete texture set |

### Project Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List all projects |
| `GET` | `/projects/{id}` | Get project details |
| `POST` | `/projects` | Create new project |
| `PUT` | `/projects/{id}` | Update project |
| `DELETE` | `/projects/{id}` | Delete project |
| `POST` | `/projects/{projectId}/models/{modelId}` | Add model to project |
| `DELETE` | `/projects/{projectId}/models/{modelId}` | Remove model from project |
| `POST` | `/projects/{projectId}/texture-sets/{textureSetId}` | Add texture set to project |
| `DELETE` | `/projects/{projectId}/texture-sets/{textureSetId}` | Remove texture set from project |

### Pack Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/packs` | List all packs |
| `GET` | `/packs/{id}` | Get pack details |
| `POST` | `/packs` | Create new pack |
| `PUT` | `/packs/{id}` | Update pack |
| `DELETE` | `/packs/{id}` | Delete pack |
| `POST` | `/packs/{packId}/models/{modelId}` | Add model to pack |
| `DELETE` | `/packs/{packId}/models/{modelId}` | Remove model from pack |
| `POST` | `/packs/{packId}/texture-sets/{textureSetId}` | Add texture set to pack |
| `DELETE` | `/packs/{packId}/texture-sets/{textureSetId}` | Remove texture set from pack |

### Stage Management (Scene Configuration)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stages` | List all saved stages |
| `GET` | `/stages/{id}` | Get stage details |
| `POST` | `/stages` | Create new stage |
| `PUT` | `/stages/{id}` | Update stage configuration |

### Settings & History
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settings` | Get application settings |
| `GET` | `/settings/all` | Get all settings |
| `PUT` | `/settings/{key}` | Update specific setting |
| `PUT` | `/settings` | Batch update settings |
| `GET` | `/batch-uploads/history` | Get upload history |

### Worker API (Internal)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/thumbnail-jobs/dequeue` | Dequeue next job (workers only) |
| `POST` | `/api/thumbnail-jobs/{jobId}/complete` | Mark job complete (workers only) |
| `POST` | `/api/thumbnail-jobs/{jobId}/fail` | Mark job failed (workers only) |
| `POST` | `/api/thumbnail-jobs/{jobId}/events` | Send job events (workers only) |

### Example Usage

```bash
# Upload a 3D model
curl -X POST -F "file=@model.obj" http://localhost:8080/models

# Get all models
curl http://localhost:8080/models

# Get models in a specific project
curl http://localhost:8080/models?projectId=1

# Download a file
curl http://localhost:8080/files/1 -o downloaded-model.obj

# Create a project
curl -X POST http://localhost:8080/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "description": "Project description"}'

# Add model to project
curl -X POST http://localhost:8080/projects/1/models/5

# Create a texture set
curl -X POST http://localhost:8080/texture-sets \
  -H "Content-Type: application/json" \
  -d '{"name": "Wood Materials", "description": "Wooden textures"}'

# Get thumbnail status
curl http://localhost:8080/models/1/thumbnail

# Download thumbnail
curl http://localhost:8080/models/1/thumbnail/file -o thumbnail.webp

# Save stage configuration
curl -X POST http://localhost:8080/stages \
  -H "Content-Type: application/json" \
  -d '{"name": "Studio Setup", "configurationJson": "{\"camera\":{...}}"}'
```

## 📚 Component Documentation (Storybook)

The frontend includes Storybook for interactive component documentation and development. Storybook provides:

- **Interactive component examples**: View and interact with UI components in isolation
- **Props documentation**: See available props and their types with live editing
- **Multiple component states**: Explore different states and variations of components
- **Development playground**: Test components without running the full application

### Available Stories

- **Components/LoadingPlaceholder**: 3D loading indicator component
- **Components/ModelInfo**: Model information display with TSL rendering features
- **Components/ThumbnailDisplay**: Thumbnail display states (ready, processing, failed, placeholder)
- **Components/Model List/EmptyState**: Empty state for model library
- **Components/Model List/ErrorState**: Error handling component for testing different error scenarios

### Screenshots

**ModelInfo Component Documentation**
![Storybook ModelInfo](https://github.com/user-attachments/assets/c191f88b-9b39-45c0-bfa9-8f8d34efe1ed)
*Interactive documentation showing ModelInfo component with controls for different model types (OBJ, FBX, GLTF)*

### Running Storybook

```bash
cd src/frontend
npm run storybook
```

Access Storybook at http://localhost:6006

### Building Storybook

To build a static version of Storybook for deployment:

```bash
cd src/frontend
npm run build-storybook
```

The static files will be generated in `src/frontend/storybook-static/`

## 🏃‍♂️ Development Workflow

1. **Make changes** to the codebase
2. **Build**: `dotnet build Modelibr.sln`
3. **Test**: `dotnet test Modelibr.sln --no-build`
4. **Run**: Start both API and frontend for testing
5. **Validate**: Ensure upload functionality works correctly

## 🐳 Docker Development

For development with hot reloading:

```bash
# Frontend development mode
docker compose -f docker-compose.dev.yml up frontend

# Full development stack
docker compose -f docker-compose.dev.yml up
```

## 🔧 Troubleshooting

### Docker Health Check Issues
If you encounter "container webapi is unhealthy" errors:

1. **Verify health endpoint**: Test manually with `curl http://localhost:8080/health`
2. **Check logs**: Use `docker compose logs webapi` to see startup issues

### Common Issues
- **Database connection errors**: Ensure PostgreSQL container is running and healthy
- **Port conflicts**: Make sure ports 3000, 8080, 5432, and 3001 are available (port 8081 only needed for local HTTPS development)
- **Upload permission errors**: Set `UPLOAD_STORAGE_PATH` to a writable directory
- **Thumbnail worker "no such file" error**: If you see `exec /app/docker-entrypoint.sh: no such file or directory`, this was caused by Windows line endings. **The issue is now fixed** - simply rebuild the container with `docker compose build thumbnail-worker`. The Dockerfile automatically converts line endings. See [docs/WORKER.md](docs/WORKER.md#troubleshooting) for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for powerful 3D rendering capabilities
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) for React integration
- [ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/) for the robust backend framework
- [Entity Framework Core](https://docs.microsoft.com/en-us/ef/core/) for data access
- [Storybook](https://storybook.js.org/) for component documentation and development

---

Made with ❤️ for the 3D development community
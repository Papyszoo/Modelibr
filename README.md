# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-blue)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-Latest-orange)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A modern 3D model file upload service built with .NET 9.0 and React, featuring hash-based storage deduplication and an interactive 3D model viewer.

## 🌟 Features

- **Unified Upload & Library Interface**: Drag-and-drop 3D model uploads integrated directly into the library view
- **Multi-Panel Tabbed Workspace**: Modern split-pane interface with configurable tabs for models, textures, and animations  
- **3D Model Support**: Support for popular 3D file formats (OBJ, FBX, DAE, 3DS, Blender, glTF/GLB)
- **Hash-based Deduplication**: Intelligent storage system that prevents duplicate files
- **Interactive 3D Viewer**: Real-time 3D model rendering with Three.js TSL (Three.js Shading Language)
- **Customizable Environments**: Create and manage custom 3D scene environments with configurable lighting, shadows, and HDR maps
- **Real-time Thumbnail Processing**: SignalR-based queue system with Node.js worker service
- **Clean Architecture**: Well-structured backend following SOLID principles and DDD patterns
- **Modern React Frontend**: Responsive UI with PrimeReact components and advanced state management
- **Containerized Deployment**: Full Docker support with multi-service orchestration
- **Real-time PBR Materials**: Physically based rendering with metalness and roughness controls

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
│   ├── Application/      # Use cases and application services
│   ├── Infrastructure/   # Data access and external services
│   ├── SharedKernel/     # Shared domain primitives
│   ├── WebApi/          # REST API endpoints and presentation
│   └── frontend/        # React frontend application
├── tests/
│   └── Infrastructure.Tests/  # Unit tests
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
- PrimeReact UI component library
- Vite for development and build
- Drag-and-drop file upload integration
- Advanced state management with URL persistence
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
| **Thumbnail Storage** | | |
| `THUMBNAIL_STORAGE_ENABLED` | Enable thumbnail storage | `true` |
| `THUMBNAIL_STORAGE_PATH` | Thumbnail storage directory | `/var/lib/modelibr/thumbnails` |
| `SKIP_DUPLICATE_THUMBNAILS` | Skip existing thumbnails | `true` |

### Database Configuration

The application uses PostgreSQL with Entity Framework Core. Connection strings are configured in `appsettings.json` and can be overridden via environment variables or user secrets.

## 🎮 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models` | Get all uploaded models |
| `POST` | `/models` | Upload a new 3D model |
| `POST` | `/models/{id}/files` | Add file to existing model |
| `GET` | `/files/{id}` | Download/stream model file |

### Example Usage

```bash
# Upload a 3D model
curl -X POST -F "file=@model.obj" http://localhost:8080/models

# Get all models
curl http://localhost:8080/models

# Download a file
curl http://localhost:8080/files/1 -o downloaded-model.obj
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

## 📖 Documentation

Detailed documentation is available in the `docs/` directory:

- **[Backend API Reference](docs/BACKEND_API.md)**: Complete API documentation, endpoints, and examples
- **[Frontend Development Guide](docs/FRONTEND.md)**: Frontend architecture, patterns, and best practices
- **[Thumbnail Worker Documentation](docs/WORKER.md)**: Worker service setup and troubleshooting
- **[Environments Feature](docs/ENVIRONMENTS.md)**: Complete guide to the environments feature for customizable 3D scene configurations

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
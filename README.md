# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-blue)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-Latest-orange)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A modern 3D model file upload service built with .NET 9.0 and React, featuring hash-based storage deduplication and an interactive 3D model viewer.

## 🌟 Features

- **3D Model Upload & Storage**: Support for popular 3D file formats (OBJ, FBX, DAE, 3DS, Blender, glTF/GLB)
- **Hash-based Deduplication**: Intelligent storage system that prevents duplicate files
- **Interactive 3D Viewer**: Real-time 3D model rendering with Three.js TSL (Three.js Shading Language)
- **Clean Architecture**: Well-structured backend following SOLID principles
- **Responsive Frontend**: Modern React interface with drag-and-drop file uploads
- **Containerized Deployment**: Full Docker support with multi-service orchestration
- **Real-time PBR Materials**: Physically based rendering with metalness and roughness controls

## 📸 Screenshots

### Upload Interface
![Upload Interface](https://github.com/user-attachments/assets/932ae4e9-ec47-4fa8-83af-a0a3ae7767d2)
*Clean, intuitive interface for uploading 3D model files with real-time feedback*

### Model Library
![Model Library](https://github.com/user-attachments/assets/f8711488-d1e2-4326-837a-b57eeb9745c6)
*Browse and manage your uploaded 3D models with easy navigation*

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
- SQL Server
- Clean Architecture pattern
- Minimal APIs with endpoint mapping

**Frontend:**
- React 18+
- Three.js with TSL for 3D rendering
- Vite for development and build
- Modern CSS with responsive design

**Infrastructure:**
- Docker & Docker Compose
- SQL Server 2022
- nginx for production frontend serving

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
   - Frontend: http://localhost:3000
   - API: http://localhost:8080
   - SQL Server: localhost:1433

### Development Setup

#### Backend (.NET API)

1. **Install .NET 9.0 SDK**
   ```bash
   curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0
   export PATH="$HOME/.dotnet:$PATH"
   ```

2. **Restore and build**
   ```bash
   dotnet restore Modelibr.sln
   dotnet build Modelibr.sln
   ```

3. **Run tests**
   ```bash
   dotnet test Modelibr.sln --no-build
   ```

4. **Start the API**
   ```bash
   cd src/WebApi
   export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
   dotnet run
   ```

The API will be available at http://localhost:5009

#### Frontend (React)

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
| `UPLOAD_STORAGE_PATH` | Directory for uploaded files | `/var/lib/modelibr/uploads` |
| `ASPNETCORE_ENVIRONMENT` | ASP.NET Core environment | `Development` |
| `FRONTEND_PORT` | Frontend port mapping | `3000` |
| `WEBAPI_HTTP_PORT` | API HTTP port | `8080` |
| `WEBAPI_HTTPS_PORT` | API HTTPS port | `8081` |

### Database Configuration

The application uses SQL Server with Entity Framework Core. Connection strings are configured in `appsettings.json` and can be overridden via environment variables or user secrets.

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

---

Made with ❤️ for the 3D development community
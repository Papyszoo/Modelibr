# Worker Service Documentation

The Modelibr Thumbnail Worker Service is a Node.js microservice responsible for generating thumbnails and animated previews of 3D models. It operates independently from the main .NET Web API and communicates via HTTP REST API and SignalR real-time messaging.

## Overview

The worker service:
- Receives thumbnail generation jobs from the Web API via SignalR real-time notifications
- Downloads 3D model files from the API
- Loads and normalizes models using Three.js
- Generates orbit animation frames (360° rotation)
- Encodes frames into animated WebP and poster images
- Uploads generated thumbnails back to the API for storage
- Reports job completion/failure status

## Key Features

- **Real-time Job Processing**: SignalR-based job notifications for instant processing
- **3D Model Support**: Handles OBJ, FBX, GLTF, GLB, and other formats via Three.js loaders
- **Orbit Animation**: Generates smooth 360° rotation frames at configurable angles
- **WebP Encoding**: Creates animated WebP files with configurable quality and framerate
- **API-based Storage**: Uploads thumbnails to backend API, avoiding filesystem permission issues
- **Hash Deduplication**: Backend handles duplicate detection via file hashing
- **Concurrent Processing**: Configurable concurrent job execution (default: 3 jobs)
- **Health Monitoring**: Built-in health check endpoints for container orchestration
- **Graceful Shutdown**: Proper cleanup of active jobs and resources

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web API (.NET)                           │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │  ThumbnailQueue  │────────▶│  ThumbnailJobHub (SignalR)  │  │
│  └──────────────────┘         └─────────────────────────────┘  │
│           │                              │                      │
│           │ Enqueue Job                  │ Real-time Notify    │
│           ▼                              ▼                      │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │ ThumbnailJobRepo │         │  HTTP REST Endpoints        │  │
│  └──────────────────┘         └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 ▲              │
                    SignalR      │              │ HTTP API
                    Connection   │              │ (REST)
                                 │              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Worker Service (Node.js)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              SignalRQueueService (Real-time)              │  │
│  │  • Connects to ThumbnailJobHub                            │  │
│  │  • Receives JobEnqueued notifications                     │  │
│  │  • Acknowledges job processing to other workers           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    JobProcessor                           │  │
│  │  • Manages concurrent job execution                       │  │
│  │  • Coordinates service components                         │  │
│  │  • Handles errors and retries                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│       │           │            │             │           │      │
│       ▼           ▼            ▼             ▼           ▼      │
│  ┌────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐  ┌────────┐  │
│  │ Model  │  │  Model  │  │  Orbit  │  │ Frame  │  │Thumbnail│ │
│  │  File  │  │ Loader  │  │ Frame   │  │Encoder │  │Storage │ │
│  │Service │  │ Service │  │Renderer │  │Service │  │Service │ │
│  └────────┘  └─────────┘  └─────────┘  └────────┘  └────────┘  │
│       │           │            │             │           │      │
│       └───────────┴────────────┴─────────────┴───────────┘      │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         ThumbnailJobService (HTTP API Client)             │  │
│  │  • Polls for jobs (fallback mode)                         │  │
│  │  • Fetches model files                                    │  │
│  │  • Updates job status (complete/failed)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          ThumbnailApiService (HTTP API Client)            │  │
│  │  • Uploads thumbnails to API                              │  │
│  │  • Tests API connectivity                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               HealthServer (Express)                      │  │
│  │  • /health - Basic health check                           │  │
│  │  • /status - Detailed status and metrics                  │  │
│  │  • /ready  - Kubernetes readiness probe                   │  │
│  │  • /metrics - Prometheus-style metrics                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Processing Pipeline

The thumbnail generation pipeline follows these steps:

### 1. Job Notification (SignalR)
- Worker receives real-time notification via SignalR when job is enqueued
- Multiple workers can receive the same notification
- First worker to claim the job (via HTTP API) processes it

### 2. Job Acquisition (HTTP)
- Worker attempts to dequeue job via `POST /api/thumbnail-jobs/dequeue`
- Backend marks job as "InProgress" and assigns to worker
- If job already claimed, worker ignores and waits for next notification

### 3. Model Download
- Worker downloads model file via `GET /models/{id}/file`
- File saved to temporary directory
- Original filename and type preserved

### 4. Model Loading & Normalization
- Three.js loaders parse the 3D model (OBJ, FBX, GLTF, etc.)
- Model normalized to unit size for consistent rendering
- Polygon count validated against limits

### 5. Orbit Frame Rendering
- Camera positioned in orbit around model
- Frames rendered at configurable angles (e.g., every 15°)
- Each frame rendered with consistent lighting
- Frames stored in memory as PNG buffers

### 6. Frame Encoding
- PNG frames encoded to animated WebP using FFmpeg
- First frame extracted as JPEG poster image
- Configurable quality and framerate settings
- Temporary files cleaned up after encoding

### 7. Thumbnail Upload (API-based)
- WebP and poster uploaded via `POST /models/{id}/thumbnail/upload`
- Backend stores files using existing IFileStorage infrastructure
- Backend handles hash-based deduplication
- No filesystem permissions required on worker

### 8. Job Completion
- Worker reports success via `POST /api/thumbnail-jobs/{id}/complete`
- Thumbnail metadata (path, size, dimensions) saved to database
- Temporary files cleaned up

### 9. Error Handling
- Worker reports failures via `POST /api/thumbnail-jobs/{id}/fail`
- Error message and stack trace logged
- Backend can retry job based on configuration

## Technology Stack

### Runtime & Framework
- **Node.js 18+**: JavaScript runtime
- **Express**: HTTP server for health endpoints
- **dotenv**: Environment configuration

### 3D Rendering
- **Three.js**: 3D model loading and rendering
- **canvas**: Node.js canvas implementation for rendering

### Image Processing
- **FFmpeg (fluent-ffmpeg)**: Video/animation encoding
- **Sharp**: Image processing and poster generation

### Communication
- **@microsoft/signalr**: Real-time communication with backend
- **axios**: HTTP client for REST API calls
- **form-data**: Multipart form uploads

### Monitoring & Logging
- **Winston**: Structured JSON logging
- **Express**: Health check HTTP server

## Quick Start

### Prerequisites
- Node.js 18 or higher
- Backend Web API running and accessible
- FFmpeg installed on the system

### Installation
```bash
cd src/worker-service
npm install
```

### Configuration
```bash
cp .env.example .env
# Edit .env with your settings
```

Key settings:
- `API_BASE_URL`: Backend API URL (default: http://localhost:5009)
- `WORKER_ID`: Unique worker identifier
- `MAX_CONCURRENT_JOBS`: Concurrent job limit (default: 3)

### Running
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Health Check
```bash
curl http://localhost:3001/health
```

## Documentation Structure

This documentation is organized into the following sections:

- **[Files and Responsibilities](files-and-responsibilities.md)** - Detailed description of all source files and their roles
- **[Service Communication](service-communication.md)** - How the worker communicates with the Web API
- **[Configuration](configuration.md)** - Complete configuration reference
- **[Deployment](deployment.md)** - Docker and production deployment guides
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## Related Documentation

- [Worker API Integration](../worker-api-integration.md) - API-based thumbnail storage approach
- [Worker Service README](../../src/worker-service/README.md) - Quick reference and getting started

## Support

For issues and questions:
- Check the [Troubleshooting](troubleshooting.md) guide
- Review logs with `LOG_LEVEL=debug`
- Check health endpoints for service status

# Worker Service Documentation

Comprehensive documentation for the Modelibr Thumbnail Worker Service.

## Overview

The Modelibr Thumbnail Worker Service is a Node.js microservice that generates thumbnails and animated previews of 3D models. It operates as a standalone service that communicates with the main Web API via HTTP REST and SignalR real-time messaging.

## Documentation Structure

### [Index](index.md)
Main overview and architecture of the worker service:
- Service overview and key features
- Architecture diagrams
- Technology stack
- Processing pipeline
- Quick start guide

### [Files and Responsibilities](files-and-responsibilities.md)
Detailed documentation of all source files:
- Core application files (`index.js`, `config.js`, `logger.js`)
- Job processing files (`jobProcessor.js`, `signalrQueueService.js`, `thumbnailJobService.js`)
- Model processing files (`modelFileService.js`, `modelLoaderService.js`, `orbitFrameRenderer.js`, `frameEncoderService.js`)
- Thumbnail storage files (`thumbnailStorageService.js`, `thumbnailApiService.js`)
- Health monitoring (`healthServer.js`)
- Configuration files and dependencies

### [Service Communication](service-communication.md)
How the worker communicates with other services:
- SignalR real-time communication (job notifications)
- HTTP REST API communication (job management, file upload/download)
- API endpoints and request/response formats
- Error handling and retry logic
- Performance considerations

### [Configuration](configuration.md)
Complete configuration reference:
- All environment variables with descriptions and defaults
- Worker identification settings
- API connection settings
- Rendering and orbit animation settings
- Encoding and storage settings
- Logging and error handling
- Environment-specific configurations
- Best practices

### [Deployment](deployment.md)
Deployment guides for different environments:
- Prerequisites and system requirements
- Local development setup
- Docker deployment (single container and Compose)
- Kubernetes deployment (manifests, ConfigMaps, HPA)
- Production considerations (security, performance, reliability)
- Scaling strategies (horizontal and vertical)
- Monitoring and observability

### [Troubleshooting](troubleshooting.md)
Common issues and solutions:
- Startup issues
- Connection issues (API, SignalR, uploads)
- Job processing failures
- Performance problems
- Resource issues (memory, CPU, disk)
- Docker-specific issues
- Debugging tools and techniques
- Error message reference

## Quick Links

### Getting Started
- **[Installation](deployment.md#local-development)**: Set up worker locally
- **[Configuration](configuration.md)**: Configure environment variables
- **[Health Checks](index.md#quick-start)**: Verify worker is running

### For Developers
- **[Architecture](index.md#architecture)**: Understand system design
- **[File Structure](files-and-responsibilities.md)**: Navigate the codebase
- **[API Integration](service-communication.md)**: Learn how services communicate

### For Operators
- **[Docker Deployment](deployment.md#docker-deployment)**: Run in containers
- **[Kubernetes](deployment.md#kubernetes-deployment)**: Deploy to K8s
- **[Monitoring](deployment.md#monitoring)**: Set up observability
- **[Troubleshooting](troubleshooting.md)**: Fix common issues

### Related Documentation
- **[Worker Service README](../../src/worker-service/README.md)**: Quick reference in source code
- **[Worker API Integration](../worker-api-integration.md)**: API-based thumbnail storage

## Common Tasks

### Run Worker Locally
```bash
cd src/worker-service
npm install
cp .env.example .env
# Edit .env with your settings
npm start
```

### Check Worker Health
```bash
curl http://localhost:3001/health
curl http://localhost:3001/status
```

### Deploy with Docker
```bash
docker build -t modelibr-thumbnail-worker .
docker run -d -p 3001:3001 \
  -e API_BASE_URL=http://api:8080 \
  modelibr-thumbnail-worker
```

### Scale Workers
```bash
# Docker Compose
docker compose up -d --scale thumbnail-worker=3

# Kubernetes
kubectl scale deployment thumbnail-worker --replicas=3
```

### Debug Issues
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Preserve temp files
export CLEANUP_TEMP_FILES=false
npm start
```

## Key Concepts

### Processing Pipeline
1. **Job Notification** - Worker receives real-time notification via SignalR
2. **Job Acquisition** - Worker claims job via HTTP API
3. **Model Download** - Worker downloads 3D model file
4. **Model Processing** - Load and normalize with Three.js
5. **Frame Rendering** - Generate orbit animation frames
6. **Frame Encoding** - Create WebP animation and JPEG poster
7. **Upload** - Upload thumbnails to backend API
8. **Completion** - Report success/failure to backend

### Communication Methods
- **SignalR** - Real-time job notifications (WebSocket/SSE)
- **HTTP REST** - Job management, file operations, uploads

### Key Features
- Real-time job processing with SignalR
- Concurrent job execution (configurable)
- API-based thumbnail storage (no filesystem permissions needed)
- Automatic deduplication via backend
- Health check endpoints for monitoring
- Graceful shutdown handling

## Support

For issues and questions:
1. Check [Troubleshooting Guide](troubleshooting.md)
2. Enable debug logging: `LOG_LEVEL=debug`
3. Check health endpoints: `/health`, `/status`
4. Review [Service Communication](service-communication.md) for API issues
5. See [Configuration](configuration.md) for settings

## Contributing

When modifying the worker service:
1. Read [Files and Responsibilities](files-and-responsibilities.md) to understand code structure
2. Follow existing patterns and conventions
3. Update documentation when adding features
4. Test with different configurations
5. Update health/metrics endpoints if needed

## Version History

### Current (Latest)
- SignalR-based real-time job notifications
- API-based thumbnail upload (no filesystem permissions)
- WebP animated thumbnails + JPEG poster
- Orbit frame rendering with Three.js
- Hash-based deduplication (backend)
- Health check endpoints
- Graceful shutdown

See [../worker-api-integration.md](../worker-api-integration.md) for recent API integration changes.


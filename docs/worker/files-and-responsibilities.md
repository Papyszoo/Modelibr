# Files and Responsibilities

This document provides a comprehensive overview of all files in the worker service and their responsibilities.

## Core Application Files

### index.js
**Purpose**: Main application entry point and lifecycle management

**Responsibilities**:
- Loads environment variables from `.env` file
- Initializes and starts the ThumbnailWorkerApp
- Handles application startup errors
- Sets up process-level error handling

**Key Components**:
- `ThumbnailWorkerApp` class - Main application orchestrator
  - Manages JobProcessor instance
  - Manages HealthServer instance
  - Handles graceful shutdown
  - Sets up signal handlers (SIGTERM, SIGINT)

**Startup Flow**:
1. Load environment configuration
2. Validate configuration
3. Initialize JobProcessor
4. Initialize HealthServer
5. Start HealthServer (port 3001)
6. Start JobProcessor (SignalR connection)
7. Set up shutdown handlers

### config.js
**Purpose**: Centralized configuration management

**Exports**:
- `config` object - All configuration settings
- `validateConfig()` function - Configuration validation

**Configuration Sections**:
- **Server**: Worker ID, port
- **API Connection**: Base URL, TLS settings
- **Job Processing**: Concurrency, polling interval
- **Rendering**: Dimensions, format, background, camera
- **Orbit Animation**: Enable, angles, camera height
- **Frame Encoding**: Enable, framerate, quality, cleanup
- **Thumbnail Storage**: Enable, path, deduplication
- **Logging**: Level, format
- **Error Handling**: Retries, delays
- **Health Check**: Enable, endpoint

**Environment Variables**:
All settings sourced from environment with sensible defaults.

### logger.js
**Purpose**: Structured logging with Winston

**Features**:
- JSON and simple text formats
- Configurable log levels (error, warn, info, debug)
- Timestamp formatting
- Context enrichment

**Exports**:
- `logger` - Winston logger instance
- `withJobContext(jobId, modelId)` - Creates logger with job context

**Log Structure**:
```javascript
{
  "level": "info",
  "message": "Job completed",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "metadata": {
    "jobId": 123,
    "modelId": 456,
    // ... additional context
  }
}
```

## Job Processing Files

### jobProcessor.js
**Purpose**: Core job orchestration and processing pipeline

**Class**: `JobProcessor`

**Responsibilities**:
- Connects to SignalR hub for real-time job notifications
- Manages concurrent job execution (respects MAX_CONCURRENT_JOBS)
- Claims jobs from API when notified
- Coordinates service components for processing
- Reports job success/failure to API
- Handles graceful shutdown of active jobs

**Key Methods**:
- `start()` - Initialize and connect SignalR
- `startSignalRMode()` - Set up SignalR job notifications
- `handleJobNotification(job)` - Process SignalR notification, claim job
- `processJobAsync(job)` - Async job processing wrapper
- `processModel(job, jobLogger)` - Main processing pipeline
- `shutdown()` - Graceful shutdown with timeout
- `getStatus()` - Current processor status

**Processing Pipeline** (in `processModel`):
1. Check if thumbnails already exist (skip if so)
2. Fetch model file from API
3. Load and normalize model with Three.js
4. Generate orbit frames (if enabled)
5. Encode frames to WebP and poster (if enabled)
6. Upload thumbnails to API
7. Return thumbnail metadata for job completion
8. Clean up temporary files

**Service Integration**:
- `ThumbnailJobService` - Job API communication
- `SignalRQueueService` - Real-time notifications
- `ModelFileService` - Model file download
- `ModelLoaderService` - 3D model loading
- `OrbitFrameRenderer` - Frame rendering
- `FrameEncoderService` - WebP/JPEG encoding
- `ThumbnailStorageService` - API upload

### signalrQueueService.js
**Purpose**: Real-time job notifications via SignalR

**Class**: `SignalRQueueService`

**Responsibilities**:
- Establishes SignalR connection to ThumbnailJobHub
- Receives real-time job enqueued notifications
- Acknowledges job processing to coordinate with other workers
- Handles connection lifecycle (start, stop, reconnect)

**Key Methods**:
- `start()` - Connect to SignalR hub
- `stop()` - Disconnect from SignalR
- `onJobReceived(callback)` - Register job notification callback
- `acknowledgeJob(jobId, workerId)` - Notify other workers
- `_setupEventHandlers()` - Configure SignalR event handlers

**SignalR Events**:
- `JobEnqueued` - New job available for processing
- `JobStatusChanged` - Job status updated (coordination)

**Connection Details**:
- Hub URL: `{API_BASE_URL}/hubs/thumbnail-jobs`
- Auto-reconnect with exponential backoff
- Logs connection state changes

### thumbnailJobService.js
**Purpose**: HTTP API client for job operations

**Class**: `ThumbnailJobService`

**Responsibilities**:
- Poll for available jobs (fallback mode)
- Claim jobs with worker ID
- Mark jobs as completed or failed
- Fetch model file metadata

**API Endpoints Used**:
- `POST /api/thumbnail-jobs/dequeue` - Claim next job
- `POST /api/thumbnail-jobs/{id}/complete` - Mark success
- `POST /api/thumbnail-jobs/{id}/fail` - Mark failure
- `GET /models/{id}/file` - Get model file info
- `GET /health` - API health check

**Key Methods**:
- `pollForJob()` - Dequeue next available job
- `markJobCompleted(jobId, metadata)` - Report success
- `markJobFailed(jobId, errorMessage)` - Report failure
- `getModelFile(modelId)` - Get file metadata
- `testConnection()` - Verify API connectivity

**Error Handling**:
- Returns null for 404 (no jobs available)
- Logs and re-throws other errors
- Handles network timeouts gracefully

## Model Processing Files

### modelFileService.js
**Purpose**: Download and manage model files

**Class**: `ModelFileService`

**Responsibilities**:
- Download model files from API to temporary storage
- Extract original filename and file type from response
- Clean up temporary files after processing
- Periodic cleanup of old temporary files

**Key Methods**:
- `fetchModelFile(modelId)` - Download model file
- `cleanupFile(filePath)` - Delete temporary file
- `cleanupOldFiles(maxAgeMinutes)` - Clean old temp files
- `_saveStreamToFile(stream, filePath)` - Stream to disk

**Temporary Storage**:
- Base directory: `/tmp/modelibr-worker/downloads`
- Filename format: `model-{modelId}-{timestamp}.{ext}`
- Files cleaned up after job completion
- Old files (>30 min) cleaned periodically

**API Integration**:
- Endpoint: `GET /models/{id}/file`
- Streams response to disk
- Extracts metadata from Content-Disposition header

### modelLoaderService.js
**Purpose**: Load and normalize 3D models with Three.js

**Class**: `ModelLoaderService`

**Responsibilities**:
- Load various 3D model formats (OBJ, FBX, GLTF, GLB, etc.)
- Normalize models to unit size for consistent rendering
- Center models at origin
- Calculate polygon counts
- Validate against polygon limits

**Key Methods**:
- `loadModel(filePath, fileType)` - Load and normalize model
- `_loadModelByType(filePath, fileType)` - Format-specific loading
- `_normalizeModel(model)` - Scale and center model
- `countPolygons(model)` - Count triangles/faces

**Supported Formats**:
- `.obj` - Wavefront OBJ (OBJLoader)
- `.fbx` - Autodesk FBX (FBXLoader)
- `.gltf`, `.glb` - GLTF/GLB (GLTFLoader)
- Additional loaders can be added

**Normalization**:
- Calculates bounding box
- Centers model at (0, 0, 0)
- Scales to configurable size (default: 2 units)
- Validates polygon count against limit

### orbitFrameRenderer.js
**Purpose**: Render 360° orbit animation frames

**Class**: `OrbitFrameRenderer`

**Responsibilities**:
- Initialize Three.js scene, camera, and lighting
- Position camera in orbit around model
- Render frames at configurable angles
- Capture frames as PNG buffers
- Calculate memory usage statistics

**Key Methods**:
- `setupRenderer()` - Initialize Three.js components
- `setupLighting()` - Configure lights matching frontend
- `renderOrbitFrames(model, jobLogger)` - Render all frames
- `_renderFrame(model, angle)` - Render single frame
- `getMemoryStats(frames)` - Calculate memory usage
- `dispose()` - Clean up Three.js resources

**Rendering Setup**:
- Scene: Three.js Scene with lights and ground plane
- Camera: PerspectiveCamera (60° FOV)
- Lighting: Ambient, directional, point, and spot lights
- Background: Configurable color (default: #f0f0f0)

**Orbit Configuration**:
- Angle range: 0° to 360° (configurable)
- Angle step: 15° (configurable)
- Camera distance: 5 units (configurable)
- Camera height: 0 (configurable)

**Output**:
- PNG buffers stored in memory
- Typical output: 24 frames (15° steps)
- Memory usage logged and monitored

### frameEncoderService.js
**Purpose**: Encode frames into animated WebP and poster

**Class**: `FrameEncoderService`

**Responsibilities**:
- Convert PNG buffers to temporary PNG files
- Create animated WebP from PNG sequence using FFmpeg
- Extract poster frame (first frame) as JPEG
- Clean up temporary encoding files
- Periodic cleanup of old encoding directories

**Key Methods**:
- `encodeFrames(frames, jobLogger)` - Main encoding pipeline
- `framesToPNG(frames, workingDir, jobLogger)` - Save PNG files
- `createAnimatedWebP(pngFiles, workingDir, jobLogger)` - FFmpeg encoding
- `createPosterFrame(pngFile, workingDir, jobLogger)` - Extract poster
- `cleanupEncodingResult(result)` - Remove temp files
- `cleanupOldFiles(maxAgeMinutes)` - Periodic cleanup

**Encoding Settings**:
- WebP framerate: 10 fps (configurable)
- WebP quality: 75 (0-100, configurable)
- JPEG quality: 85 (0-100, configurable)
- Cleanup temp files: true (configurable)

**Temporary Storage**:
- Base directory: `/tmp/modelibr-frame-encoder`
- Job-specific subdirectories: `job-{timestamp}{random}`
- Files: `frame-{index}.png`, `orbit.webp`, `poster.jpg`

**FFmpeg Pipeline**:
1. Input: PNG sequence (frame-%d.png)
2. Codec: libwebp
3. Output: Animated WebP with configurable framerate and quality

### thumbnailStorageService.js
**Purpose**: Upload thumbnails to API (no local filesystem storage)

**Class**: `ThumbnailStorageService`

**Responsibilities**:
- Upload WebP and poster to backend API
- Test API connectivity on startup
- Handle API upload errors gracefully
- Backend handles deduplication via file hashing

**Key Methods**:
- `testApiConnection()` - Verify API reachable
- `checkThumbnailsExist(modelHash)` - Always returns false (API handles duplicates)
- `storeThumbnails(modelHash, webpPath, posterPath, modelId)` - Upload via API
- `getThumbnailPaths(modelHash)` - Get expected paths (for reference)

**API Integration**:
- Uses `ThumbnailApiService` for uploads
- Endpoint: `POST /models/{id}/thumbnail/upload`
- Multipart form data with file and metadata
- Backend stores files using IFileStorage

**Deduplication**:
- Worker always generates thumbnails
- Backend checks file hash on upload
- Backend skips storage if duplicate exists
- No local duplicate checking needed

### thumbnailApiService.js
**Purpose**: HTTP client for thumbnail upload API

**Class**: `ThumbnailApiService`

**Responsibilities**:
- Upload thumbnail files to backend via multipart form data
- Handle file streaming and form encoding
- Test API connectivity
- Handle HTTPS with self-signed certificates

**Key Methods**:
- `uploadThumbnail(modelId, filePath, width, height)` - Upload single file
- `uploadMultipleThumbnails(modelId, files)` - Upload multiple files
- `testConnection()` - Test API reachability

**Upload Details**:
- Content-Type: multipart/form-data
- Fields: file (binary), width (optional), height (optional)
- Response: Thumbnail metadata (path, size, dimensions)

**Error Handling**:
- Validates file exists before upload
- Handles network errors gracefully
- Logs upload failures with context
- Supports retry logic in caller

## Health and Monitoring Files

### healthServer.js
**Purpose**: HTTP health check endpoints for monitoring

**Class**: `HealthServer`

**Responsibilities**:
- Expose health check endpoints on port 3001
- Provide Kubernetes-style readiness probes
- Expose Prometheus-compatible metrics
- Report detailed system status

**Endpoints**:

**GET /health** - Basic health check
```json
{
  "status": "healthy",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "uptime": 3600,
  "worker": {
    "id": "worker-1234",
    "activeJobs": 2,
    "maxConcurrentJobs": 3,
    "isShuttingDown": false
  },
  "configuration": { ... },
  "version": "1.0.0"
}
```
- Status code: 200 (healthy) or 503 (shutting down)

**GET /status** - Detailed status
```json
{
  "service": "modelibr-thumbnail-worker",
  "status": "running",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "startTime": "2025-01-10T11:00:00.000Z",
  "uptime": 3600,
  "worker": { ... },
  "system": {
    "nodeVersion": "v18.0.0",
    "platform": "linux",
    "arch": "x64",
    "pid": 1234,
    "memory": {
      "rss": 256,
      "heapTotal": 128,
      "heapUsed": 64,
      "external": 16
    }
  },
  "configuration": { ... }
}
```

**GET /ready** - Readiness probe
```json
{
  "ready": true,
  "workerId": "worker-1234"
}
```
- Status code: 200 (ready) or 503 (not ready)

**GET /metrics** - Prometheus metrics
```
# HELP worker_uptime_seconds Total uptime of the worker
# TYPE worker_uptime_seconds counter
worker_uptime_seconds 3600

# HELP worker_active_jobs Current number of active jobs
# TYPE worker_active_jobs gauge
worker_active_jobs 2

# HELP worker_max_concurrent_jobs Maximum number of concurrent jobs
# TYPE worker_max_concurrent_jobs gauge
worker_max_concurrent_jobs 3

# HELP worker_is_shutting_down Whether the worker is shutting down
# TYPE worker_is_shutting_down gauge
worker_is_shutting_down 0
```

**Key Methods**:
- `setupRoutes()` - Configure Express routes
- `start()` - Start HTTP server
- `stop()` - Stop HTTP server

## Configuration Files

### .env.example
**Purpose**: Template for environment configuration

**Sections**:
- Worker identification (ID, port)
- API connection (base URL)
- Job processing (interval, concurrency)
- Rendering settings (size, format, camera)
- Orbit animation (angles, steps)
- Frame encoding (quality, framerate)
- Thumbnail storage (path, deduplication)
- Logging (level, format)
- Error handling (retries, delays)
- Health check (enable, endpoint)

### package.json
**Purpose**: Node.js package configuration

**Scripts**:
- `start` - Run worker service
- `dev` - Run with auto-reload
- `lint` - Check code style
- `lint:fix` - Fix code style issues
- `format` - Format code with Prettier
- `format:check` - Check code formatting

**Key Dependencies**:
- `@microsoft/signalr` - Real-time communication
- `axios` - HTTP client
- `three` - 3D rendering
- `canvas` - Node.js canvas for rendering
- `fluent-ffmpeg` - Video encoding
- `sharp` - Image processing
- `express` - HTTP server
- `winston` - Logging
- `dotenv` - Environment configuration
- `form-data` - Multipart uploads

### Dockerfile
**Purpose**: Container image definition

**Base Image**: `node:18-alpine`

**Build Steps**:
1. Install FFmpeg for video encoding
2. Copy package files
3. Install Node.js dependencies
4. Copy application code
5. Set working directory
6. Expose health check port (3001)
7. Set startup command

**Health Check**:
- Command: `curl -f http://localhost:3001/health || exit 1`
- Interval: 30s
- Timeout: 10s
- Retries: 3

### eslint.config.js
**Purpose**: ESLint configuration for code quality

**Rules**:
- No unused variables (except those prefixed with _)
- No restricted imports for development-only modules
- Prettier integration for formatting

### .prettierrc
**Purpose**: Code formatting configuration

**Settings**:
- Semi-colons: false
- Single quotes: true
- Arrow function parentheses: avoid when possible
- Trailing commas: es5

## Test Files

### test-api-service.js
**Purpose**: Manual API connectivity testing

**Functionality**:
- Tests API connection
- Verifies endpoints are accessible
- Can be run standalone for debugging

**Usage**:
```bash
node test-api-service.js
```

## File Dependency Graph

```
index.js
  ├── config.js
  ├── logger.js
  └── ThumbnailWorkerApp
      ├── JobProcessor (jobProcessor.js)
      │   ├── ThumbnailJobService (thumbnailJobService.js)
      │   │   └── axios
      │   ├── SignalRQueueService (signalrQueueService.js)
      │   │   └── @microsoft/signalr
      │   ├── ModelFileService (modelFileService.js)
      │   │   └── axios
      │   ├── ModelLoaderService (modelLoaderService.js)
      │   │   └── three (OBJLoader, FBXLoader, GLTFLoader)
      │   ├── OrbitFrameRenderer (orbitFrameRenderer.js)
      │   │   └── three (Scene, Camera, Renderer, Lights)
      │   ├── FrameEncoderService (frameEncoderService.js)
      │   │   ├── fluent-ffmpeg
      │   │   └── sharp
      │   └── ThumbnailStorageService (thumbnailStorageService.js)
      │       └── ThumbnailApiService (thumbnailApiService.js)
      │           ├── axios
      │           └── form-data
      └── HealthServer (healthServer.js)
          └── express
```

## File Locations

All worker service files are located in: `/src/worker-service/`

**Core Application**: `index.js`, `config.js`, `logger.js`

**Job Processing**: `jobProcessor.js`, `signalrQueueService.js`, `thumbnailJobService.js`

**Model Processing**: `modelFileService.js`, `modelLoaderService.js`, `orbitFrameRenderer.js`, `frameEncoderService.js`

**Thumbnail Storage**: `thumbnailStorageService.js`, `thumbnailApiService.js`

**Health Monitoring**: `healthServer.js`

**Configuration**: `.env`, `.env.example`, `package.json`, `Dockerfile`, `eslint.config.js`, `.prettierrc`

**Testing**: `test-api-service.js`

## Size and Complexity Metrics

| File | Lines | Complexity | Purpose |
|------|-------|------------|---------|
| index.js | 143 | Low | Entry point, simple orchestration |
| config.js | 155 | Low | Configuration management |
| logger.js | 42 | Low | Logging setup |
| jobProcessor.js | 532 | High | Core processing pipeline |
| signalrQueueService.js | 264 | Medium | SignalR communication |
| thumbnailJobService.js | 148 | Low | HTTP API client |
| modelFileService.js | 247 | Medium | File download and cleanup |
| modelLoaderService.js | 181 | Medium | 3D model loading |
| orbitFrameRenderer.js | 320 | Medium | Frame rendering |
| frameEncoderService.js | 362 | High | Video encoding |
| thumbnailStorageService.js | 247 | Medium | API upload orchestration |
| thumbnailApiService.js | 246 | Medium | HTTP upload client |
| healthServer.js | 183 | Low | Health endpoints |

**Total**: ~3,000 lines of code

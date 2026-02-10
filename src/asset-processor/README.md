# Modelibr Thumbnail Worker Service

A Node.js worker service for background thumbnail generation using Puppeteer and three.js. This service uses real-time SignalR notifications to receive thumbnail generation jobs and processes them asynchronously using headless Chrome.

## Features

- **SignalR Real-time Queue**: Real-time job notifications via SignalR for instant processing
- **Puppeteer-based Rendering**: Uses Puppeteer with headless Chrome to render 3D models in a real browser environment
- **Three.js Integration**: Loads models from CDN and renders them with proper lighting and materials
- **Orbit Animation**: Generates rotating orbit frames around the 3D model
- **Animated WebP Thumbnails**: Creates looping animated WebP thumbnails from orbit frames (~30 frames)
- **AI-Powered Image Tagging**: Automatic tag and description generation using local BLIP model (runs completely offline)
- **Event Logging**: Comprehensive event logging to database for full audit trail
- **Configuration Management**: Comprehensive configuration system with environment variable support
- **Health Monitoring**: Built-in health check endpoints for monitoring and container orchestration
- **Graceful Shutdown**: Proper cleanup and graceful shutdown handling
- **Structured Logging**: JSON-formatted structured logging with context
- **Error Handling**: Robust error handling - jobs fail properly without placeholder fallbacks
- **Concurrency Control**: Configurable maximum concurrent job processing
- **Docker Support**: Containerized deployment with Docker and Docker Compose
- **Lightweight**: Uses Debian Slim base image with only necessary dependencies

## Configuration

The service is configured via environment variables. See `.env.example` for all available options:

### Core Settings

- `WORKER_ID`: Unique worker identifier (default: `worker-{pid}`)
- `WORKER_PORT`: Health check server port (default: `3001`)
- `API_BASE_URL`: Base URL for the main API (default: `http://localhost:8080`)

### Job Processing

- `POLL_INTERVAL_MS`: How often to poll for jobs in milliseconds (default: `5000`)
- `MAX_CONCURRENT_JOBS`: Maximum number of jobs to process simultaneously (default: `3`)

### Thumbnail Rendering

- `RENDER_WIDTH`: Output image width in pixels (default: `256`)
- `RENDER_HEIGHT`: Output image height in pixels (default: `256`)
- `RENDER_FORMAT`: Output format: png, jpg, jpeg, webp (default: `png`)
- `RENDER_BACKGROUND`: Background color or 'transparent' for transparent background (default: `transparent`)
- `CAMERA_DISTANCE`: Camera distance from model (default: `5`)
- `ENABLE_ANTIALIASING`: Enable antialiasing (default: `true`)

### Orbit Animation

- `ORBIT_ENABLED`: Enable orbit frame rendering (default: `true`)
- `ORBIT_ANGLE_STEP`: Degrees between each frame (default: `12`, resulting in ~30 frames for full 360° rotation)
- `ORBIT_START_ANGLE`: Starting angle in degrees (default: `0`)
- `ORBIT_END_ANGLE`: Ending angle in degrees (default: `360`)
- `ORBIT_CAMERA_HEIGHT`: Camera elevation angle in degrees (vertical tilt) (default: `0`)

### Logging

- `LOG_LEVEL`: Logging level: error, warn, info, debug (default: `info`)
- `LOG_FORMAT`: Log format: json or simple (default: `json`)

## Health Endpoints

The service exposes several endpoints for monitoring:

- `GET /health` - Basic health check (returns 200 if healthy, 503 if shutting down)
- `GET /status` - Detailed status including system metrics
- `GET /ready` - Kubernetes-style readiness probe
- `GET /metrics` - Basic Prometheus-style metrics

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-09-22T10:56:55.239Z",
  "uptime": 19,
  "worker": {
    "id": "worker-4171",
    "activeJobs": 0,
    "isShuttingDown": false
  },
  "configuration": {
    "rendering": {
      "outputWidth": 256,
      "outputHeight": 256,
      "outputFormat": "png"
    }
  },
  "version": "1.0.0"
}
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Local Development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the service**

   ```bash
   npm start
   ```

4. **Development with auto-reload**
   ```bash
   npm run dev
   ```

### Testing Health Endpoints

```bash
# Basic health check
curl http://localhost:3001/health

# Detailed status
curl http://localhost:3001/status

# Readiness check
curl http://localhost:3001/ready

# Metrics
curl http://localhost:3001/metrics
```

## Deployment

### Docker

```bash
# Build the image
docker build -t modelibr-thumbnail-worker .

# Run the container
docker run -p 3001:3001 \
  -e API_BASE_URL=http://your-api:8080 \
  -e LOG_LEVEL=info \
  modelibr-thumbnail-worker
```

### Docker Compose

The service is included in the main `docker-compose.yml` file:

```bash
# Start all services including the worker
docker compose up -d

# View worker logs
docker compose logs thumbnail-worker

# Scale workers
docker compose up -d --scale thumbnail-worker=3
```

## Architecture

### Rendering Pipeline

1. **Job Notification**: SignalR hub notifies worker of new thumbnail job
2. **Model Download**: Worker fetches 3D model file from API
3. **Browser Initialization**: Puppeteer launches headless Chrome with render template
4. **Model Loading**: Three.js loads model from data URL in browser context
5. **Orbit Rendering**: Camera orbits around model, rendering ~30 frames at each angle
6. **Animation Generation**: Frames are encoded into looping animated WebP + poster JPEG
7. **Storage Upload**: Thumbnails uploaded to API storage
8. **Job Completion**: Worker reports success/failure back to API

### Technology Stack

- **Puppeteer**: Headless Chrome automation for browser-based rendering
- **Three.js**: 3D graphics library (loaded from CDN in browser)
- **Sharp**: Image processing for frame conversion
- **node-webpmux**: Animated WebP creation from multiple frames
- **SignalR**: Real-time job queue notifications
- **Express**: Health check HTTP server
- **Winston**: Structured logging

### Browser-based Rendering

The worker uses a browser-based rendering approach:

- HTML template with Three.js from CDN
- No need for native WebGL bindings (gl, canvas modules)
- True browser environment for maximum compatibility
- Simpler Docker image without Mesa/X11 dependencies

### API Integration Points

- `POST /thumbnail-jobs/dequeue` - Poll for next available job
- `POST /thumbnail-jobs/{id}/complete` - Mark job as completed
- `POST /thumbnail-jobs/{id}/fail` - Mark job as failed
- `POST /thumbnail-jobs/{id}/events` - Log detailed job events for audit trail
- `GET /models/{id}/file` - Download model file for processing
- `GET /health` - API health check

## Event Logging

The worker service logs detailed events to the database for complete audit trail:

**Event Types Logged:**

- `JobStarted` - Thumbnail generation initiated
- `ModelDownloadStarted` / `ModelDownloaded` - Model file download progress
- `ModelLoadingStarted` / `ModelLoaded` - 3D model loading and parsing
- `FrameRenderingStarted` / `FrameRenderingCompleted` - Orbit frame rendering
- `EncodingStarted` / `EncodingCompleted` - WebP/JPEG encoding
- `ThumbnailUploadStarted` / `ThumbnailUploadCompleted` - File upload to storage
- `JobCompleted` - Successful completion
- `JobFailed` - Job failure with error details

Each event includes:

- Event type and message
- Timestamp
- Optional metadata (JSON)
- Optional error message

Query events via database to track job progress and debug failures.

## Error Handling

The service includes comprehensive error handling:

- **No Placeholder Fallbacks**: Jobs fail properly if rendering cannot be completed
- **API Connection Failures**: Continues polling with exponential backoff
- **Job Processing Errors**: Reports failures back to API with detailed error information
- **Event Logging**: All errors are logged as events to database for debugging
- **Graceful Shutdown**: Waits for active jobs to complete (with timeout)
- **Uncaught Exceptions**: Logs and triggers graceful shutdown
- **Configuration Validation**: Validates all configuration on startup

## Logging

Structured JSON logging with contextual information:

```json
{
  "level": "info",
  "message": "Received thumbnail job",
  "timestamp": "2025-09-22T10:56:55.239Z",
  "metadata": {
    "jobId": 123,
    "modelId": 456,
    "modelHash": "abc123...",
    "attemptCount": 1
  }
}
```

Log levels and contexts:

- **Application lifecycle**: startup, shutdown, configuration
- **Job processing**: job received, processing started/completed/failed
- **API communication**: polling, health checks, status updates
- **Error conditions**: connection failures, processing errors, timeouts

## Future Development

The worker has been rewritten to use Puppeteer for rendering:

### Current Implementation ✅

1. **Puppeteer-based Rendering**: Uses headless Chrome with Three.js loaded from CDN
2. **Browser Environment**: True browser rendering for maximum compatibility
3. **Model Loading**: Supports OBJ, GLTF, and GLB formats via data URLs
4. **Orbit Frames**: Camera orbits around model at configurable angles (~30 frames)
5. **Animated Thumbnails**: Generates looping animated WebP and poster JPEG
6. **Lightweight Docker**: Debian Slim base with Chromium (no heavy Mesa/X11 deps)
7. **Memory Management**: Efficient frame handling with Sharp for image processing

### Architecture Benefits

- **Simpler Stack**: No native WebGL bindings (gl, canvas modules)
- **Better Compatibility**: Real browser environment matches frontend
- **Lighter Image**: ~400MB vs ~800MB with old Mesa/X11 stack
- **Easier Debugging**: Can run Puppeteer in non-headless mode for troubleshooting
- **CDN-based Three.js**: No need to bundle Three.js, loaded fresh from CDN

### Testing

```bash
# Test locally (requires Chrome/Chromium installed)
cd src/worker-service
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node test-puppeteer.js

# Test in Docker
docker compose build thumbnail-worker
docker compose up thumbnail-worker
```

## Monitoring

### Container Health Checks

The Docker container includes a built-in health check that verifies the `/health` endpoint.

### Metrics

Basic metrics are exposed at `/metrics` endpoint in Prometheus format:

- `worker_uptime_seconds` - Total uptime
- `worker_active_jobs` - Current active jobs
- `worker_is_shutting_down` - Shutdown status

### Logging Integration

Structured logs can be easily integrated with log aggregation systems like:

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Fluentd
- Datadog
- Splunk

## Troubleshooting

### Common Issues

**Service won't start**

- Check Node.js version (requires 18+)
- Verify environment configuration
- Check port availability (default 3001)

**Cannot connect to API**

- Verify `API_BASE_URL` configuration
- Check network connectivity between containers
- Ensure main API is running and accessible

**Jobs not processing**

- Check API endpoints are implemented
- Verify thumbnail job queue has pending jobs
- Check worker logs for error details

**High memory usage**

- Reduce `MAX_CONCURRENT_JOBS`
- Monitor three.js scene cleanup (when implemented)
- Check for memory leaks in job processing

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
npm start
```

This provides detailed information about configuration, API calls, and job processing flow.

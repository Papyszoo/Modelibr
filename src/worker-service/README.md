# Modelibr Thumbnail Worker Service

A Node.js worker service for background thumbnail generation using three.js. This service polls the main API for thumbnail generation jobs and processes them asynchronously.

## Features

- **SignalR Real-time Queue**: Real-time job notifications via SignalR for instant processing
- **Actual 3D Rendering**: Uses three.js WebGL renderer with node-canvas for headless rendering
- **Orbit Animation**: Generates rotating orbit frames around the 3D model
- **Event Logging**: Comprehensive event logging to database for full audit trail
- **Configuration Management**: Comprehensive configuration system with environment variable support
- **Health Monitoring**: Built-in health check endpoints for monitoring and container orchestration
- **Graceful Shutdown**: Proper cleanup and graceful shutdown handling
- **Structured Logging**: JSON-formatted structured logging with context
- **Error Handling**: Robust error handling - jobs fail properly without placeholder fallbacks
- **Concurrency Control**: Configurable maximum concurrent job processing
- **Docker Support**: Containerized deployment with Docker and Docker Compose

## Configuration

The service is configured via environment variables. See `.env.example` for all available options:

### Core Settings

- `WORKER_ID`: Unique worker identifier (default: `worker-{pid}`)
- `WORKER_PORT`: Health check server port (default: `3001`)
- `API_BASE_URL`: Base URL for the main API (default: `http://localhost:5009`)

### Job Processing

- `POLL_INTERVAL_MS`: How often to poll for jobs in milliseconds (default: `5000`)
- `MAX_CONCURRENT_JOBS`: Maximum number of jobs to process simultaneously (default: `3`)

### Thumbnail Rendering

- `RENDER_WIDTH`: Output image width in pixels (default: `256`)
- `RENDER_HEIGHT`: Output image height in pixels (default: `256`)
- `RENDER_FORMAT`: Output format: png, jpg, jpeg, webp (default: `png`)
- `RENDER_BACKGROUND`: Background color (default: `#f0f0f0`)
- `CAMERA_DISTANCE`: Camera distance from model (default: `5`)
- `ENABLE_ANTIALIASING`: Enable antialiasing (default: `true`)

### Orbit Animation

- `ORBIT_ENABLED`: Enable orbit frame rendering (default: `true`)
- `ORBIT_ANGLE_STEP`: Degrees between each frame (default: `15`)
- `ORBIT_START_ANGLE`: Starting angle in degrees (default: `0`)
- `ORBIT_END_ANGLE`: Ending angle in degrees (default: `360`)
- `ORBIT_CAMERA_HEIGHT`: Vertical camera offset from center (default: `0`)

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
    "maxConcurrentJobs": 3,
    "isShuttingDown": false
  },
  "configuration": {
    "pollIntervalMs": 5000,
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

## Architecture Integration

The worker service integrates with the existing Modelibr architecture:

1. **Job Queue**: Polls the existing `ThumbnailQueue` service via HTTP API
2. **Job Processing**: Claims jobs with worker ID for safe concurrent processing
3. **Status Updates**: Reports job completion/failure back to the main API
4. **File Access**: Downloads model files from the main API for processing

### API Integration Points

- `POST /api/thumbnail-jobs/dequeue` - Poll for next available job
- `POST /api/thumbnail-jobs/{id}/complete` - Mark job as completed
- `POST /api/thumbnail-jobs/{id}/fail` - Mark job as failed
- `POST /api/thumbnail-jobs/{id}/events` - Log detailed job events for audit trail
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

This skeleton is ready for the actual three.js rendering implementation. Next steps:

1. **Model Loading**: ✅ Implemented loaders for supported 3D formats (.obj, .fbx, .gltf, etc.)
2. **Three.js Rendering**: ✅ Set up scene, camera, lights, and renderer
3. **Orbit Frame Generation**: ✅ Implemented orbit camera animation with configurable angles
4. **Memory Management**: ✅ Frames stored in memory with logging and statistics
5. **Thumbnail Generation**: Capture rendered frames as images (pending full WebGL setup)
6. **Output Storage**: Save thumbnails to storage and update job status
7. **Performance Optimization**: Implement caching, resource pooling, and optimization

The current implementation includes:

- **Orbit Frame Rendering Pipeline**: Complete orbit animation system that positions camera at calculated distances around models and renders frames at configurable angles (e.g., every 5–15°)
- **Configurable Lighting**: Ambient and directional lighting setup matching the frontend Scene component
- **Memory Management**: Frame data stored in memory with detailed logging and memory usage tracking
- **Frame Collection**: Rendered frames collected and stored without file encoding as requested

**Current Status**: Orbit frame rendering pipeline is implemented and functional. The system can render frames for each orbit angle with consistent lighting and controllable memory usage.

## Monitoring

### Container Health Checks

The Docker container includes a built-in health check that verifies the `/health` endpoint.

### Metrics

Basic metrics are exposed at `/metrics` endpoint in Prometheus format:

- `worker_uptime_seconds` - Total uptime
- `worker_active_jobs` - Current active jobs
- `worker_max_concurrent_jobs` - Maximum concurrent jobs
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

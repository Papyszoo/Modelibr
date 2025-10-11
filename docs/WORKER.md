# Thumbnail Worker Service

Node.js microservice for generating 3D model thumbnails and animated previews. Operates independently from the .NET Web API, communicating via REST API and SignalR.

## Quick Start

### Prerequisites
- Node.js 18+
- FFmpeg
- Backend Web API running

### Setup & Run
```bash
cd src/worker-service
npm install
cp .env.example .env
# Edit .env with your API URL
npm start
```

Health check: `curl http://localhost:3001/health`

## Key Features

- **Real-time processing** - SignalR notifications for instant job pickup
- **3D format support** - OBJ, FBX, GLTF, GLB and more via Three.js loaders
- **Orbit animations** - Smooth 360° rotation at configurable angles
- **WebP encoding** - Animated WebP with configurable quality/framerate
- **API-based storage** - Uploads to backend, avoiding filesystem permission issues
- **Hash deduplication** - Backend handles duplicate detection
- **Multiple workers** - Supports concurrent instances with load balancing
- **Health monitoring** - HTTP endpoints for container orchestration

## How It Works

```
1. Upload → Backend creates job and sends SignalR notification
2. Worker → Receives notification via SignalR
3. Worker → Claims job via POST /api/thumbnail-jobs/dequeue
4. Worker → Downloads model file from API
5. Worker → Loads and normalizes 3D model with Three.js
6. Worker → Generates orbit animation frames (360°)
7. Worker → Encodes frames to animated WebP + poster image
8. Worker → Uploads thumbnail to API
9. Worker → Reports completion status
```

## Configuration

Create `.env` from `.env.example`:

### Essential Settings
```bash
# API Connection
API_BASE_URL=http://localhost:5009

# Worker Identification
WORKER_ID=worker-1
WORKER_PORT=3001

# Processing
MAX_CONCURRENT_JOBS=3

# Rendering
RENDER_WIDTH=256
RENDER_HEIGHT=256
RENDER_FORMAT=png
```

### Advanced Settings
```bash
# Orbit Animation
ENABLE_ORBIT_ANIMATION=true
ORBIT_ANGLE_STEP=12          # 360/12 = 30 frames
CAMERA_HEIGHT_MULTIPLIER=0.75

# Encoding
ENABLE_FRAME_ENCODING=true
ENCODING_FRAMERATE=10
WEBP_QUALITY=75
JPEG_QUALITY=85

# Logging
LOG_LEVEL=info              # debug, info, warn, error
LOG_FORMAT=pretty           # pretty or json

# Cleanup
CLEANUP_TEMP_FILES=true
```

## Docker Deployment

### Docker Compose
```bash
# Start worker
docker compose up -d thumbnail-worker

# Scale to 3 workers
docker compose up -d --scale thumbnail-worker=3

# View logs
docker compose logs -f thumbnail-worker

# Check health
curl http://localhost:3001/health
```

### Standalone Docker
```bash
docker build -t modelibr-worker src/worker-service
docker run -d \
  -e API_BASE_URL=http://host.docker.internal:5009 \
  -e WORKER_ID=worker-1 \
  -p 3001:3001 \
  modelibr-worker
```

## Development

### Local Development
```bash
npm run dev  # Auto-reload on file changes
```

### Testing
```bash
# Test API connectivity
node test-api-service.js

# Test with debug logging
export LOG_LEVEL=debug
npm start

# Keep temp files for inspection
export CLEANUP_TEMP_FILES=false
npm start
```

### Code Quality
```bash
npm run lint        # Check code style
npm run lint:fix    # Fix code style issues
npm run format      # Format with Prettier
```

## Troubleshooting

### Container Won't Start

**"exec /app/docker-entrypoint.sh: no such file or directory"**

This error occurs due to Windows line ending (CRLF) issues. The repository includes two fixes:
1. `.gitattributes` enforces LF endings for shell scripts
2. Dockerfile includes `dos2unix` conversion step

**Solution:** Simply rebuild the container:
```bash
docker compose build thumbnail-worker
docker compose up -d thumbnail-worker
```

For existing checkouts, optionally normalize line endings:
```bash
git rm --cached -r .
git reset --hard HEAD
```

**No Logs / Application Not Running**

If container starts but produces no logs and Node.js isn't running:
- Container uses custom `docker-entrypoint.sh` script
- Starts Xvfb in background before Node.js
- Ensures proper log forwarding to Docker stdout

Verify:
```bash
# Check if node is running
docker compose exec thumbnail-worker sh -c 'pidof node'

# View startup sequence
docker compose logs thumbnail-worker | head -20
```

Expected logs:
```
info: Starting Modelibr Thumbnail Worker Service
info: Configuration validated successfully
info: Health server started
info: Starting SignalR-based job processor
```

### Connection Issues

**Cannot Connect to API**

Check API is accessible:
```bash
# Direct test
curl http://localhost:5009/health

# From Docker container
docker compose exec thumbnail-worker curl http://webapi:8080/health
```

Common fixes:
```bash
# Wrong URL - include protocol
API_BASE_URL=http://localhost:5009  # ✓
# NOT: API_BASE_URL=localhost:5009  # ✗

# Docker networking - use service name
API_BASE_URL=http://webapi:8080

# Worker on host, API in Docker
API_BASE_URL=http://host.docker.internal:5009
```

**SignalR Connection Failed**

Enable debug logging:
```bash
LOG_LEVEL=debug
```

Verify SignalR hub endpoint:
```bash
curl http://localhost:5009/hubs/thumbnail-jobs
# Should return connection upgrade message or 404
```

### Processing Failures

**"TensorFlow native bindings error"**

If you see:
```
Error: /app/node_modules/@tensorflow/tfjs-node/lib/napi-v8/tfjs_binding.node: cannot open shared object file
```

**Fixed in latest Dockerfile:**
- Build tools (python3, make, g++) added to builder stage
- Runtime libraries (libstdc++6) added to runtime stage  
- Uses `--ignore-scripts` and rebuild to avoid download issues
- Dynamic loading enables graceful degradation: service runs normally but skips ML features if TensorFlow fails

**Note:** TensorFlow packages remain in package.json but the service will start and function normally even if they fail to load. Jobs complete successfully but without ML-generated tags/descriptions.

**Workaround to disable classification:**
```bash
# Completely disable image classification feature
IMAGE_CLASSIFICATION_ENABLED=false
```

**"Failed to create WebGL context with headless-gl"**

Requires two fixes:
1. **Mesa OpenGL libraries** - Install runtime libraries
2. **Xvfb startup** - Ensure Xvfb is ready before app starts

The latest Docker image includes both fixes. Rebuild:
```bash
docker compose build thumbnail-worker
```

Verify:
```bash
# Check Xvfb is running
docker compose exec thumbnail-worker sh -c 'pidof Xvfb'

# Verify DISPLAY is set
docker compose exec thumbnail-worker sh -c 'echo $DISPLAY'  # Should show :99

# Check Mesa libraries
docker compose exec thumbnail-worker dpkg -l | grep -E 'libgl1|mesa'
```

**"Failed to load model: Invalid file format"**

Check supported formats: `.obj`, `.fbx`, `.gltf`, `.glb`

Test with a simple .obj file:
```bash
curl -F "file=@test-model.obj" http://localhost:5009/models
```

**"Frame encoding failed"**

Verify FFmpeg:
```bash
ffmpeg -version
which ffmpeg
```

Install if missing:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

### Performance Issues

**Slow Processing**

Optimize settings:
```bash
# Reduce dimensions
RENDER_WIDTH=256
RENDER_HEIGHT=256

# Fewer frames (30° steps = 12 frames)
ORBIT_ANGLE_STEP=30

# Lower quality for faster encoding
WEBP_QUALITY=65
JPEG_QUALITY=75
```

**High Memory Usage**

Reduce workload:
```bash
# Lower concurrency
MAX_CONCURRENT_JOBS=2

# Enable cleanup
CLEANUP_TEMP_FILES=true

# Fewer frames
ORBIT_ANGLE_STEP=30
```

Docker memory limit:
```yaml
# docker-compose.yml
services:
  thumbnail-worker:
    deploy:
      resources:
        limits:
          memory: 4G  # Increase from 2G
```

**Queue Backlog**

Scale workers:
```bash
docker compose up -d --scale thumbnail-worker=5
```

Or increase per-worker capacity:
```bash
MAX_CONCURRENT_JOBS=5
```

### Disk Space Issues

**"ENOSPC: no space left on device"**

Clean up:
```bash
# Remove temp files
rm -rf /tmp/modelibr-worker/*
rm -rf /tmp/modelibr-frame-encoder/*

# Docker cleanup
docker system prune -a --volumes
```

Enable auto-cleanup:
```bash
CLEANUP_TEMP_FILES=true
```

### Debugging Tools

**Enable Debug Logging**
```bash
export LOG_LEVEL=debug
npm start
```

**Preserve Temporary Files**
```bash
export CLEANUP_TEMP_FILES=false
npm start

# Inspect files:
# /tmp/modelibr-worker/downloads/
# /tmp/modelibr-frame-encoder/job-*/
```

**Monitor Health**
```bash
# Basic health
curl http://localhost:3001/health | jq

# Detailed status
curl http://localhost:3001/status | jq

# Watch status
watch -n 5 'curl -s http://localhost:3001/status | jq ".worker,.system.memory"'
```

**Test Components**
```bash
# Test API connectivity
node test-api-service.js

# Test SignalR (use browser developer tools)
# Connect to ws://localhost:5009/hubs/thumbnail-jobs
```

## Architecture

### Technology Stack

- **Runtime** - Node.js 18+ with Express for health endpoints
- **3D Rendering** - Puppeteer with Three.js for browser-based rendering
- **Image Processing** - Sharp for frame processing and poster generation
- **Animation Encoding** - node-webpmux for animated WebP creation
- **Communication** - @microsoft/signalr for real-time notifications, axios for REST
- **Logging** - Winston with structured JSON logging

### Core Components

**index.js** - Main application entry, starts SignalR processor and health server

**config.js** - Centralized configuration from environment variables with validation

**signalrQueueService.js** - SignalR connection management and job notifications

**thumbnailJobService.js** - Job acquisition, status updates, and result reporting via HTTP

**modelDownloadService.js** - Downloads model files from backend API

**modelLoaderService.js** - Loads and normalizes 3D models with Three.js loaders

**frameRenderer.js** - Renders orbit animation frames with Three.js scene

**frameEncoder.js** - Encodes frames to animated WebP and poster with Sharp/node-webpmux

**thumbnailStorageService.js** - Uploads generated thumbnails to backend API

**healthServer.js** - HTTP server for /health and /status endpoints

### Job Processing Flow

1. **Notification** - SignalR hub broadcasts job available
2. **Acquisition** - Worker claims job via HTTP (first-come-first-served)
3. **Download** - Fetch model file from API
4. **Load** - Parse with Three.js, normalize to unit size
5. **Render** - Generate orbit frames at configured angles
6. **Encode** - Create animated WebP + poster image
7. **Upload** - Send thumbnail to API via multipart form
8. **Report** - Update job status (completed/failed)

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| **Server** | | |
| `WORKER_ID` | `worker-1` | Unique worker identifier |
| `WORKER_PORT` | `3001` | Health server port |
| **API Connection** | | |
| `API_BASE_URL` | `http://localhost:5009` | Backend API URL |
| `NODE_TLS_REJECT_UNAUTHORIZED` | - | Set to `0` to accept self-signed certs (dev only) |
| **Processing** | | |
| `MAX_CONCURRENT_JOBS` | `3` | Concurrent jobs per worker |
| `JOB_POLLING_INTERVAL_MS` | `5000` | Fallback polling interval |
| **Rendering** | | |
| `RENDER_WIDTH` | `256` | Thumbnail width in pixels |
| `RENDER_HEIGHT` | `256` | Thumbnail height in pixels |
| `RENDER_FORMAT` | `png` | Frame format (png, jpeg) |
| `BACKGROUND_COLOR` | `0xf0f0f0` | Background color (hex) |
| `CAMERA_DISTANCE_MULTIPLIER` | `2.5` | Camera distance from model |
| **Orbit Animation** | | |
| `ENABLE_ORBIT_ANIMATION` | `true` | Generate orbit animation |
| `ORBIT_ANGLE_STEP` | `12` | Degrees per frame (360/step = ~30 frames) |
| `CAMERA_HEIGHT_MULTIPLIER` | `0.75` | Camera height relative to distance |
| **Encoding** | | |
| `ENABLE_FRAME_ENCODING` | `true` | Encode to animated WebP |
| `ENCODING_FRAMERATE` | `10` | Animation framerate (fps) |
| `WEBP_QUALITY` | `75` | WebP quality (0-100) |
| `JPEG_QUALITY` | `85` | JPEG quality for poster (0-100) |
| **Storage** | | |
| `THUMBNAIL_STORAGE_ENABLED` | `true` | Upload to API |
| `THUMBNAIL_STORAGE_PATH` | `/tmp/modelibr-thumbnails` | Local temp storage |
| `SKIP_DUPLICATE_THUMBNAILS` | `true` | Skip if hash exists |
| **Logging** | | |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `LOG_FORMAT` | `pretty` | Format (pretty, json) |
| **Cleanup** | | |
| `CLEANUP_TEMP_FILES` | `true` | Delete temp files after processing |
| **Health** | | |
| `HEALTH_CHECK_ENABLED` | `true` | Enable health endpoint |
| `HEALTH_CHECK_PATH` | `/health` | Health check path |

## Getting Help

### Diagnostic Bundle

Collect diagnostic information:
```bash
mkdir -p /tmp/worker-diagnostics
cd /tmp/worker-diagnostics

# Collect logs
docker logs thumbnail-worker > worker.log 2>&1

# Configuration
env | grep -E "(WORKER|API|RENDER)" > config.txt

# Status
curl -s http://localhost:3001/status > status.json

# System info
uname -a > system.txt
node --version >> system.txt
ffmpeg -version >> system.txt

# Create archive
tar -czf ../worker-diagnostics.tar.gz .
```

### Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `ECONNREFUSED` | Cannot connect to API | Verify API URL and API is running |
| `ENOSPC` | No disk space | Clean temp files, increase disk |
| `EADDRINUSE` | Port in use | Change `WORKER_PORT` or stop conflicting service |
| `MODULE_NOT_FOUND` | Missing dependency | Run `npm install` |
| `exec: no such file` | Line ending issue | Rebuild container with `docker compose build` |

### Report Issues

Include:
1. Description of problem
2. Steps to reproduce
3. Environment (OS, Node.js version, Docker version)
4. Configuration (relevant .env values)
5. Logs with `LOG_LEVEL=debug`
6. Diagnostic bundle

## Related Documentation

- Worker README: `src/worker-service/README.md` - Quick reference
- Backend API: `docs/BACKEND_API.md` - API reference
- Project README: `README.md` - Full application setup

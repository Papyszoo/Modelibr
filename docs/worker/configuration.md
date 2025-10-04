# Configuration

This document provides a comprehensive reference for all configuration options in the worker service.

## Configuration Overview

The worker service is configured entirely through environment variables, making it container-friendly and easy to manage across different environments (development, staging, production).

Configuration file: `.env` (created from `.env.example`)

## Environment Variables Reference

### Worker Identification

#### WORKER_ID
- **Type**: String
- **Default**: `worker-{pid}` (e.g., `worker-1234`)
- **Description**: Unique identifier for this worker instance
- **Usage**: 
  - Identifies worker in logs and API requests
  - Used for job assignment tracking
  - Helps coordinate multiple workers

**Example**:
```bash
WORKER_ID=worker-prod-001
```

**Best Practices**:
- Use descriptive names in production: `worker-{env}-{region}-{number}`
- Keep unique across all worker instances
- Avoid special characters

#### WORKER_PORT
- **Type**: Integer
- **Default**: `3001`
- **Description**: HTTP port for health check endpoints
- **Usage**: Exposes `/health`, `/status`, `/ready`, `/metrics` endpoints

**Example**:
```bash
WORKER_PORT=3001
```

**Important**:
- Must not conflict with other services
- Should be exposed in Docker containers
- Used by orchestration tools (Kubernetes, Docker)

### API Connection

#### API_BASE_URL
- **Type**: URL
- **Default**: `http://localhost:5009`
- **Description**: Base URL of the Web API backend
- **Usage**: 
  - HTTP REST API calls
  - SignalR hub connection
  - All backend communication

**Example**:
```bash
# Development
API_BASE_URL=http://localhost:5009

# Docker Compose
API_BASE_URL=http://webapi:8080

# Production
API_BASE_URL=https://api.modelibr.com
```

**Important**:
- Include protocol (http:// or https://)
- No trailing slash
- Must be reachable from worker container/host

#### NODE_TLS_REJECT_UNAUTHORIZED
- **Type**: String ("0" or "1")
- **Default**: `1` (enabled)
- **Description**: Controls TLS certificate validation
- **Usage**: Set to "0" to accept self-signed certificates

**Example**:
```bash
# Production (validate certificates)
NODE_TLS_REJECT_UNAUTHORIZED=1

# Development (accept self-signed)
NODE_TLS_REJECT_UNAUTHORIZED=0
```

**Security Warning**: Never disable in production!

### Job Processing

#### POLL_INTERVAL_MS
- **Type**: Integer (milliseconds)
- **Default**: `5000` (5 seconds)
- **Description**: Polling interval for fallback mode (when SignalR unavailable)
- **Usage**: Frequency of job queue checks

**Example**:
```bash
POLL_INTERVAL_MS=5000  # Poll every 5 seconds
```

**Notes**:
- Not used when SignalR is active (real-time notifications)
- Lower values = higher API load
- Higher values = higher job latency

#### MAX_CONCURRENT_JOBS
- **Type**: Integer
- **Default**: `3`
- **Description**: Maximum number of jobs processed simultaneously
- **Usage**: Controls worker capacity and resource usage

**Example**:
```bash
MAX_CONCURRENT_JOBS=3
```

**Tuning Guidelines**:
- **Low (1-2)**: Low-resource environments, testing
- **Medium (3-5)**: Typical production workload
- **High (6-10)**: High-performance servers, GPU acceleration

**Resource Impact**:
- Each job uses ~500MB-1GB memory (model + frames)
- Each job uses 1 CPU core for rendering
- Monitor with `/status` endpoint

### Thumbnail Rendering

#### RENDER_FRAME_STEP
- **Type**: Integer
- **Default**: `1`
- **Description**: Frame skip interval (1 = render every frame)
- **Usage**: Controls frame density in animations

**Example**:
```bash
RENDER_FRAME_STEP=1  # Render every frame
```

**Note**: Currently not actively used (frames defined by orbit angles)

#### RENDER_WIDTH
- **Type**: Integer (pixels)
- **Default**: `256`
- **Description**: Output thumbnail width
- **Usage**: Sets canvas width for rendering

**Example**:
```bash
RENDER_WIDTH=256   # Standard quality
RENDER_WIDTH=512   # High quality
RENDER_WIDTH=128   # Low quality
```

**Impact**:
- Larger = better quality, more memory, slower processing
- Smaller = faster processing, less memory, lower quality

#### RENDER_HEIGHT
- **Type**: Integer (pixels)
- **Default**: `256`
- **Description**: Output thumbnail height
- **Usage**: Sets canvas height for rendering

**Example**:
```bash
RENDER_HEIGHT=256  # Square thumbnails
```

**Best Practice**: Keep equal to RENDER_WIDTH for square thumbnails

#### RENDER_FORMAT
- **Type**: String
- **Default**: `png`
- **Options**: `png`, `jpg`, `jpeg`, `webp`
- **Description**: Internal frame format before encoding
- **Usage**: Format for temporary frame storage

**Example**:
```bash
RENDER_FORMAT=png  # Recommended (lossless)
```

**Note**: Final output is always WebP (animated) + JPEG (poster)

#### RENDER_BACKGROUND
- **Type**: Color (hex)
- **Default**: `#f0f0f0` (light gray)
- **Description**: Background color for rendering
- **Usage**: Scene background color

**Example**:
```bash
RENDER_BACKGROUND=#f0f0f0  # Light gray
RENDER_BACKGROUND=#ffffff  # White
RENDER_BACKGROUND=#000000  # Black
```

#### CAMERA_DISTANCE
- **Type**: Float
- **Default**: `5`
- **Description**: Camera distance from model center
- **Usage**: Controls how close/far camera is positioned

**Example**:
```bash
CAMERA_DISTANCE=5    # Standard distance
CAMERA_DISTANCE=3    # Closer (larger model in frame)
CAMERA_DISTANCE=10   # Farther (smaller model in frame)
```

**Impact**: Affects model size in rendered frames

#### ENABLE_ANTIALIASING
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable antialiasing for smoother edges
- **Usage**: Improves visual quality

**Example**:
```bash
ENABLE_ANTIALIASING=true   # Better quality
ENABLE_ANTIALIASING=false  # Faster rendering
```

**Impact**: 
- Enabled = Smoother edges, slightly slower
- Disabled = Jagged edges, slightly faster

### Orbit Animation

#### ORBIT_ENABLED
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable orbit frame rendering
- **Usage**: Toggle 360° rotation animation

**Example**:
```bash
ORBIT_ENABLED=true   # Generate orbit animation
ORBIT_ENABLED=false  # Single frame only
```

**Important**: Disabling skips entire animation pipeline

#### ORBIT_ANGLE_STEP
- **Type**: Integer (degrees)
- **Default**: `15`
- **Description**: Degrees between each frame
- **Usage**: Controls animation smoothness

**Example**:
```bash
ORBIT_ANGLE_STEP=15   # 24 frames (360/15)
ORBIT_ANGLE_STEP=5    # 72 frames (360/5) - smoother
ORBIT_ANGLE_STEP=30   # 12 frames (360/30) - faster
```

**Impact**:
- Smaller = smoother animation, more frames, longer processing
- Larger = choppier animation, fewer frames, faster processing

**Frame Count Formula**: `(ORBIT_END_ANGLE - ORBIT_START_ANGLE) / ORBIT_ANGLE_STEP`

#### ORBIT_START_ANGLE
- **Type**: Integer (degrees)
- **Default**: `0`
- **Description**: Starting angle for orbit
- **Usage**: Where orbit animation begins

**Example**:
```bash
ORBIT_START_ANGLE=0    # Start at front
ORBIT_START_ANGLE=45   # Start at 45° offset
```

#### ORBIT_END_ANGLE
- **Type**: Integer (degrees)
- **Default**: `360`
- **Description**: Ending angle for orbit
- **Usage**: Where orbit animation ends

**Example**:
```bash
ORBIT_END_ANGLE=360   # Full rotation
ORBIT_END_ANGLE=180   # Half rotation
```

**Note**: For full orbit, use 360 (0° and 360° are same position)

#### ORBIT_CAMERA_HEIGHT
- **Type**: Float
- **Default**: `0`
- **Description**: Vertical camera offset from model center
- **Usage**: Camera height above/below center

**Example**:
```bash
ORBIT_CAMERA_HEIGHT=0    # Eye level
ORBIT_CAMERA_HEIGHT=2    # Above model
ORBIT_CAMERA_HEIGHT=-2   # Below model
```

**Use Cases**:
- Positive: Top-down perspective
- Zero: Horizontal perspective
- Negative: Bottom-up perspective

### Frame Encoding

#### ENCODING_ENABLED
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable WebP and poster encoding
- **Usage**: Toggle frame encoding step

**Example**:
```bash
ENCODING_ENABLED=true   # Create WebP + poster
ENCODING_ENABLED=false  # Skip encoding (testing)
```

**Important**: Disabling prevents thumbnail generation

#### ENCODING_FRAMERATE
- **Type**: Float (frames per second)
- **Default**: `10`
- **Description**: WebP animation framerate
- **Usage**: Controls animation playback speed

**Example**:
```bash
ENCODING_FRAMERATE=10   # Standard speed
ENCODING_FRAMERATE=15   # Faster animation
ENCODING_FRAMERATE=5    # Slower animation
```

**Impact**:
- Higher = faster playback, smoother appearance
- Lower = slower playback, more deliberate

#### WEBP_QUALITY
- **Type**: Integer (0-100)
- **Default**: `75`
- **Description**: WebP compression quality
- **Usage**: Balance between file size and quality

**Example**:
```bash
WEBP_QUALITY=75   # Balanced
WEBP_QUALITY=90   # High quality, larger files
WEBP_QUALITY=50   # Lower quality, smaller files
```

**Guidelines**:
- 50-70: Small files, acceptable quality
- 70-85: Good balance (recommended)
- 85-100: High quality, large files

#### JPEG_QUALITY
- **Type**: Integer (0-100)
- **Default**: `85`
- **Description**: JPEG poster compression quality
- **Usage**: Poster image quality

**Example**:
```bash
JPEG_QUALITY=85   # High quality
JPEG_QUALITY=75   # Balanced
JPEG_QUALITY=95   # Very high quality
```

**Guidelines**:
- 70-80: Web-friendly, good quality
- 80-90: High quality (recommended)
- 90-100: Very high quality, minimal compression

#### CLEANUP_TEMP_FILES
- **Type**: Boolean
- **Default**: `true`
- **Description**: Delete temporary encoding files after job
- **Usage**: Controls cleanup behavior

**Example**:
```bash
CLEANUP_TEMP_FILES=true   # Auto cleanup (recommended)
CLEANUP_TEMP_FILES=false  # Keep files (debugging)
```

**Disk Usage**:
- Enabled: ~100MB temporary space during processing
- Disabled: ~100MB per job accumulates (manual cleanup needed)

### Thumbnail Storage

#### THUMBNAIL_STORAGE_ENABLED
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable thumbnail upload to API
- **Usage**: Toggle thumbnail storage

**Example**:
```bash
THUMBNAIL_STORAGE_ENABLED=true   # Upload to API (recommended)
THUMBNAIL_STORAGE_ENABLED=false  # Skip upload (testing)
```

**Important**: Disabling prevents thumbnails from being saved

#### THUMBNAIL_STORAGE_PATH
- **Type**: Path
- **Default**: `/var/lib/modelibr/thumbnails`
- **Description**: Temporary path for generated thumbnails
- **Usage**: Local storage before API upload

**Example**:
```bash
# Production (Docker)
THUMBNAIL_STORAGE_PATH=/var/lib/modelibr/thumbnails

# Development
THUMBNAIL_STORAGE_PATH=/tmp/thumbnails

# Custom location
THUMBNAIL_STORAGE_PATH=/data/worker/thumbnails
```

**Important**:
- Worker only needs temporary write access
- Files deleted after successful upload
- Backend handles persistent storage

#### SKIP_DUPLICATE_THUMBNAILS
- **Type**: Boolean
- **Default**: `true`
- **Description**: Skip rendering if thumbnails exist (legacy setting)
- **Usage**: Deduplication control

**Example**:
```bash
SKIP_DUPLICATE_THUMBNAILS=true
```

**Note**: With API storage, backend handles deduplication. This setting has minimal effect.

### Logging

#### LOG_LEVEL
- **Type**: String
- **Default**: `info`
- **Options**: `error`, `warn`, `info`, `debug`
- **Description**: Logging verbosity
- **Usage**: Controls log detail level

**Example**:
```bash
LOG_LEVEL=info   # Production (recommended)
LOG_LEVEL=debug  # Development, troubleshooting
LOG_LEVEL=warn   # Minimal logging
LOG_LEVEL=error  # Errors only
```

**Log Levels**:
- `error`: Only errors
- `warn`: Errors and warnings
- `info`: General information (default)
- `debug`: Detailed debugging info

#### LOG_FORMAT
- **Type**: String
- **Default**: `json`
- **Options**: `json`, `simple`
- **Description**: Log output format
- **Usage**: Controls log formatting

**Example**:
```bash
LOG_FORMAT=json    # Structured (log aggregation)
LOG_FORMAT=simple  # Human-readable (development)
```

**JSON Format**:
```json
{
  "level": "info",
  "message": "Job completed",
  "timestamp": "2025-01-10T12:00:00.000Z",
  "metadata": { "jobId": 123 }
}
```

**Simple Format**:
```
2025-01-10T12:00:00.000Z [info]: Job completed {"jobId":123}
```

### Error Handling

#### MAX_RETRIES
- **Type**: Integer
- **Default**: `3`
- **Description**: Maximum retry attempts for failed operations
- **Usage**: Retry logic for transient errors

**Example**:
```bash
MAX_RETRIES=3   # Retry up to 3 times
```

**Note**: Currently not actively used (backend handles job retries)

#### RETRY_DELAY_MS
- **Type**: Integer (milliseconds)
- **Default**: `1000` (1 second)
- **Description**: Delay between retry attempts
- **Usage**: Backoff delay for retries

**Example**:
```bash
RETRY_DELAY_MS=1000   # 1 second between retries
```

**Note**: Currently not actively used

### Health Check

#### HEALTHCHECK_ENABLED
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable health check HTTP server
- **Usage**: Toggle health endpoints

**Example**:
```bash
HEALTHCHECK_ENABLED=true   # Enable (required for Docker)
HEALTHCHECK_ENABLED=false  # Disable (not recommended)
```

**Endpoints**:
- `/health` - Basic health check
- `/status` - Detailed status
- `/ready` - Readiness probe
- `/metrics` - Prometheus metrics

#### HEALTHCHECK_ENDPOINT
- **Type**: String
- **Default**: `/health`
- **Description**: Health check endpoint path
- **Usage**: Customize health endpoint URL

**Example**:
```bash
HEALTHCHECK_ENDPOINT=/health     # Standard
HEALTHCHECK_ENDPOINT=/healthz    # Kubernetes style
```

## Configuration Files

### .env
Primary configuration file (created from `.env.example`)

**Location**: `/src/worker-service/.env`

**Usage**:
```bash
cp .env.example .env
# Edit .env with your settings
```

**Important**:
- Not committed to git (in `.gitignore`)
- Environment-specific settings
- Override with environment variables

### .env.example
Template configuration file

**Location**: `/src/worker-service/.env.example`

**Purpose**:
- Documents all available settings
- Provides default values
- Used to create `.env` file

**Maintenance**:
- Always update when adding new settings
- Keep in sync with documentation
- Commit to git as reference

## Docker Configuration

### docker-compose.yml
Environment variables in Docker Compose:

```yaml
services:
  thumbnail-worker:
    image: modelibr-thumbnail-worker
    environment:
      - WORKER_ID=worker-docker-001
      - WORKER_PORT=3001
      - API_BASE_URL=http://webapi:8080
      - MAX_CONCURRENT_JOBS=3
      - LOG_LEVEL=info
      - LOG_FORMAT=json
      - THUMBNAIL_STORAGE_ENABLED=true
      - THUMBNAIL_STORAGE_PATH=/tmp/thumbnails
      - NODE_TLS_REJECT_UNAUTHORIZED=0
    ports:
      - "3001:3001"
    networks:
      - modelibr-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Dockerfile
Default environment variables:

```dockerfile
ENV WORKER_PORT=3001 \
    API_BASE_URL=http://webapi:8080 \
    LOG_LEVEL=info \
    LOG_FORMAT=json
```

## Configuration Validation

The service validates configuration on startup:

### Required Settings
- `API_BASE_URL`: Must be valid URL
- `WORKER_PORT`: Must be valid port number

### Warnings
- Missing optional settings use defaults
- Invalid values logged with warnings

### Validation Code
```javascript
// config.js
export function validateConfig() {
  // Validate API_BASE_URL
  if (!config.apiBaseUrl) {
    throw new Error('API_BASE_URL is required')
  }
  
  try {
    new URL(config.apiBaseUrl)
  } catch {
    throw new Error('API_BASE_URL must be a valid URL')
  }

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    throw new Error('WORKER_PORT must be between 1 and 65535')
  }

  // Validate numeric values
  if (config.maxConcurrentJobs < 1) {
    throw new Error('MAX_CONCURRENT_JOBS must be at least 1')
  }

  logger.info('Configuration validated successfully')
}
```

## Environment-Specific Configurations

### Development
```bash
WORKER_ID=worker-dev-001
API_BASE_URL=http://localhost:5009
LOG_LEVEL=debug
LOG_FORMAT=simple
NODE_TLS_REJECT_UNAUTHORIZED=0
MAX_CONCURRENT_JOBS=2
RENDER_WIDTH=256
RENDER_HEIGHT=256
```

### Staging
```bash
WORKER_ID=worker-staging-001
API_BASE_URL=https://staging-api.modelibr.com
LOG_LEVEL=info
LOG_FORMAT=json
NODE_TLS_REJECT_UNAUTHORIZED=1
MAX_CONCURRENT_JOBS=3
RENDER_WIDTH=512
RENDER_HEIGHT=512
```

### Production
```bash
WORKER_ID=worker-prod-us-east-001
API_BASE_URL=https://api.modelibr.com
LOG_LEVEL=warn
LOG_FORMAT=json
NODE_TLS_REJECT_UNAUTHORIZED=1
MAX_CONCURRENT_JOBS=5
RENDER_WIDTH=512
RENDER_HEIGHT=512
WEBP_QUALITY=85
JPEG_QUALITY=90
```

## Configuration Best Practices

### Security
- ✅ Never commit `.env` file to git
- ✅ Use TLS certificate validation in production
- ✅ Rotate worker IDs periodically
- ✅ Use environment-specific configurations
- ❌ Don't disable TLS validation in production
- ❌ Don't share `.env` files across environments

### Performance
- ✅ Tune MAX_CONCURRENT_JOBS based on resources
- ✅ Monitor memory usage with `/status` endpoint
- ✅ Adjust render dimensions based on needs
- ✅ Balance quality vs. file size (WEBP_QUALITY)
- ❌ Don't set MAX_CONCURRENT_JOBS too high (OOM risk)
- ❌ Don't use excessive render dimensions

### Operations
- ✅ Use structured logging (JSON) in production
- ✅ Enable health checks for orchestration
- ✅ Set descriptive worker IDs
- ✅ Document custom configurations
- ❌ Don't disable health checks in production
- ❌ Don't use debug logging in production

### Debugging
- ✅ Use LOG_LEVEL=debug for troubleshooting
- ✅ Set CLEANUP_TEMP_FILES=false to inspect files
- ✅ Check `/status` endpoint for diagnostics
- ✅ Use simple log format for readability
- ❌ Don't forget to re-enable cleanup
- ❌ Don't leave debug logging enabled

## Configuration Troubleshooting

### Worker Won't Start
Check:
- API_BASE_URL is valid and reachable
- WORKER_PORT is not in use
- Required environment variables set
- Configuration passes validation

### Can't Connect to API
Check:
- API_BASE_URL includes protocol (http:// or https://)
- API is running and accessible
- Network connectivity (ping, telnet)
- TLS certificate validation (NODE_TLS_REJECT_UNAUTHORIZED)

### Poor Performance
Adjust:
- MAX_CONCURRENT_JOBS (lower if memory constrained)
- RENDER_WIDTH/HEIGHT (smaller for faster processing)
- ORBIT_ANGLE_STEP (larger for fewer frames)
- WEBP_QUALITY (lower for smaller files)

### High Memory Usage
Reduce:
- MAX_CONCURRENT_JOBS
- RENDER_WIDTH/HEIGHT
- Number of orbit frames (increase ORBIT_ANGLE_STEP)

Check:
- `/status` endpoint for memory metrics
- Active job count
- Frame cleanup (ensure CLEANUP_TEMP_FILES=true)

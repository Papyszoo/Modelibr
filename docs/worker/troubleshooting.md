# Troubleshooting

This guide helps diagnose and resolve common issues with the worker service.

## Table of Contents

- [Startup Issues](#startup-issues)
- [Connection Issues](#connection-issues)
- [Job Processing Issues](#job-processing-issues)
- [Performance Issues](#performance-issues)
- [Resource Issues](#resource-issues)
- [Docker Issues](#docker-issues)
- [Debugging Tools](#debugging-tools)

## Startup Issues

### Worker Won't Start

**Symptoms**:
- Worker exits immediately after startup
- Error in logs during initialization
- "Configuration validation failed" error

**Diagnosis**:

1. **Check logs**:
```bash
npm start 2>&1 | tee worker.log
```

2. **Verify Node.js version**:
```bash
node --version
# Should be v18.0.0 or higher
```

3. **Check configuration**:
```bash
# Verify .env file exists
ls -la .env

# Check for syntax errors
cat .env | grep -v '^#' | grep -v '^$'
```

**Solutions**:

**Missing .env file**:
```bash
cp .env.example .env
# Edit .env with your settings
```

**Invalid API_BASE_URL**:
```bash
# .env
API_BASE_URL=http://localhost:5009  # Include protocol
# NOT: API_BASE_URL=localhost:5009  # Missing protocol
```

**Port already in use**:
```bash
# Check if port 3001 is in use
lsof -i :3001

# Use different port
export WORKER_PORT=3002
npm start
```

**Node.js version too old**:
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Missing Dependencies

**Symptoms**:
- "Cannot find module" errors
- FFmpeg not found
- Canvas installation errors

**Solutions**:

**Node modules missing**:
```bash
rm -rf node_modules package-lock.json
npm install
```

**FFmpeg not installed**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
```

**Canvas build errors (Linux)**:
```bash
# Install build dependencies
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install canvas
```

**Canvas build errors (macOS)**:
```bash
# Install dependencies
brew install pkg-config cairo pango libpng jpeg giflib librsvg
npm install canvas
```

## Connection Issues

### Cannot Connect to API

**Symptoms**:
- "API connection test failed" in logs
- SignalR connection errors
- "ECONNREFUSED" errors

**Diagnosis**:

1. **Check API is running**:
```bash
curl http://localhost:5009/health
```

2. **Check network connectivity**:
```bash
# Ping API host
ping localhost

# Test port
telnet localhost 5009
# or
nc -zv localhost 5009
```

3. **Check worker logs**:
```bash
export LOG_LEVEL=debug
npm start
```

**Solutions**:

**API not running**:
```bash
# Start the backend API
cd src/WebApi
export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
dotnet run
```

**Wrong API URL**:
```bash
# .env - Check protocol and port
API_BASE_URL=http://localhost:5009  # Correct
# NOT: http://localhost:8080        # Wrong port
```

**Docker networking**:
```bash
# Worker in Docker, API on host
API_BASE_URL=http://host.docker.internal:5009

# Both in Docker, same network
API_BASE_URL=http://webapi:8080
```

**TLS certificate issues**:
```bash
# Development only - accept self-signed certs
NODE_TLS_REJECT_UNAUTHORIZED=0

# Production - fix certificate or use HTTP
```

### SignalR Connection Failures

**Symptoms**:
- "SignalR connection failed" in logs
- "Failed to connect to hub" errors
- Workers not receiving job notifications

**Diagnosis**:

1. **Enable SignalR debug logging**:
```javascript
// signalrQueueService.js (temporarily)
.configureLogging(LogLevel.Debug)  // Change from Warning
```

2. **Check SignalR hub URL**:
```bash
curl http://localhost:5009/hubs/thumbnail-jobs
# Should return 404 or connection upgrade message
```

3. **Check WebSocket support**:
```bash
# Browser console (if applicable)
wscat -c ws://localhost:5009/hubs/thumbnail-jobs
```

**Solutions**:

**Hub endpoint not found**:
- Verify backend has SignalR configured
- Check hub route: `/hubs/thumbnail-jobs`
- Ensure backend is running latest version

**WebSocket blocked**:
```javascript
// Falls back to Server-Sent Events automatically
// No action needed
```

**Connection timeout**:
```bash
# Increase timeout (not typically needed)
# Check firewall/proxy settings
```

### API Upload Failures

**Symptoms**:
- "Thumbnail upload failed" in logs
- 413 (Payload Too Large) errors
- 401 (Unauthorized) errors

**Diagnosis**:

1. **Check thumbnail file size**:
```bash
# Enable debug to see file paths
export LOG_LEVEL=debug
export CLEANUP_TEMP_FILES=false
npm start

# Check file size
ls -lh /tmp/modelibr-frame-encoder/job-*/orbit.webp
```

2. **Test upload manually**:
```bash
curl -X POST -F "file=@thumbnail.webp" \
  http://localhost:5009/models/1/thumbnail/upload
```

**Solutions**:

**File too large**:
```bash
# Reduce quality
WEBP_QUALITY=60  # Default: 75
JPEG_QUALITY=70  # Default: 85

# Reduce dimensions
RENDER_WIDTH=256   # Default: 256
RENDER_HEIGHT=256  # Default: 256
```

**Upload endpoint not found**:
- Verify backend API version
- Check endpoint exists: `POST /models/{id}/thumbnail/upload`

**Authentication required**:
- Currently not implemented
- Check backend configuration

## Job Processing Issues

### Jobs Not Processing

**Symptoms**:
- Worker idle, no jobs processing
- Queue has jobs but workers don't pick them up
- "No jobs available" in logs

**Diagnosis**:

1. **Check worker status**:
```bash
curl http://localhost:3001/status | jq '.worker'
```

2. **Check job queue**:
```bash
# Query backend for pending jobs
curl http://localhost:5009/api/thumbnail-jobs/pending
```

3. **Check SignalR connection**:
```bash
curl http://localhost:3001/status | jq '.worker.signalrConnected'
# Should be true
```

**Solutions**:

**SignalR not connected**:
```bash
# Check logs for connection errors
# Verify API_BASE_URL
# Restart worker
```

**Job already claimed**:
- Multiple workers may compete
- First to claim gets the job
- This is normal behavior

**Worker at capacity**:
```bash
# Check active jobs
curl http://localhost:3001/status | jq '.worker.activeJobs'

# Increase capacity
MAX_CONCURRENT_JOBS=5  # Default: 3
```

**Backend queue empty**:
- Upload a model to trigger job
- Check backend logs for job creation

### Processing Failures

**Symptoms**:
- "Thumbnail generation failed" errors
- Jobs marked as failed
- Specific error messages in logs

**Common Errors and Solutions**:

#### "Waiting failed: 10000ms exceeded" or "TimeoutError" during Puppeteer initialization

**Cause**: This timeout occurs when Puppeteer waits for `window.THREE` but it's never exposed from the ES6 module, or when WebGL context creation fails.

**Root Causes**:
1. Three.js imported as ES6 module but not exposed on `window` object
2. Chrome launched with flags that prevent WebGL context creation (`--disable-gpu`, `--disable-software-rasterizer`)

**Solution**: This issue has been fixed in the latest version:

1. **Three.js exposure (render-template.html)**:
   ```javascript
   // THREE is now explicitly exposed on window
   window.THREE = THREE;
   window.initRenderer = initScene;
   // ... other functions
   ```

2. **Chrome WebGL flags (puppeteerRenderer.js)**:
   ```javascript
   // Use ANGLE with SwiftShader for software rendering in headless mode
   '--use-gl=angle',
   '--use-angle=swiftshader',
   '--enable-webgl',
   // REMOVED: --disable-gpu, --disable-software-rasterizer
   ```

**Verification**:
```bash
# Test Puppeteer initialization
cd src/worker-service
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node test-puppeteer.js

# Should output:
# ✓ Renderer initialized successfully
# ✓ Render template exists
# ✓ Camera distance calculated
# ✓ Memory stats
```

**Docker verification**:
```bash
# Rebuild worker with latest changes
docker compose build thumbnail-worker
docker compose up -d thumbnail-worker

# Check logs for successful initialization
docker compose logs thumbnail-worker | grep "Puppeteer renderer initialized successfully"
```

#### "Failed to create WebGL context with headless-gl"
**Cause**: Missing Mesa OpenGL libraries, or Xvfb not ready

**Solutions**:
```bash
# First, rebuild with latest image that includes required Mesa libraries
docker compose build thumbnail-worker
docker compose up -d thumbnail-worker

# Check if Xvfb is running
docker compose exec thumbnail-worker sh -c 'pidof Xvfb'

# Verify DISPLAY is set
docker compose exec thumbnail-worker sh -c 'echo $DISPLAY'

# Check Xvfb socket exists
docker compose exec thumbnail-worker sh -c 'ls -la /tmp/.X11-unix/X99'

# Test WebGL context creation
docker compose exec thumbnail-worker node test-webgl-simple.js

# Verify Mesa libraries are installed
docker compose exec thumbnail-worker dpkg -l | grep -E 'libgl1|mesa'
```

**Note**: This issue requires two fixes:
1. Mesa OpenGL runtime libraries (`libgl1` and `mesa-utils`) must be installed in the runtime Docker image
2. Xvfb must be properly started and ready before the application starts (fixed in docker-entrypoint.sh)

See [xvfb-startup-fix.md](xvfb-startup-fix.md) for Xvfb startup timing details.

#### "chrome_crashpad_handler: --database is required"
**Cause**: Chrome crash reporter trying to start without proper configuration. This can be a symptom of sandbox or dependency issues.

**Solution**: This issue has been fixed using Puppeteer best practices:

1. **Proper User Setup (Dockerfile):**
   - Added user to `audio,video` groups (Puppeteer recommendation)
   - Created `/home/worker/Downloads` directory (required by Puppeteer)
   - Installed all required dependencies per Puppeteer documentation

2. **Complete Dependency List:**
   Required packages added based on [Puppeteer troubleshooting guide](https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux):
   - `libxss1`, `libxtst6`, `libxext6`, `libxfixes3`, `libxi6`, `libxcursor1`, `libxrender1`
   - Plus existing: `libgbm1`, `libatk-bridge2.0-0`, `libatk1.0-0`, `libcups2`, `libdbus-1-3`, etc.

3. **Chrome Launch Flags:**
   - `--no-sandbox` - Required in Docker/CI environments (Puppeteer docs)
   - `--disable-crash-reporter`, `--disable-crashpad` - Disable crash reporter
   - `--no-crash-upload` - Prevent crash upload attempts
   - Environment variables: `CHROME_CRASHPAD_PIPE_NAME=''`, `BREAKPAD_DISABLE=1`

**To apply this fix**:
```bash
# Rebuild the worker container to get the latest dependencies and user setup
docker compose build thumbnail-worker
docker compose up -d thumbnail-worker

# Verify the worker is running without errors
docker compose logs thumbnail-worker --tail=50
```

**Reference**: [Puppeteer Docker Guide](https://pptr.dev/troubleshooting#running-puppeteer-in-docker)

#### "Failed to load model: Invalid file format"
**Cause**: Unsupported or corrupt model file

**Solutions**:
```bash
# Check file type
file /path/to/model.obj

# Verify supported formats
# Supported: .obj, .fbx, .gltf, .glb

# Test with sample file
curl -F "file=@docs/sample-cube.obj" http://localhost:5009/models
```

#### "Failed to load model: File not found"
**Cause**: Model file download failed

**Solutions**:
```bash
# Check API endpoint
curl http://localhost:5009/models/1/file

# Check disk space
df -h /tmp

# Check permissions
ls -la /tmp/modelibr-worker/downloads
```

#### "Frame encoding failed"
**Cause**: FFmpeg error or missing

**Solutions**:
```bash
# Verify FFmpeg installed
ffmpeg -version

# Check FFmpeg in PATH
which ffmpeg

# Install FFmpeg
sudo apt-get install ffmpeg
```

#### "Thumbnail upload failed: ENOSPC"
**Cause**: No disk space

**Solutions**:
```bash
# Check disk space
df -h

# Clean up old files
rm -rf /tmp/modelibr-worker/*
rm -rf /tmp/modelibr-frame-encoder/*

# Enable cleanup
CLEANUP_TEMP_FILES=true
```

### Job Timeouts

**Symptoms**:
- Jobs take too long
- Workers appear stuck
- No progress in logs

**Diagnosis**:

1. **Check active jobs**:
```bash
curl http://localhost:3001/status
```

2. **Monitor processing**:
```bash
export LOG_LEVEL=debug
npm start
```

3. **Check resource usage**:
```bash
top -p $(pgrep -f "node.*index.js")
```

**Solutions**:

**Large model files**:
```bash
# Set polygon limit (not yet implemented)
# Reduce model complexity before upload
```

**Too many frames**:
```bash
# Reduce frame count
ORBIT_ANGLE_STEP=30  # 12 frames instead of 24
```

**Slow encoding**:
```bash
# Reduce quality
WEBP_QUALITY=65  # Faster encoding
```

## Performance Issues

### Slow Processing

**Symptoms**:
- Jobs take longer than expected
- Low throughput
- High processing times in logs

**Diagnosis**:

1. **Measure processing time**:
```bash
# Check logs for timing
grep "processing.*completed" worker.log
```

2. **Profile components**:
```bash
export LOG_LEVEL=debug
# Watch for timing in logs:
# - Model loading time
# - Frame rendering time
# - Encoding time
# - Upload time
```

**Solutions**:

**Optimize rendering**:
```bash
# Reduce render dimensions
RENDER_WIDTH=256
RENDER_HEIGHT=256

# Fewer frames
ORBIT_ANGLE_STEP=20  # 18 frames instead of 24

# Disable antialiasing
ENABLE_ANTIALIASING=false
```

**Optimize encoding**:
```bash
# Lower quality
WEBP_QUALITY=65
JPEG_QUALITY=75

# Faster framerate (fewer keyframes)
ENCODING_FRAMERATE=5  # Default: 10
```

**Increase concurrency**:
```bash
# More parallel jobs (if resources allow)
MAX_CONCURRENT_JOBS=5
```

### High Latency

**Symptoms**:
- Long time between upload and thumbnail
- Delayed job notifications
- Slow API responses

**Diagnosis**:

1. **Measure network latency**:
```bash
# Ping API
ping -c 10 api.modelibr.com

# Measure API response time
time curl http://localhost:5009/health
```

2. **Check queue depth**:
```bash
# Check pending jobs
curl http://localhost:5009/api/thumbnail-jobs/pending | jq 'length'
```

**Solutions**:

**Network latency**:
- Deploy worker closer to API
- Use CDN for model files
- Optimize network route

**Queue backlog**:
```bash
# Scale workers
docker compose up -d --scale thumbnail-worker=5

# Increase concurrency per worker
MAX_CONCURRENT_JOBS=5
```

## Resource Issues

### High Memory Usage

**Symptoms**:
- Out of memory (OOM) errors
- Worker crashes
- Slow system performance

**Diagnosis**:

1. **Check memory usage**:
```bash
# Worker memory
curl http://localhost:3001/status | jq '.system.memory'

# System memory
free -h

# Docker container memory
docker stats thumbnail-worker
```

2. **Identify memory leak**:
```bash
# Monitor over time
watch -n 5 'curl -s http://localhost:3001/status | jq ".system.memory.heapUsed"'
```

**Solutions**:

**Reduce concurrency**:
```bash
MAX_CONCURRENT_JOBS=2  # Lower from 3 or 5
```

**Reduce render dimensions**:
```bash
RENDER_WIDTH=256   # Lower from 512
RENDER_HEIGHT=256
```

**Fewer frames**:
```bash
ORBIT_ANGLE_STEP=30  # Fewer frames
```

**Enable cleanup**:
```bash
CLEANUP_TEMP_FILES=true  # Clean up after each job
```

**Increase container memory**:
```yaml
# docker-compose.yml
services:
  thumbnail-worker:
    deploy:
      resources:
        limits:
          memory: 4G  # Increase from 2G
```

**Restart periodically**:
```bash
# Cron job to restart worker daily
0 2 * * * docker restart thumbnail-worker
```

### High CPU Usage

**Symptoms**:
- 100% CPU usage
- Slow processing
- System unresponsive

**Diagnosis**:

1. **Check CPU usage**:
```bash
top -p $(pgrep -f "node.*index.js")

# Docker
docker stats thumbnail-worker
```

2. **Profile CPU**:
```bash
# Node.js CPU profile
node --cpu-prof index.js
```

**Solutions**:

**Reduce workload**:
```bash
MAX_CONCURRENT_JOBS=2  # Lower concurrency
```

**Limit container CPU**:
```yaml
# docker-compose.yml
services:
  thumbnail-worker:
    deploy:
      resources:
        limits:
          cpus: '2.0'  # Limit to 2 cores
```

**Optimize rendering**:
```bash
RENDER_WIDTH=256  # Smaller dimensions
ORBIT_ANGLE_STEP=30  # Fewer frames
```

### Disk Space Issues

**Symptoms**:
- "ENOSPC: no space left on device"
- Cannot create temporary files
- Processing failures

**Diagnosis**:

1. **Check disk space**:
```bash
df -h

# Check temp directories
du -sh /tmp/modelibr-worker
du -sh /tmp/modelibr-frame-encoder
```

2. **Find large files**:
```bash
find /tmp -type f -size +100M -ls
```

**Solutions**:

**Clean up manually**:
```bash
# Remove temp files
rm -rf /tmp/modelibr-worker/*
rm -rf /tmp/modelibr-frame-encoder/*

# Docker volumes
docker system prune -a --volumes
```

**Enable auto-cleanup**:
```bash
CLEANUP_TEMP_FILES=true
```

**Use different temp directory**:
```bash
# Larger disk
THUMBNAIL_STORAGE_PATH=/mnt/large-disk/thumbnails
```

**Periodic cleanup**:
```bash
# Cron job to clean temp files
0 * * * * find /tmp/modelibr-* -type f -mtime +1 -delete
```

## Docker Issues

### Container Won't Start

**Symptoms**:
- Container exits immediately
- "Container is unhealthy" status
- Restart loop

**Diagnosis**:

1. **Check logs**:
```bash
docker logs thumbnail-worker

# Last 50 lines
docker logs --tail 50 thumbnail-worker

# Follow logs
docker logs -f thumbnail-worker
```

2. **Check container status**:
```bash
docker ps -a | grep thumbnail-worker
docker inspect thumbnail-worker
```

**Solutions**:

**Missing environment variables**:
```bash
docker run -e API_BASE_URL=http://host.docker.internal:5009 ...
```

**Port conflict**:
```bash
# Use different port
docker run -p 3002:3001 ...
```

**Health check failing**:
```bash
# Test health endpoint manually
docker exec thumbnail-worker curl http://localhost:3001/health

# Disable health check temporarily
docker run --no-healthcheck ...
```

### Network Issues

**Symptoms**:
- Cannot reach API from container
- "ECONNREFUSED" errors
- Timeout errors

**Diagnosis**:

1. **Test connectivity**:
```bash
# From container
docker exec thumbnail-worker curl http://webapi:8080/health

# From host
curl http://localhost:5009/health
```

2. **Check network**:
```bash
docker network ls
docker network inspect modelibr-network
```

**Solutions**:

**Not in same network**:
```bash
docker network connect modelibr-network thumbnail-worker
```

**Using host network (Linux only)**:
```bash
docker run --network host ...
```

**Use host.docker.internal (Mac/Windows)**:
```bash
API_BASE_URL=http://host.docker.internal:5009
```

## Debugging Tools

### Enable Debug Logging

**Application level**:
```bash
export LOG_LEVEL=debug
npm start
```

**SignalR level**:
```javascript
// signalrQueueService.js
.configureLogging(LogLevel.Debug)
```

**FFmpeg level**:
```bash
# FFmpeg logs to stderr by default
# Captured in worker logs
```

### Preserve Temporary Files

```bash
# Keep files for inspection
export CLEANUP_TEMP_FILES=false
npm start

# Files location:
# - /tmp/modelibr-worker/downloads/
# - /tmp/modelibr-frame-encoder/job-*/
```

### Test Individual Components

**Test API connectivity**:
```bash
node test-api-service.js
```

**Test SignalR**:
```bash
# Browser
open docs/signalr-test.html

# Or create simple test
node -e "
const signalR = require('@microsoft/signalr');
const connection = new signalR.HubConnectionBuilder()
  .withUrl('http://localhost:5009/hubs/thumbnail-jobs')
  .build();
connection.start()
  .then(() => console.log('Connected'))
  .catch(err => console.error(err));
"
```

**Test model loading**:
```bash
node -e "
const { ModelLoaderService } = require('./modelLoaderService.js');
const loader = new ModelLoaderService();
loader.loadModel('docs/sample-cube.obj', '.obj')
  .then(model => console.log('Loaded:', model))
  .catch(err => console.error('Error:', err));
"
```

### Monitor Health Endpoints

**Basic health**:
```bash
watch -n 5 'curl -s http://localhost:3001/health | jq'
```

**Detailed status**:
```bash
watch -n 5 'curl -s http://localhost:3001/status | jq ".worker,.system.memory"'
```

**Metrics**:
```bash
curl http://localhost:3001/metrics
```

### Trace Network Requests

**Enable axios debug**:
```javascript
// Add to thumbnailJobService.js temporarily
import axios from 'axios';
axios.interceptors.request.use(request => {
  console.log('Request:', request.method, request.url);
  return request;
});
axios.interceptors.response.use(response => {
  console.log('Response:', response.status, response.config.url);
  return response;
});
```

**Use tcpdump**:
```bash
# Capture HTTP traffic
sudo tcpdump -i lo -A -s 0 'tcp port 5009 and (((ip[2:2] - ((ip[0]&0xf)<<2)) - ((tcp[12]&0xf0)>>2)) != 0)'
```

**Use curl equivalent**:
```bash
# Dequeue job
curl -v -X POST http://localhost:5009/api/thumbnail-jobs/dequeue \
  -H "Content-Type: application/json" \
  -d '{"workerId":"worker-test"}'

# Upload thumbnail
curl -v -X POST http://localhost:5009/models/1/thumbnail/upload \
  -F "file=@thumbnail.webp" \
  -F "width=256" \
  -F "height=256"
```

### Performance Profiling

**Node.js CPU profiling**:
```bash
node --cpu-prof index.js
# Creates CPU profile file
# Analyze with Chrome DevTools
```

**Memory profiling**:
```bash
node --heap-prof index.js
# Creates heap profile
# Analyze with Chrome DevTools
```

**Monitoring with clinic.js**:
```bash
npm install -g clinic
clinic doctor -- node index.js
clinic flame -- node index.js
clinic bubbleprof -- node index.js
```

### Remote Debugging

**Enable inspector**:
```bash
node --inspect=0.0.0.0:9229 index.js
```

**Connect Chrome DevTools**:
1. Open chrome://inspect
2. Click "Configure" and add `localhost:9229`
3. Click "inspect" on the worker process

**VS Code debugging**:
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Worker",
      "program": "${workspaceFolder}/src/worker-service/index.js",
      "envFile": "${workspaceFolder}/src/worker-service/.env"
    }
  ]
}
```

## Getting Help

### Collect Diagnostic Information

```bash
# Create diagnostic bundle
mkdir -p /tmp/worker-diagnostics
cd /tmp/worker-diagnostics

# Collect logs
docker logs thumbnail-worker > worker.log 2>&1

# Collect configuration
env | grep -E "(WORKER|API|RENDER|ORBIT|ENCODING|LOG)" > config.txt

# Collect status
curl -s http://localhost:3001/status > status.json

# Collect system info
uname -a > system.txt
node --version >> system.txt
npm --version >> system.txt
ffmpeg -version >> system.txt
df -h > disk.txt
free -h > memory.txt

# Create archive
cd /tmp
tar -czf worker-diagnostics.tar.gz worker-diagnostics/

echo "Diagnostic bundle: /tmp/worker-diagnostics.tar.gz"
```

### Report Issues

When reporting issues, include:
1. **Description**: What's happening vs. what should happen
2. **Steps to reproduce**: Exact steps to trigger the issue
3. **Environment**: OS, Node.js version, Docker version
4. **Configuration**: Relevant environment variables
5. **Logs**: Worker logs with LOG_LEVEL=debug
6. **Diagnostic bundle**: Output from above script

### Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| ECONNREFUSED | Cannot connect to API | Check API is running, verify URL |
| ENOSPC | No disk space | Clean up temp files, increase disk |
| EACCES | Permission denied | Check file permissions, run as correct user |
| ERR_INVALID_URL | Invalid API URL | Check API_BASE_URL format |
| MODULE_NOT_FOUND | Missing dependency | Run `npm install` |
| EADDRINUSE | Port already in use | Change WORKER_PORT or stop conflicting service |
| Segmentation fault | Canvas/Native crash | Reinstall canvas module, check system libs |
| Out of memory | Memory exhausted | Reduce concurrency, increase container memory |

### Additional Resources

- [Worker Service README](../../src/worker-service/README.md)
- [Configuration Guide](configuration.md)
- [Deployment Guide](deployment.md)
- [Service Communication](service-communication.md)
- [Files and Responsibilities](files-and-responsibilities.md)

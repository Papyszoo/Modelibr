# Thumbnail Worker WebGL Context Verification Guide

## Issue
If you're experiencing thumbnail generation failures with the error:
```
error: Model processing failed {
  "metadata": {
    "error": "Failed to create WebGL context with headless-gl. Ensure the worker is running with xvfb-run and Mesa libraries are installed.",
    "jobId": 1,
    "modelId": 1
  }
}
```

## Solution: Rebuild the Docker Image

The fixes for this issue are already implemented in the codebase. You need to **rebuild your Docker image** to get the latest fixes.

### Required Fixes (Already in Code)

1. **Mesa OpenGL Libraries** (`libgl1`, `mesa-utils`) - Installed in Dockerfile
2. **Xvfb Virtual Display** (`xvfb`, `xauth`) - Installed in Dockerfile  
3. **Proper Xvfb Startup** - Entrypoint waits for X11 socket to be ready
4. **Line Endings Fix** - Entrypoint script fixed with `dos2unix`

### Step-by-Step Verification

#### 1. Rebuild the Thumbnail Worker Container

```bash
# Stop any running containers
docker compose down

# Rebuild the thumbnail-worker image (force rebuild, no cache)
docker compose build --no-cache thumbnail-worker

# Start the service
docker compose up -d thumbnail-worker
```

#### 2. Verify Xvfb Starts Successfully

Check the container logs to ensure Xvfb starts:

```bash
docker compose logs thumbnail-worker | head -20
```

**Expected output:**
```
Waiting for Xvfb to start...
Xvfb started successfully on display :99
info: Starting Modelibr Thumbnail Worker Service
```

If you see "ERROR: Xvfb failed to start", there may be a system-level issue. See [Troubleshooting](#troubleshooting) below.

#### 3. Test WebGL Context Creation

Run the built-in WebGL test script inside the container:

```bash
docker compose exec thumbnail-worker sh -c "export DISPLAY=:99 && node test-webgl-simple.js"
```

**Expected output:**
```
info: Testing WebGL context creation...
info: DISPLAY environment variable: {"metadata":{"display":":99"}}
info: Attempting to create GL context...
info: GL context created successfully! {"metadata":{"renderer":"ANGLE","vendor":"stack-gl","version":"WebGL 1.0 stack-gl 8.1.6"}}
```

If you see "Failed to create WebGL context", continue to [Troubleshooting](#troubleshooting).

#### 4. Verify Mesa Libraries are Installed

Check that the required libraries are present:

```bash
docker compose exec thumbnail-worker sh -c "dpkg -l | grep -E '(libgl1|mesa-utils|xvfb)'"
```

**Expected output should include:**
```
ii  libgl1:amd64                1.6.0-1                        amd64        Vendor neutral GL dispatch library -- legacy GL support
ii  mesa-utils                  8.5.0-1                        amd64        Miscellaneous Mesa utilities
ii  xvfb                        2:21.1.7-3+deb12u10            amd64        Virtual Framebuffer 'fake' X server
```

#### 5. Test Thumbnail Generation End-to-End

Upload a model and trigger thumbnail generation:

```bash
# Upload a test model (assuming webapi is running on port 8080)
curl -X POST http://localhost:8080/uploadModel \
  -F "file=@/path/to/your/model.glb" \
  -F "name=test-model"
```

Check the worker logs for successful processing:

```bash
docker compose logs -f thumbnail-worker
```

## Troubleshooting

### Xvfb Still Won't Start

If Xvfb fails to start even after rebuilding:

1. **Check container permissions**:
   ```bash
   docker compose exec thumbnail-worker sh -c "ls -la /tmp/.X11-unix/"
   ```
   
   The directory should exist with proper permissions (1777).

2. **Check Docker version**: Ensure you're running Docker Engine 20.10+ and Docker Compose v2.x+
   ```bash
   docker version
   docker compose version
   ```

3. **System resources**: Ensure your system has enough memory and isn't under heavy load.

### WebGL Context Still Fails After Xvfb Starts

If Xvfb starts successfully but WebGL context creation still fails:

1. **Check DISPLAY variable**:
   ```bash
   docker compose exec thumbnail-worker sh -c "echo \$DISPLAY"
   ```
   Should output: `:99`

2. **Check X11 socket permissions**:
   ```bash
   docker compose exec thumbnail-worker sh -c "ls -la /tmp/.X11-unix/X99"
   ```
   Socket should exist and be accessible.

3. **Verify headless-gl package**:
   ```bash
   docker compose exec thumbnail-worker sh -c "npm list gl"
   ```
   Should show `gl@8.1.6` or similar.

### Old Image Still Being Used

If you rebuild but the old image is still being used:

```bash
# Remove ALL old images
docker compose down
docker system prune -a

# Rebuild from scratch
docker compose build --no-cache thumbnail-worker
docker compose up -d thumbnail-worker
```

### Container Keeps Restarting

If the container keeps restarting, check the full logs:

```bash
docker compose logs thumbnail-worker --tail=100
```

Common causes:
- **API not available**: Worker can't connect to webapi service (this is OK if running in development)
- **Configuration error**: Check environment variables in `.env` file
- **Port conflict**: Port 3001 might be in use by another service

## Background: What Was Fixed

### Fix 1: Mesa OpenGL Runtime Libraries

The Dockerfile now includes `libgl1` and `mesa-utils` in the runtime stage:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    ...
    libxi6 libglu1-mesa libglew2.2 libgl1 mesa-utils xvfb xauth \
    ...
```

These provide the OpenGL implementation that headless-gl needs to create WebGL contexts.

### Fix 2: Reliable Xvfb Startup

The entrypoint script (`docker-entrypoint.sh`) now waits for the X11 socket to be fully created before starting the Node.js application:

```bash
# Wait for X11 socket to be ready
MAX_WAIT=10
WAIT_COUNT=0
while [ ! -S /tmp/.X11-unix/X99 ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  sleep 0.5
  WAIT_COUNT=$((WAIT_COUNT + 1))
done
```

This eliminates race conditions where the application starts before Xvfb is ready.

### Fix 3: Entrypoint Line Endings

The Dockerfile uses `dos2unix` to ensure the entrypoint script has Unix line endings, preventing "exec format error":

```dockerfile
RUN dos2unix docker-entrypoint.sh && chmod +x docker-entrypoint.sh
```

## Related Documentation

- [Thumbnail Fix Summary](thumbnail-fix-summary.md) - Complete overview of all fixes
- [Xvfb Startup Fix](xvfb-startup-fix.md) - Details on Xvfb reliability improvements
- [Mesa Libraries Fix](mesa-libraries-fix.md) - Details on OpenGL library requirements
- [Troubleshooting Guide](troubleshooting.md) - General worker troubleshooting
- [WebGL Fix Documentation](../../src/worker-service/WEBGL_FIX.md) - Technical details on WebGL implementation

## Verification Checklist

Use this checklist to confirm everything is working:

- [ ] Docker image rebuilt with latest code (`docker compose build --no-cache thumbnail-worker`)
- [ ] Xvfb starts successfully (check logs: "Xvfb started successfully")
- [ ] WebGL test passes (`docker compose exec thumbnail-worker sh -c "export DISPLAY=:99 && node test-webgl-simple.js"`)
- [ ] Mesa libraries installed (`dpkg -l | grep libgl1` shows installed)
- [ ] Worker service starts without errors
- [ ] Thumbnail generation works end-to-end

## Still Having Issues?

If you've followed all steps and thumbnail generation still fails:

1. **Capture full logs**:
   ```bash
   docker compose logs thumbnail-worker > worker-logs.txt
   ```

2. **Run diagnostic script**:
   ```bash
   docker compose exec thumbnail-worker node test-webgl-simple.js 2>&1 | tee webgl-test.txt
   ```

3. **Check system information**:
   ```bash
   docker version > system-info.txt
   docker compose version >> system-info.txt
   uname -a >> system-info.txt
   ```

4. **Open an issue** on GitHub with:
   - The log files (`worker-logs.txt`, `webgl-test.txt`, `system-info.txt`)
   - Your Docker Compose configuration
   - Steps you've already tried
   - Your operating system and Docker environment details

## Success Indicators

When everything is working correctly, you should see:

1. **Container starts cleanly**:
   ```
   Waiting for Xvfb to start...
   Xvfb started successfully on display :99
   info: Starting Modelibr Thumbnail Worker Service
   ```

2. **WebGL test passes**:
   ```
   info: GL context created successfully!
   info: {"renderer":"ANGLE","vendor":"stack-gl","version":"WebGL 1.0 stack-gl 8.1.6"}
   ```

3. **Thumbnail jobs complete successfully** (check worker logs when a model is uploaded)

4. **No WebGL-related errors** in the logs

---

**Last Updated**: October 6, 2025  
**Tested With**: Docker Engine 27.x, Docker Compose v2.30.x, Node.js v20.19.5

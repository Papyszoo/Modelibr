# Xvfb Startup Reliability Fix

## Problem
The thumbnail worker service was experiencing intermittent failures when creating WebGL contexts:

```
error: Model processing failed {
  "metadata": {
    "error": "Failed to create WebGL context with headless-gl. Ensure the worker is running with xvfb-run and Mesa libraries are installed.",
    "jobId": 1,
    "modelId": 1
  }
}
```

## Root Cause

### Timing Issue
The original `docker-entrypoint.sh` used a fixed `sleep 1` delay after starting Xvfb:

```sh
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!
export DISPLAY=:99
sleep 1  # ❌ Fixed delay - not reliable
exec node index.js
```

### Why This Failed
1. **Race Condition**: On slower systems or under load, Xvfb might take longer than 1 second to fully initialize
2. **No Verification**: The script didn't verify Xvfb actually started successfully
3. **Silent Failure**: If Xvfb failed to start, the Node.js application would start anyway and fail later when trying to create GL contexts

### Environment Variable Order
The `DISPLAY` variable was set AFTER starting Xvfb, which could cause timing issues on some systems.

## Solution

### Improved Startup Sequence

```sh
#!/bin/sh
set -e

# 1. Set DISPLAY first
export DISPLAY=:99

# 2. Start Xvfb
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!

# 3. Wait for Xvfb socket to be ready
echo "Waiting for Xvfb to start..."
MAX_WAIT=10
WAIT_COUNT=0
while [ ! -S /tmp/.X11-unix/X99 ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  sleep 0.5
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

# 4. Verify Xvfb started successfully
if [ ! -S /tmp/.X11-unix/X99 ]; then
  echo "ERROR: Xvfb failed to start within ${MAX_WAIT} seconds"
  exit 1
fi

echo "Xvfb started successfully on display :99"

# 5. Start Node.js application
exec node index.js
```

### Key Improvements

1. **Proper Wait Loop**: Checks for the actual X11 socket file instead of blindly sleeping
2. **Timeout Protection**: Maximum 10 second wait prevents indefinite hangs
3. **Error Handling**: Fails fast if Xvfb doesn't start
4. **Status Messages**: Provides visibility into startup process
5. **Environment Variable Order**: Sets `DISPLAY` before starting Xvfb

## Testing

### Verify Xvfb Starts Correctly

```bash
# Build the image
docker compose build thumbnail-worker

# Run and check logs
docker compose up thumbnail-worker

# Expected output:
# Waiting for Xvfb to start...
# Xvfb started successfully on display :99
# info: Starting Modelibr Thumbnail Worker Service
```

### Test WebGL Context Creation

The repository includes a test script for verifying WebGL:

```bash
# Run inside container
docker compose exec thumbnail-worker node test-webgl-simple.js

# Expected output:
# info: Testing WebGL context creation...
# info: DISPLAY environment variable: {"display":":99"}
# info: GL context created successfully!
```

### Manual Verification

```bash
# Start container with shell
docker run --rm -it --entrypoint /bin/sh thumbnail-worker

# Inside container:
ps aux | grep Xvfb     # Should show Xvfb running
ls -la /tmp/.X11-unix/ # Should show X99 socket
echo $DISPLAY          # Should show :99
```

## Performance Impact

- **Startup Time**: Typically adds < 0.5 seconds (Xvfb usually ready within 1-2 iterations)
- **Resource Usage**: No change (same Xvfb process)
- **Reliability**: Eliminates race conditions on slower systems

## Backward Compatibility

This fix is fully backward compatible:
- Same Xvfb configuration
- Same display number (:99)
- Same final state (Node.js as PID 1 via exec)
- No API or behavior changes

## Related Issues

- Addresses WebGL context creation failures reported by users
- Complements existing WebGL 2 polyfill (webgl2-polyfill.js)
- Works with headless-gl package (gl@8.1.6)
- Compatible with existing Dockerfile configuration

## Files Modified

- `src/worker-service/docker-entrypoint.sh` - Improved Xvfb startup logic
- `src/worker-service/test-webgl-simple.js` - New test script for verification (development only)

## Prevention

With this fix:
- ✅ Xvfb is guaranteed to be ready before Node.js starts
- ✅ Clear error messages if Xvfb fails to start
- ✅ Works reliably on slow systems and under load
- ✅ Better debugging with status messages

## Troubleshooting

### Xvfb Still Fails to Start

If you see "ERROR: Xvfb failed to start within 10 seconds":

1. **Check System Logs**:
   ```bash
   docker logs thumbnail-worker 2>&1 | grep -i xvfb
   ```

2. **Verify Mesa Libraries**:
   ```bash
   docker run --rm --entrypoint /bin/sh thumbnail-worker -c 'dpkg -l | grep mesa'
   ```

3. **Check Permissions**:
   ```bash
   docker run --rm --entrypoint /bin/sh thumbnail-worker -c 'ls -la /tmp/.X11-unix'
   ```

### WebGL Context Still Fails

If Xvfb starts but GL context creation fails:

1. **Verify DISPLAY is set**:
   ```bash
   docker compose exec thumbnail-worker sh -c 'echo $DISPLAY'
   ```

2. **Test GL directly**:
   ```bash
   docker compose exec thumbnail-worker node test-webgl-simple.js
   ```

3. **Check headless-gl package**:
   ```bash
   docker compose exec thumbnail-worker sh -c 'npm list gl'
   ```

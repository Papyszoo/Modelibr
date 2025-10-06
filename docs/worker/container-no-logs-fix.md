# Thumbnail Worker Container Fix

## Problem
After PR #199, the thumbnail-worker container would start and appear healthy, but produced no logs and the Node.js application wasn't actually running.

## Root Cause Analysis

### Initial Symptoms
- Container status: Running
- Health check: Starting (but never becomes healthy)
- Docker logs: Empty (no output)
- Application: Not responding on port 3001
- No Node.js process running inside container

### Investigation Steps
1. Checked container processes - found only `xvfb-run` and `Xvfb` processes, no Node.js
2. Tested running node manually inside container - worked and produced logs
3. Examined the Dockerfile CMD with `xvfb-run`
4. Discovered that xvfb-run was failing to execute the node command

### Root Cause
The issue was with how `xvfb-run` was being invoked in the Docker CMD:

```dockerfile
CMD ["xvfb-run", "-a", "-s", "-screen 0 1280x1024x24", "node", "index.js"]
```

When Docker's entrypoint mechanism processes this command, the `-s` option's argument `-screen 0 1280x1024x24` was being misinterpreted. The `xvfb-run` script expects the server arguments as a single quoted string after `-s`, but the Docker entrypoint was splitting it incorrectly.

Additionally, even when using a custom shell script as entrypoint, the `xvfb-run` wrapper was causing issues with log output - the logs from the node process were not being forwarded to Docker's stdout/stderr properly.

### Why Logs Were Missing
1. `xvfb-run` was receiving incorrect arguments
2. The node command was never being executed (xvfb-run was trying to execute "0" as a command instead of the full Xvfb arguments)
3. Without node running, no logs were produced
4. The container stayed running because Xvfb was still active, making it appear as if everything was working

## Solution

### Changes Made
1. **Created custom entrypoint script** (`docker-entrypoint.sh`):
   - Starts Xvfb in the background directly
   - Sets DISPLAY environment variable
   - Executes node process with proper I/O handling
   
2. **Updated Dockerfile**:
   - Added custom entrypoint script
   - Created X11 socket directory for Xvfb
   - Changed ENTRYPOINT to use the custom script

3. **Removed dependency on xvfb-run wrapper**:
   - Direct Xvfb invocation is simpler and more reliable
   - Ensures proper log output to Docker stdout/stderr
   - Better control over process lifecycle

### Entrypoint Script
```bash
#!/bin/sh
set -e

# Start Xvfb in the background
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!

# Set DISPLAY environment variable
export DISPLAY=:99

# Give Xvfb a moment to start
sleep 1

# Start node application
exec node index.js
```

### Why This Works
- Xvfb starts cleanly with explicit arguments
- DISPLAY is set correctly for the node process
- `exec` ensures node replaces the shell as PID 1 (after a brief startup)
- Logs from node go directly to stdout/stderr and are captured by Docker
- No wrapper script complications

## Alternative Solutions Considered

1. **Fix xvfb-run invocation**: Attempted various quoting and escaping strategies - all had issues with Docker's entrypoint processing
2. **Use shell-form CMD**: Would work but loses the benefits of exec-form (proper signal handling)
3. **Different approach with tini**: Overly complex for this use case
4. **Keep xvfb-run with redirects**: Still had issues with log forwarding

## Verification Steps

To verify the fix works:
```bash
# Build the image
docker compose build thumbnail-worker

# Run the container
docker run --rm --name test-worker thumbnail-worker

# Check logs (should see startup messages immediately)
docker logs test-worker

# In another terminal, check if app is running
docker exec test-worker sh -c 'find /proc -name exe -type l 2>/dev/null | xargs readlink 2>/dev/null | grep node'
```

Expected logs:
```
info: Starting Modelibr Thumbnail Worker Service
info: Configuration validated successfully
info: Worker configuration
info: Health server started
info: Starting SignalR-based job processor
```

## Files Changed
- `src/worker-service/Dockerfile` - Added X11 directory creation, changed to custom entrypoint
- `src/worker-service/docker-entrypoint.sh` - New custom entrypoint script for proper Xvfb and node startup

## Note for Future
This solution provides clean separation between Xvfb (background) and the node application (foreground/PID 1). If different Xvfb configurations are needed, they can be easily adjusted in the entrypoint script.


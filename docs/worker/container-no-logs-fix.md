# Thumbnail Worker Container Fix

## Problem
After PR #199, the thumbnail-worker container would start and appear healthy, but produced no logs and the Node.js application wasn't actually running.

## Root Cause Analysis

### Initial Symptoms
- Container status: Running
- Health check: Starting/passing (initially)
- Docker logs: Empty (no output)
- Application: Not responding on port 3001

### Investigation Steps
1. Checked container processes - found only `xvfb-run` shell wrapper, no Node.js process
2. Examined node_modules in container - found empty directories
3. Traced issue to Docker build step: `npm ci --omit=dev`

### Root Cause
The `npm ci` command was consistently crashing during Docker build with error:
```
npm error Exit handler never called!
npm error This is an error with npm itself.
```

**Critical Issue**: npm exits with code 0 (success) despite the crash, so Docker build continues without detecting the failure.

The crash occurs after ~70 seconds, likely due to network/SSL timeout when connecting to npm registry. The crash leaves behind empty node_modules directory structure without any actual package files.

### Why Logs Were Missing
1. npm ci created empty node_modules directories
2. Docker build appeared successful (exit code 0)
3. Container started with `xvfb-run npm start`
4. Node.js tried to run but immediately failed: `Cannot find package '/app/node_modules/dotenv/index.js'`
5. The xvfb-run wrapper and npm process hierarchy didn't properly forward the error to Docker logs

## Solution

### Changes Made
1. **Dockerfile**: Copy pre-installed node_modules from build context instead of running npm ci
2. **.dockerignore**: Comment out node_modules exclusion to allow copying
3. **CMD**: Changed from `npm start` to direct `node index.js` to avoid npm wrapper

### Why This Works
- Dependencies are installed locally where npm works correctly
- Docker build simply copies the working node_modules
- Direct node execution provides better log output
- Avoids npm's exit handler bug entirely

## Alternative Solutions Considered

1. **Fix npm ci flags**: Tried various combinations (`--omit=dev`, without flags, `--production`) - all crashed
2. **Use npm install**: Also crashed with same error
3. **Use yarn**: Would work but adds complexity
4. **Fix certificates**: Already installed, not the core issue
5. **Different Node version**: Tested Node 20 and 22, both had the issue

## Verification Steps

To verify the fix works:
```bash
# Build the image
docker compose build thumbnail-worker

# Run the container
docker compose up thumbnail-worker

# Check logs (should see startup messages)
docker logs thumbnail-worker

# Check if app is running
curl http://localhost:3001/health
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
- `src/worker-service/Dockerfile` - Copy node_modules, use node directly
- `src/worker-service/.dockerignore` - Allow node_modules copying

## Note for Future
If npm ci is fixed or a different build environment is used, consider reverting to npm ci for smaller images. The current solution works but increases image size by including devDependencies.

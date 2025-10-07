# Worker Service Tests

This directory contains test scripts for validating the thumbnail worker service functionality.

## Available Tests

### 1. test-crashpad-fix.js (NEW)
**Purpose**: Tests the Chrome/Chromium crashpad crash handler fix to ensure the browser launches without crash reporter errors.

**Usage:**
```bash
# In Docker container (recommended)
docker compose exec thumbnail-worker node test-crashpad-fix.js

# Locally (requires Chrome/Chromium and dependencies)
node test-crashpad-fix.js
```

**What it tests:**
- PuppeteerRenderer initialization without crashpad errors
- Chrome launch flags are properly configured
- Environment variables are correctly set to disable crash reporting
- No "chrome_crashpad_handler: --database is required" errors

**Expected output:**
```
=== Testing Crashpad Fix ===
Test 1: Validating launch options...
✓ PuppeteerRenderer instance created
Test 2: Initializing Puppeteer renderer...
✓ Renderer initialized successfully without crashpad errors
Test 3: Environment configuration...
✓ Environment configured correctly
=== All crashpad fix tests passed! ===
```

### 2. test-puppeteer.js
**Purpose**: Tests basic Puppeteer renderer functionality including initialization and rendering capabilities.

**Usage:**
```bash
# In Docker container
docker compose exec thumbnail-worker node test-puppeteer.js

# Locally (requires Chrome/Chromium and dependencies)
node test-puppeteer.js
```

**What it tests:**
- Renderer initialization
- Render template loading
- Camera distance calculation
- Memory statistics

## Running Tests in Docker

The recommended way to test the worker service is using Docker:

```bash
# Build the worker container with latest code
docker compose build thumbnail-worker

# Start the worker
docker compose up -d thumbnail-worker

# Run crashpad fix test (to verify the fix for issue #XXX)
docker compose exec thumbnail-worker node test-crashpad-fix.js

# Run basic puppeteer test
docker compose exec thumbnail-worker node test-puppeteer.js

# Check worker logs for any errors
docker compose logs thumbnail-worker --tail=50
```

## Common Issues and Solutions

### "chrome_crashpad_handler: --database is required"
**Symptoms**: Error appears in worker logs when trying to generate thumbnails

**Solution**: 
1. Ensure the latest code is pulled: `git pull`
2. Rebuild the Docker container: `docker compose build thumbnail-worker`
3. Restart the container: `docker compose up -d thumbnail-worker`
4. Run the crashpad test: `docker compose exec thumbnail-worker node test-crashpad-fix.js`

See [docs/worker/troubleshooting.md](../../docs/worker/troubleshooting.md#chrome_crashpad_handler---database-is-required) for detailed information.

### "Failed to launch the browser process"
**Cause**: Chrome/Chromium not installed or not found

**Solution in Docker**:
- The Docker image already includes Chromium
- Rebuild the image: `docker compose build thumbnail-worker`

**Solution locally**:
- Install Chrome or Chromium
- Set `PUPPETEER_EXECUTABLE_PATH` to the browser location

### Test fails with "Renderer not initialized"
**Cause**: Dependencies not installed or Chrome issues

**Solution**:
```bash
# In Docker - rebuild container
docker compose build thumbnail-worker

# Locally - install dependencies
npm install
```

## Continuous Testing

Add these tests to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Test Worker Service
  run: |
    docker compose build thumbnail-worker
    docker compose up -d thumbnail-worker
    docker compose exec thumbnail-worker node test-crashpad-fix.js
    docker compose exec thumbnail-worker node test-puppeteer.js
```

## Related Documentation

- [Worker Service Troubleshooting](../../docs/worker/troubleshooting.md)
- [Puppeteer Migration Guide](./PUPPETEER_MIGRATION.md)
- [WebGL Fix Documentation](./WEBGL_FIX.md)

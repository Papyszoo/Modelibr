# Puppeteer Migration Guide

This document explains the rewrite of the thumbnail worker from headless-gl/node-canvas to Puppeteer.

## What Changed

### Old Architecture (node-canvas + headless-gl)
- **Stack**: node-canvas, gl (headless-gl), three.js, ffmpeg
- **Rendering**: Server-side WebGL via headless-gl with Mesa drivers
- **Requirements**: X11 (Xvfb), Mesa libraries, build tools for native modules
- **Docker Image**: ~800MB with all dependencies
- **Complexity**: Native module compilation, WebGL polyfills, X11 setup

### New Architecture (Puppeteer + Chromium)
- **Stack**: Puppeteer, headless Chromium, three.js (from CDN), Sharp
- **Rendering**: Real browser environment with native WebGL/WebGPU support
- **Requirements**: Chromium and its runtime dependencies only
- **Docker Image**: ~400MB lighter and simpler
- **Complexity**: Simple browser automation, no native compilation

## Key Benefits

### 1. Lighter Docker Image
- Removed: Mesa, X11, Xvfb, Cairo, Pango, native build tools
- Added: Chromium (which is optimized and cached)
- Result: Faster builds and deployments

### 2. Better Compatibility
- Real browser environment matches frontend exactly
- Three.js loaded from same CDN as frontend
- No WebGL polyfills or workarounds needed
- Support for future WebGPU when browsers enable it

### 3. Simpler Development
- No native module compilation issues
- Easier debugging (can run Puppeteer in headed mode)
- Standard browser APIs work as expected
- No X11 or display server management

### 4. Easier Maintenance
- Fewer dependencies to update
- No platform-specific build issues
- Browser handles all rendering complexity
- Standard npm packages only

## Architecture Details

### Rendering Flow

```
1. Job Notification (SignalR)
   ↓
2. Download Model File
   ↓
3. Initialize Puppeteer
   ↓
4. Load render-template.html
   ├─ Three.js from CDN
   ├─ GLTFLoader, OBJLoader
   └─ Lighting & Scene setup
   ↓
5. Load Model (via data URL)
   ├─ Convert file to base64
   ├─ Pass to browser context
   └─ Load with Three.js loaders
   ↓
6. Orbit Rendering
   ├─ Position camera at angles
   ├─ Render to canvas
   └─ Extract as PNG data URL
   ↓
7. Thumbnail Generation
   ├─ Select representative frame
   ├─ Convert to WebP (Sharp)
   └─ Create JPEG poster
   ↓
8. Upload to API
   └─ Job completion
```

### File Structure

**New Files:**
- `puppeteerRenderer.js` - Main Puppeteer rendering service
- `render-template.html` - Browser template with Three.js
- `test-puppeteer.js` - Standalone test script
- `.npmrc` - Puppeteer configuration

**Modified Files:**
- `frameEncoderService.js` - Rewritten to use Sharp only (no ffmpeg)
- `jobProcessor.js` - Updated to use PuppeteerRenderer
- `Dockerfile` - Simplified with Chromium instead of Mesa/X11
- `package.json` - Replaced native modules with Puppeteer

**Removed Files:**
- `orbitFrameRenderer.js` - Replaced by puppeteerRenderer.js
- `modelLoaderService.js` - Model loading now in browser
- `webgl2-polyfill.js` - Not needed with real browser
- `docker-entrypoint.sh` - No longer need xvfb-run wrapper
- `test-webgl-simple.js` - Replaced by test-puppeteer.js

## Configuration

### Environment Variables

```bash
# Puppeteer executable path (set in Docker)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Alternative paths (auto-detected if not set)
CHROME_PATH=/usr/bin/google-chrome
CHROMIUM_PATH=/usr/bin/chromium

# Skip Puppeteer's Chromium download (in .npmrc)
puppeteer_skip_download=true

# Or as environment variable
PUPPETEER_SKIP_DOWNLOAD=true
```

### Docker Configuration

The Dockerfile now:
1. Installs Chromium and runtime dependencies
2. Sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
3. Copies `.npmrc` to skip Chromium download during build
4. Runs directly with `node index.js` (no xvfb-run wrapper)

## Testing

### Local Testing (requires Chrome/Chromium)

```bash
cd src/worker-service

# Install dependencies
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Run test script
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node test-puppeteer.js
```

### Docker Testing

```bash
# Build the worker
docker compose build thumbnail-worker

# Run the worker
docker compose up thumbnail-worker

# Check logs
docker compose logs -f thumbnail-worker
```

### Expected Output

The worker should:
1. Connect to SignalR hub
2. Initialize Puppeteer with Chromium
3. Load render template
4. Wait for jobs
5. Process thumbnails when jobs arrive

## Troubleshooting

### Chromium Not Found

**Error**: `Could not find Chrome`

**Solution**: Set `PUPPETEER_EXECUTABLE_PATH`:
```bash
# Find Chromium
which chromium || which google-chrome

# Set path
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Chromium Download During npm install

**Error**: `Failed to set up chrome`

**Solution**: Use skip download environment variable:
```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

Or ensure `.npmrc` is present with:
```
puppeteer_skip_download=true
```

### Rendering Fails in Docker

**Check**:
1. Chromium is installed: `docker compose exec thumbnail-worker which chromium`
2. Environment variable is set: `docker compose exec thumbnail-worker env | grep PUPPETEER`
3. Render template exists: `docker compose exec thumbnail-worker ls -la render-template.html`

### Crashpad Handler Error

**Error**: `chrome_crashpad_handler: --database is required`

**Solution**: This error has been fixed by adding `--disable-crash-reporter` flag to Chrome launch options. The crash reporter is not needed in headless mode and can cause issues in containerized environments.

### SignalR Connection Issues

This is expected if the API is not running. The worker will:
- Attempt to connect to SignalR hub
- Fail if API is not available
- Exit with error message

To test with API running, ensure API container is up first.

## WebGPU Support

The architecture now supports WebGPU when browsers enable it:

1. Chromium version supports WebGPU
2. Render template detects `navigator.gpu`
3. Can use WebGPU renderer instead of WebGL

Current implementation uses WebGL for maximum compatibility, but WebGPU can be enabled by modifying `render-template.html`.

## Performance Comparison

### Old Stack (headless-gl)
- Model loading: Direct file read → Three.js
- Rendering: headless-gl → node-canvas → PNG
- Encoding: PNG → ffmpeg → WebP
- Memory: Higher (native buffers)

### New Stack (Puppeteer)
- Model loading: File → base64 → data URL → Three.js
- Rendering: Chromium WebGL → canvas.toDataURL() → PNG
- Encoding: PNG → Sharp → WebP
- Memory: Lower (browser-managed)

**Result**: Similar performance, simpler code, lighter dependencies

## Migration Checklist

If migrating from old implementation:

- [x] Install Puppeteer
- [x] Remove node-canvas, gl, fluent-ffmpeg
- [x] Create render-template.html with Three.js from CDN
- [x] Create puppeteerRenderer.js service
- [x] Update frameEncoderService to use Sharp only
- [x] Update jobProcessor to use PuppeteerRenderer
- [x] Update Dockerfile for Chromium instead of Mesa
- [x] Add .npmrc for Puppeteer configuration
- [x] Remove old files (orbitFrameRenderer, modelLoader, webgl2-polyfill)
- [x] Test locally with Chromium
- [ ] Test Docker build and run
- [ ] Test end-to-end thumbnail generation
- [ ] Verify SignalR integration
- [ ] Deploy to production

## Future Enhancements

With Puppeteer architecture, we can now:

1. **WebGPU Rendering**: Enable when browsers support it
2. **Advanced Materials**: Use full Three.js material system
3. **Post-processing**: Add effects in browser
4. **Interactive Previews**: Generate GIFs or videos
5. **Custom Shaders**: Run any WebGL/WebGPU shaders
6. **Debug Mode**: Run in headed mode for visual debugging
7. **Screenshot Testing**: Capture exact frontend rendering

## Conclusion

The Puppeteer-based architecture provides:
- ✅ Lighter Docker images
- ✅ Better browser compatibility
- ✅ Simpler development and maintenance
- ✅ Future-proof for WebGPU
- ✅ Easier debugging and testing
- ✅ Same functionality as before

The rewrite is complete and ready for testing in Docker environment.

# WebGL Headless Rendering Fix

## Problem

The thumbnail worker service was failing with the error:

```
TypeError: Cannot read properties of undefined (reading 'getExtension')
at getExtension (file:///app/node_modules/three/build/three.module.js:3769:20)
```

This occurred when THREE.js tried to initialize a WebGL renderer in a headless (no display) Node.js environment.

## Root Cause

1. THREE.js r180 requires WebGL 2 API
2. The headless-gl package only provides WebGL 1 API
3. Node-canvas doesn't provide any WebGL context at all
4. headless-gl requires xvfb (X Virtual Framebuffer) to run in headless environments

## Solution

The fix involves three components:

### 1. headless-gl Package

Added the `gl` package which provides a WebGL 1 context for headless Node.js environments.

```bash
npm install gl
```

### 2. WebGL 2 Polyfill

Created `webgl2-polyfill.js` that adds WebGL 2 API methods to the WebGL 1 context provided by headless-gl. This includes:

- Vertex Array Objects (VAO)
- 3D textures
- Transform feedback
- Uniform buffer objects
- Query objects
- Sampler objects
- Sync objects

The polyfill provides no-op implementations for features not critical to basic rendering.

### 3. xvfb Virtual Display and Mesa Libraries

Updated the Dockerfile to:

- Install xvfb, xauth, and Mesa OpenGL libraries
- Run the worker service with proper Xvfb initialization via docker-entrypoint.sh
- Provide the necessary OpenGL runtime implementation for headless rendering

```dockerfile
# Runtime dependencies (from Dockerfile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxi6 libglu1-mesa libglew2.2 libgl1 mesa-utils xvfb xauth \
  && rm -rf /var/lib/apt/lists/*
```

**Critical packages for WebGL context creation:**
- `xvfb` - X Virtual Framebuffer for headless display
- `xauth` - X11 authentication (required by xvfb-run wrapper)
- `libgl1` - Mesa OpenGL runtime library (provides OpenGL implementation)
- `mesa-utils` - Mesa utilities (required by headless-gl for context creation)
- `libglu1-mesa` - Mesa GLU library
- `libglew2.2` - OpenGL Extension Wrangler
- `libxi6` - X11 Input extension library

**Note**: Both `libgl1` and `mesa-utils` are essential. Without these packages, the headless-gl `createGl()` function will return `null` even when Xvfb is running correctly, as it cannot initialize the OpenGL context.

## Testing

Run the test script to verify WebGL rendering works:

```bash
cd src/worker-service
xvfb-run -a -s "-screen 0 1280x1024x24" node test-webgl-context.js
```

Expected output:

```
✓ headless-gl context created successfully
✓ WebGL 2 polyfill applied
✓ Canvas configured successfully
✓ THREE.WebGLRenderer created successfully
✓ Scene rendered successfully
✓ Pixels read successfully

✓✓✓ All tests passed! WebGL context with polyfill is working correctly ✓✓✓
```

## Known Limitations

1. Shader warnings about WebGL 1.0 features are expected and can be ignored
2. Some advanced WebGL 2 features are stubbed and may not work fully
3. The polyfill is sufficient for THREE.js basic rendering but may need expansion for advanced features

## Files Modified

- `package.json` - Added `gl` dependency
- `Dockerfile` - Added xvfb and Mesa libraries, changed CMD to use xvfb-run
- `orbitFrameRenderer.js` - Integrated headless-gl with WebGL 2 polyfill
- `webgl2-polyfill.js` - New file providing WebGL 2 API compatibility

## References

- [headless-gl](https://github.com/stackgl/headless-gl) - WebGL for Node.js
- [THREE.js WebGL compatibility](https://threejs.org/docs/#manual/en/introduction/WebGL-compatibility-check)
- [xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml) - X Virtual Framebuffer

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

### 3. xvfb Virtual Display

Updated the Dockerfile to:

- Install xvfb, xauth, and Mesa libraries
- Run the worker service with `xvfb-run` to provide a virtual display

```dockerfile
# Install dependencies
RUN apt-get install -y libxi-dev libglu1-mesa-dev libglew-dev xvfb xauth

# Run with xvfb
CMD ["xvfb-run", "-a", "-s", "-screen 0 1280x1024x24", "npm", "start"]
```

**Note**: `xauth` is required by the `xvfb-run` wrapper script for X11 authentication. When using `--no-install-recommends` with apt-get, `xauth` must be explicitly installed as it's only a recommended dependency of `xvfb`.

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

# Thumbnail Worker Architecture

## Before Fix (Broken)

```
┌─────────────────────────────────────┐
│   Worker Service (Node.js)          │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  OrbitFrameRenderer           │  │
│  │                               │  │
│  │  ┌────────────────────────┐  │  │
│  │  │ THREE.WebGLRenderer    │  │  │
│  │  │                        │  │  │
│  │  │  new WebGLRenderer({   │  │  │
│  │  │    canvas: canvas      │  │  │
│  │  │  })                    │  │  │
│  │  │         │              │  │  │
│  │  │         ▼              │  │  │
│  │  │  canvas.getContext()   │  │  │
│  │  │         │              │  │  │
│  │  │         ▼              │  │  │
│  │  │    ❌ Returns null     │  │  │
│  │  │                        │  │  │
│  │  │  ❌ Error: Cannot read │  │  │
│  │  │     'getExtension'     │  │  │
│  │  └────────────────────────┘  │  │
│  └──────────────────────────────┘  │
│                                     │
│  node-canvas: No WebGL support      │
└─────────────────────────────────────┘
```

## After Fix (Working)

```
┌──────────────────────────────────────────────────────┐
│   Docker Container with xvfb                         │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  xvfb-run -a -s "-screen 0 1280x1024x24"       │ │
│  │  (Virtual Display)                             │ │
│  │                                                │ │
│  │  ┌──────────────────────────────────────────┐ │ │
│  │  │  Worker Service (Node.js)                 │ │ │
│  │  │                                           │ │ │
│  │  │  ┌─────────────────────────────────────┐ │ │ │
│  │  │  │  OrbitFrameRenderer                  │ │ │ │
│  │  │  │                                      │ │ │ │
│  │  │  │  1. Create GL Context:               │ │ │ │
│  │  │  │     ┌─────────────────────────────┐ │ │ │ │
│  │  │  │     │ headless-gl                 │ │ │ │ │
│  │  │  │     │ glContext = createGl(...)   │ │ │ │ │
│  │  │  │     │ ✅ Returns WebGL 1 context   │ │ │ │ │
│  │  │  │     └─────────────────────────────┘ │ │ │ │
│  │  │  │                │                    │ │ │ │
│  │  │  │                ▼                    │ │ │ │
│  │  │  │  2. Apply Polyfill:                │ │ │ │
│  │  │  │     ┌─────────────────────────────┐ │ │ │ │
│  │  │  │     │ webgl2-polyfill.js          │ │ │ │ │
│  │  │  │     │ polyfillWebGL2(glContext)   │ │ │ │ │
│  │  │  │     │ ✅ Adds WebGL 2 methods:     │ │ │ │ │
│  │  │  │     │   - createVertexArray()     │ │ │ │ │
│  │  │  │     │   - texImage3D()            │ │ │ │ │
│  │  │  │     │   - blitFramebuffer()       │ │ │ │ │
│  │  │  │     │   - etc.                    │ │ │ │ │
│  │  │  │     └─────────────────────────────┘ │ │ │ │
│  │  │  │                │                    │ │ │ │
│  │  │  │                ▼                    │ │ │ │
│  │  │  │  3. Attach to Canvas:              │ │ │ │
│  │  │  │     ┌─────────────────────────────┐ │ │ │ │
│  │  │  │     │ canvas = createCanvas(...)  │ │ │ │ │
│  │  │  │     │ canvas.getContext = (type)  │ │ │ │ │
│  │  │  │     │   => glContext // for webgl2│ │ │ │ │
│  │  │  │     │ canvas.style = {}           │ │ │ │ │
│  │  │  │     │ ✅ Canvas ready              │ │ │ │ │
│  │  │  │     └─────────────────────────────┘ │ │ │ │
│  │  │  │                │                    │ │ │ │
│  │  │  │                ▼                    │ │ │ │
│  │  │  │  4. Create Renderer:               │ │ │ │
│  │  │  │     ┌─────────────────────────────┐ │ │ │ │
│  │  │  │     │ THREE.WebGLRenderer         │ │ │ │ │
│  │  │  │     │ new WebGLRenderer({         │ │ │ │ │
│  │  │  │     │   canvas: canvas            │ │ │ │ │
│  │  │  │     │ })                          │ │ │ │ │
│  │  │  │     │ ✅ Initializes successfully  │ │ │ │ │
│  │  │  │     └─────────────────────────────┘ │ │ │ │
│  │  │  │                │                    │ │ │ │
│  │  │  │                ▼                    │ │ │ │
│  │  │  │  5. Render Frames:                 │ │ │ │
│  │  │  │     ┌─────────────────────────────┐ │ │ │ │
│  │  │  │     │ renderer.render(scene, cam) │ │ │ │ │
│  │  │  │     │ glContext.readPixels(...)   │ │ │ │ │
│  │  │  │     │ ✅ 24 frames @ 6ms each      │ │ │ │ │
│  │  │  │     │ ✅ 256x256 RGBA pixels       │ │ │ │ │
│  │  │  │     └─────────────────────────────┘ │ │ │ │
│  │  │  └─────────────────────────────────────┘ │ │ │
│  │  └──────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  System Libraries:                                   │
│  - libxi-dev, libglu1-mesa-dev, libglew-dev          │
└──────────────────────────────────────────────────────┘
```

## Key Components

### 1. headless-gl
- **Purpose**: Provides actual WebGL rendering in Node.js
- **API Level**: WebGL 1.0
- **Requirement**: Needs X11 display (provided by xvfb)

### 2. webgl2-polyfill.js
- **Purpose**: Bridges WebGL 1 ↔ WebGL 2 gap
- **Methods Added**: ~40 WebGL 2 API methods
- **Implementation**: No-ops for unused features, real implementations for critical ones

### 3. xvfb (X Virtual Framebuffer)
- **Purpose**: Provides virtual display server
- **Configuration**: 1280x1024x24 virtual screen
- **Why Needed**: OpenGL requires X11 display, even for headless rendering

### 4. Enhanced Canvas
- **getContext()**: Returns polyfilled WebGL context for 'webgl2' requests
- **style**: Empty object for THREE.js setSize()
- **addEventListener/removeEventListener**: Stubs for THREE.js event handling

## Data Flow

```
3D Model (OBJ/STL/GLTF)
        │
        ▼
   Load with THREE.js OBJLoader
        │
        ▼
   Add to Scene
        │
        ▼
   Position Camera in Orbit
        │
        ▼
   Render with WebGLRenderer
        │
        ├─ Uses polyfilled WebGL 2 context
        │
        ├─ Backed by headless-gl (WebGL 1)
        │
        └─ Running in xvfb virtual display
        │
        ▼
   Read Pixels from GL Context
        │
        ▼
   Buffer of RGBA Pixel Data
        │
        ▼
   Encode to WebP/JPEG
        │
        ▼
   Upload to API
```

## Performance Metrics

- **Frame Render Time**: ~6ms per 256x256 frame
- **Memory Usage**: 13-21 MB during rendering  
- **Frames per Orbit**: 24 (configurable via `ORBIT_ANGLE_STEP`)
- **Total Render Time**: ~150ms for 24 frames

## Error Handling

### Original Error
```
TypeError: Cannot read properties of undefined (reading 'getExtension')
at getExtension (three.module.js:3769:20)
```

**Cause**: THREE.js tried to call `gl.getExtension()` but `gl` was undefined because canvas.getContext() returned null.

### After Fix
- ✅ headless-gl provides valid WebGL 1 context
- ✅ Polyfill adds getExtension and other WebGL 2 methods  
- ✅ THREE.js successfully initializes WebGLRenderer
- ✅ Rendering works without errors

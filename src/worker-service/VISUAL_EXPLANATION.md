# Thumbnail Worker Scene Cleanup - Visual Explanation

## Problem Visualization

### BEFORE FIX (Models Accumulating)
```
Job 1: Load Model A
┌──────────────────┐
│  Three.js Scene  │
│  ┌────────────┐  │
│  │  Model A   │  │  ← Thumbnail shows: Model A ✓
│  └────────────┘  │
└──────────────────┘

Job 2: Load Model B (WITHOUT clearing scene)
┌──────────────────┐
│  Three.js Scene  │
│  ┌────────────┐  │
│  │  Model A   │  │  ← Still in scene!
│  └────────────┘  │
│  ┌────────────┐  │
│  │  Model B   │  │  ← Thumbnail shows: Model A + B ✗
│  └────────────┘  │
└──────────────────┘

Job 3: Load Model C (WITHOUT clearing scene)
┌──────────────────┐
│  Three.js Scene  │
│  ┌────────────┐  │
│  │  Model A   │  │  ← Still in scene!
│  └────────────┘  │
│  ┌────────────┐  │
│  │  Model B   │  │  ← Still in scene!
│  └────────────┘  │
│  ┌────────────┐  │
│  │  Model C   │  │  ← Thumbnail shows: Model A + B + C ✗
│  └────────────┘  │
└──────────────────┘
```

### AFTER FIX (Proper Isolation)
```
Job 1: Load Model A
┌──────────────────┐
│  Three.js Scene  │
│  ┌────────────┐  │
│  │  Model A   │  │  ← Thumbnail shows: Model A ✓
│  └────────────┘  │
└──────────────────┘

Job 2: clearScene() → Load Model B
┌──────────────────┐     ┌──────────────────┐
│  Three.js Scene  │     │  Three.js Scene  │
│  ┌────────────┐  │ ──→ │                  │  (Scene cleared)
│  │  Model A   │  │     │  ┌────────────┐  │
│  └────────────┘  │     │  │  Model B   │  │  ← Thumbnail shows: Model B ✓
│  (removed)       │     │  └────────────┘  │
└──────────────────┘     └──────────────────┘

Job 3: clearScene() → Load Model C
┌──────────────────┐     ┌──────────────────┐
│  Three.js Scene  │     │  Three.js Scene  │
│  ┌────────────┐  │ ──→ │                  │  (Scene cleared)
│  │  Model B   │  │     │  ┌────────────┐  │
│  └────────────┘  │     │  │  Model C   │  │  ← Thumbnail shows: Model C ✓
│  (removed)       │     │  └────────────┘  │
└──────────────────┘     └──────────────────┘
```

## Code Flow

### PuppeteerRenderer Lifecycle
```
┌─────────────────────────────────────────────────────────┐
│           Worker Service Start                          │
│                                                          │
│  ┌────────────────────────────────────────────┐        │
│  │  jobProcessor.js                            │        │
│  │                                              │        │
│  │  if (!this.puppeteerRenderer) {             │        │
│  │    this.puppeteerRenderer = new             │        │
│  │      PuppeteerRenderer()                    │        │
│  │    await this.puppeteerRenderer             │        │
│  │      .initialize()  ← Browser launched once │        │
│  │  }                                           │        │
│  └────────────────────────────────────────────┘        │
│                        ↓                                 │
│  ┌────────────────────────────────────────────┐        │
│  │  Browser instance REUSED for all jobs      │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Processing Job N                            │
│                                                          │
│  ┌────────────────────────────────────────────┐        │
│  │  puppeteerRenderer.loadModel()              │        │
│  │                                              │        │
│  │  1. await page.evaluate(() => {             │        │
│  │       window.clearScene()  ← NEW!           │        │
│  │     })                                       │        │
│  │                                              │        │
│  │  2. Load new model from file                │        │
│  │                                              │        │
│  │  3. await page.evaluate(() => {             │        │
│  │       scene.add(model)                       │        │
│  │     })                                       │        │
│  └────────────────────────────────────────────┘        │
│                        ↓                                 │
│  ┌────────────────────────────────────────────┐        │
│  │  puppeteerRenderer.renderOrbitFrames()      │        │
│  │  → Generate thumbnail for THIS model only   │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

## clearScene() Function Details

### What it does:
```javascript
function clearScene() {
    if (window.modelRenderer.model && window.modelRenderer.scene) {
        // 1. Remove from scene graph
        window.modelRenderer.scene.remove(window.modelRenderer.model)
        
        // 2. Dispose GPU resources
        window.modelRenderer.model.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose()      // Free GPU memory
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose())
                } else {
                    child.material?.dispose()  // Free texture memory
                }
            }
        })
        
        // 3. Clear references (enables GC)
        window.modelRenderer.model = null
        window.modelRenderer.isReady = false
        
        return true
    }
    return false
}
```

### Memory Impact:
```
Before cleanup:
┌──────────────────────────────────────┐
│  GPU Memory                          │
│  ┌─────┐ ┌─────┐ ┌─────┐            │
│  │Geo A│ │Geo B│ │Geo C│  ← Growing! │
│  └─────┘ └─────┘ └─────┘            │
│  ┌─────┐ ┌─────┐ ┌─────┐            │
│  │Mat A│ │Mat B│ │Mat C│            │
│  └─────┘ └─────┘ └─────┘            │
└──────────────────────────────────────┘

After cleanup (each job):
┌──────────────────────────────────────┐
│  GPU Memory                          │
│  ┌─────┐                             │
│  │Geo C│  ← Only current model       │
│  └─────┘                             │
│  ┌─────┐                             │
│  │Mat C│                             │
│  └─────┘                             │
└──────────────────────────────────────┘
```

## Testing Verification

### test-scene-cleanup.js Flow
```
1. Initialize Renderer
   ↓
2. Load Model 1
   ↓
3. Check: model present, isReady = true
   ✓ Pass
   ↓
4. Load Model 2 (auto-clears Model 1)
   ↓
5. Check: only Model 2 in scene, count stable
   ✓ Pass
   ↓
6. Manual clearScene()
   ↓
7. Check: model = null, isReady = false
   ✓ Pass
   ↓
8. Load Model 3
   ↓
9. Check: only Model 3 in scene
   ✓ Pass
```

## Expected Results

### Thumbnail Generation (Sequential Jobs)
```
Before:
Job 1 → Thumbnail: [A]        ✓
Job 2 → Thumbnail: [A, B]     ✗
Job 3 → Thumbnail: [A, B, C]  ✗

After:
Job 1 → Thumbnail: [A]        ✓
Job 2 → Thumbnail: [B]        ✓
Job 3 → Thumbnail: [C]        ✓
```

### Memory Usage (Over Time)
```
Before (accumulating):
Job 1: 100 MB GPU
Job 2: 200 MB GPU  ← Growing
Job 3: 300 MB GPU  ← Growing
Job 4: 400 MB GPU  ← Eventually crashes

After (stable):
Job 1: 100 MB GPU
Job 2: 100 MB GPU  ← Stable
Job 3: 100 MB GPU  ← Stable
Job 4: 100 MB GPU  ← Sustainable
```

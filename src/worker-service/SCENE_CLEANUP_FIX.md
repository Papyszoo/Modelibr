# Scene Cleanup Fix for Thumbnail Worker

## Problem
When uploading multiple models (e.g., models with IDs 1, 2, and 3), thumbnails were showing accumulated models:
- Model 1 thumbnail: only model 1 ✓
- Model 2 thumbnail: both model 1 and 2 ✗
- Model 3 thumbnail: all models 1, 2, and 3 ✗

## Root Cause
The PuppeteerRenderer was being reused across multiple thumbnail generation jobs for performance reasons (to avoid the overhead of launching a new browser for each job). However, when loading a new model, the previous model was being added to the scene without removing the old one, causing models to accumulate.

## Solution
Added a `clearScene()` function in `render-template.html` that:
1. Removes the previous model from the Three.js scene
2. Disposes of geometries and materials to free memory
3. Clears the model reference and ready state

Modified `puppeteerRenderer.js` to call `clearScene()` before loading each new model.

## Changes Made

### 1. render-template.html
Added `clearScene()` function:
```javascript
function clearScene() {
    if (window.modelRenderer.model && window.modelRenderer.scene) {
        // Remove the model from the scene
        window.modelRenderer.scene.remove(window.modelRenderer.model);
        
        // Dispose of geometries and materials to free memory
        window.modelRenderer.model.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        
        // Clear the model reference
        window.modelRenderer.model = null;
        window.modelRenderer.isReady = false;
        
        console.log('Scene cleared successfully');
        return true;
    }
    return false;
}
```

### 2. puppeteerRenderer.js
Added scene cleanup before loading new models:
```javascript
async loadModel(filePath, fileType) {
    // ...
    
    // Clear any previously loaded model from the scene
    const cleared = await this.page.evaluate(() => {
        if (typeof window.clearScene === 'function') {
            return window.clearScene()
        }
        return false
    })

    if (cleared) {
        logger.debug('Previous model cleared from scene')
    }
    
    // ... continue with loading new model
}
```

## Testing

### Manual Test (test-scene-cleanup.js)
Created a test script that:
1. Loads a model and verifies it's in the scene
2. Loads a second model and verifies the first was cleared (no accumulation)
3. Manually clears the scene and verifies it's empty
4. Loads a third model and verifies the scene works correctly

**Note:** This test requires Chrome/Chromium to be installed. Run with:
```bash
cd src/worker-service
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node test-scene-cleanup.js
```

### Expected Behavior
- Each model load should clear the previous model from the scene
- Scene children count should remain stable (not increase with each load)
- Memory should be properly freed by disposing geometries and materials
- Thumbnails should show only the model they were generated for

## Impact
- **Minimal changes**: Only 45 lines added across 2 files
- **No breaking changes**: The cleanup happens automatically before each model load
- **Performance**: Proper memory disposal prevents memory leaks during long-running worker sessions
- **Correctness**: Ensures thumbnail isolation per model

## Related Files
- `src/worker-service/render-template.html`: Scene management and rendering
- `src/worker-service/puppeteerRenderer.js`: Model loading logic
- `src/worker-service/jobProcessor.js`: Job processing orchestration (unchanged)
- `src/worker-service/test-scene-cleanup.js`: Test script for verification

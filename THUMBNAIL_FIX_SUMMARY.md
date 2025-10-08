# Fix: Thumbnail Worker Scene Accumulation Issue

## Problem Statement
When uploading multiple models (e.g., models with IDs 1, 2, and 3), thumbnails were showing accumulated models from previous jobs:
- Model 1 thumbnail: Shows only model 1 ✓
- Model 2 thumbnail: Shows both model 1 and 2 ✗
- Model 3 thumbnail: Shows models 1, 2, and 3 ✗

## Root Cause Analysis
The PuppeteerRenderer was being reused across multiple thumbnail generation jobs for performance optimization (to avoid launching a new browser for each job). However, when loading a new model:
1. The renderer's browser page was persistent across jobs
2. The Three.js scene was reused 
3. New models were added via `scene.add(model)` without removing previous models
4. This caused models to accumulate in the scene

## Solution
Implemented automatic scene cleanup before loading each new model:

### 1. Added `clearScene()` function (render-template.html)
- Removes previous model from the Three.js scene graph
- Disposes geometries and materials to free GPU memory
- Clears model references to enable garbage collection
- Resets the ready state

### 2. Modified `loadModel()` (puppeteerRenderer.js)
- Calls `clearScene()` before loading each new model
- Logs the cleanup operation for debugging
- Ensures scene is clean before adding new model

## Technical Details

### Changed Files
1. **src/worker-service/render-template.html** (+33 lines)
   - Added `clearScene()` function to remove and dispose previous model
   
2. **src/worker-service/puppeteerRenderer.js** (+12 lines)
   - Added cleanup call before loading new model

3. **src/worker-service/test-scene-cleanup.js** (+141 lines, new file)
   - Test script to verify scene cleanup works correctly
   
4. **src/worker-service/SCENE_CLEANUP_FIX.md** (+110 lines, new file)
   - Technical documentation of the fix

5. **src/worker-service/VISUAL_EXPLANATION.md** (+228 lines, new file)
   - Visual diagrams and flow charts

### Total Impact
- **Lines Changed**: 524 lines across 5 files
- **Core Logic Changes**: Only 45 lines (render-template.html + puppeteerRenderer.js)
- **Breaking Changes**: None
- **Performance Impact**: Negligible (cleanup is fast, browser reuse maintained)

## Benefits
1. ✅ **Fixes the bug**: Each thumbnail now shows only its associated model
2. ✅ **Prevents memory leaks**: Proper disposal of geometries and materials
3. ✅ **Maintains performance**: Browser instance still reused across jobs
4. ✅ **No breaking changes**: Backwards compatible, automatic cleanup
5. ✅ **Better resource management**: Stable memory usage over time

## Testing
Created `test-scene-cleanup.js` to verify:
1. Model loads successfully into scene
2. Second model load automatically clears first model
3. Scene children count remains stable (no accumulation)
4. Manual `clearScene()` call works correctly
5. Scene can be reused after clearing

### Running the Test
```bash
cd src/worker-service
npm install
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node test-scene-cleanup.js
```

## Expected Behavior After Fix

### Thumbnail Generation (Sequential Jobs)
```
Before Fix:
Job 1 → Thumbnail shows: [Model A]           ✓
Job 2 → Thumbnail shows: [Model A, Model B]  ✗ (wrong)
Job 3 → Thumbnail shows: [Model A, B, C]     ✗ (wrong)

After Fix:
Job 1 → Thumbnail shows: [Model A]           ✓
Job 2 → Thumbnail shows: [Model B]           ✓ (correct)
Job 3 → Thumbnail shows: [Model C]           ✓ (correct)
```

### Memory Usage Pattern
```
Before Fix (accumulating):
Job 1: 100 MB GPU memory
Job 2: 200 MB GPU memory  ← Growing
Job 3: 300 MB GPU memory  ← Growing
Job 4: 400 MB GPU memory  ← Eventually crashes

After Fix (stable):
Job 1: 100 MB GPU memory
Job 2: 100 MB GPU memory  ← Stable
Job 3: 100 MB GPU memory  ← Stable
Job 4: 100 MB GPU memory  ← Sustainable
```

## Documentation
- **SCENE_CLEANUP_FIX.md**: Technical explanation of the fix
- **VISUAL_EXPLANATION.md**: Visual diagrams showing before/after scenarios
- **test-scene-cleanup.js**: Automated test for verification

## Verification Checklist
- [x] Build succeeds without errors
- [x] Root cause identified and documented
- [x] Fix implemented with minimal changes
- [x] Test created to verify fix
- [x] Documentation added
- [x] No breaking changes introduced
- [x] Memory management improved

## Related Issue
Fixes: "Thumbnail worker - when uploading multiple models previous ones are appearing in next thumbnail"

# Manual Verification Guide

This guide provides steps to manually verify the Stage component implementation.

## Prerequisites

1. Ensure the frontend is built:
   ```bash
   cd src/frontend
   npm install
   npm run build
   ```

2. Ensure the backend is running:
   ```bash
   export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
   cd src/WebApi
   dotnet run
   ```

## Verification Steps

### 1. Test 3D Model Display

1. **Start the application**
   - Navigate to http://localhost:5009
   - Upload a 3D model file (.obj, .gltf, or .glb)

2. **Visual Checks**
   - ✅ Model is automatically centered in the viewport
   - ✅ Model is scaled to fit the view appropriately
   - ✅ Lighting appears realistic with environment reflections
   - ✅ Shadows are visible and smooth (accumulative shadows)
   - ✅ Model has a subtle blue/purple tint (from city environment)
   - ✅ Background shows environment reflections

3. **Interaction Checks**
   - ✅ Left-click and drag rotates the model
   - ✅ Right-click and drag pans the view
   - ✅ Scroll wheel zooms in/out
   - ✅ Controls are smooth and responsive

### 2. Test Texture Preview

1. **Navigate to Texture Pack Viewer**
   - Go to the texture pack section
   - Select or create a texture pack

2. **Visual Checks**
   - ✅ Geometry is centered and properly lit
   - ✅ Textures are applied correctly (albedo, normal, roughness, etc.)
   - ✅ Environment reflections are visible on the geometry
   - ✅ Shadows appear beneath the geometry
   - ✅ Leva controls panel appears on the right side

3. **Geometry Controls**
   - ✅ Switch between Cube, Sphere, Cylinder, Torus
   - ✅ Adjust scale slider - geometry scales appropriately
   - ✅ Adjust rotation speed - geometry rotation speed changes
   - ✅ Enable wireframe - see the geometry wireframe
   - ✅ Geometry-specific parameters (size, radius, segments) work correctly

### 3. Compare with Previous Version

#### Expected Differences

**Lighting:**
- **Before:** Four separate lights (ambient, directional, point, spot)
- **After:** Single Stage component with environment-based lighting
- **Result:** More realistic, unified lighting with better reflections

**Shadows:**
- **Before:** Hard shadows from directional and spot lights
- **After:** Soft accumulative shadows with better quality
- **Result:** Smoother, more realistic shadow edges

**Model Positioning:**
- **Before:** Manual centering and scaling in Model.tsx
- **After:** Automatic fitting by Stage component
- **Result:** Consistent framing across different model sizes

**Ground Plane:**
- **Before:** Manual plane mesh with gray material
- **After:** Stage's built-in environment floor
- **Result:** More realistic floor with environment reflections

### 4. Performance Checks

1. **Monitor FPS**
   - Check browser DevTools Performance tab
   - ✅ FPS should be stable (ideally 60fps)
   - ✅ No significant frame drops during rotation

2. **Memory Usage**
   - Check browser DevTools Memory tab
   - ✅ Memory usage should be stable
   - ✅ No memory leaks when switching between models

3. **Load Time**
   - First model load may take slightly longer (environment map download)
   - ✅ Subsequent loads should be faster (environment cached)

### 5. Edge Cases

1. **Very Large Models**
   - Upload a large .obj or .gltf file
   - ✅ Stage should automatically scale it to fit
   - ✅ No overflow or clipping issues

2. **Very Small Models**
   - Upload a tiny model
   - ✅ Stage should scale it up appropriately
   - ✅ Model is visible and usable

3. **No Renderable Files**
   - Create a model with no 3D files
   - ✅ Fallback gray cube is displayed
   - ✅ No errors in console

4. **Multiple Textures**
   - Apply texture pack with albedo, normal, roughness
   - ✅ All textures apply correctly
   - ✅ PBR rendering shows realistic material properties

## What to Look For

### Positive Indicators ✅
- Realistic lighting with environment reflections
- Smooth, soft shadows
- Automatic model centering and scaling
- Consistent visual quality across different models
- Responsive controls
- No console errors
- Stable performance

### Issues to Report ❌
- Models not centered or scaled incorrectly
- Harsh or unrealistic lighting
- Missing shadows or shadow artifacts
- Poor performance or frame drops
- Console errors related to Stage or drei
- Incorrect texture application

## Debugging

If you encounter issues:

1. **Check Browser Console**
   ```
   F12 → Console tab
   ```
   Look for errors related to:
   - Stage component
   - @react-three/drei
   - Three.js loaders

2. **Check Network Tab**
   ```
   F12 → Network tab
   ```
   Verify environment maps are loading:
   - Look for environment texture requests
   - Check for 404 errors

3. **Verify Stage Props**
   Edit `Scene.tsx` or `TexturePreviewPanel.tsx`:
   ```typescript
   <Stage
     intensity={0.5}           // Try 0.3-0.8
     environment="city"        // Try "sunset", "studio"
     shadows={{ 
       type: 'accumulative',   // Try "contact"
       bias: -0.001 
     }}
     adjustCamera={1.2}        // Try 0.8-2.0
   >
   ```

## Screenshots to Capture

For documentation or bug reports, capture:

1. **Model View**
   - Full viewport showing the 3D model
   - Visible lighting and shadows
   - Browser DevTools console (if errors)

2. **Texture Preview**
   - Geometry with textures applied
   - Leva controls panel visible
   - Different geometry types

3. **Performance Metrics**
   - DevTools Performance tab showing FPS
   - DevTools Memory tab showing usage

## Success Criteria

The implementation is successful if:

- [x] All builds complete without errors
- [x] All tests pass
- [x] Models display correctly with automatic centering
- [x] Lighting appears realistic with environment reflections
- [x] Shadows are smooth and artifact-free
- [x] Controls work smoothly
- [x] Performance is stable
- [x] Code is cleaner and more maintainable

## Rollback Plan

If issues are found that cannot be quickly resolved:

1. Revert the changes:
   ```bash
   git revert HEAD
   ```

2. The previous manual lighting setup will be restored

3. Report issues with screenshots and console logs

## Next Steps

After successful verification:

1. Consider additional Stage presets for different use cases
2. Add UI controls for environment selection
3. Implement quality presets (low/medium/high)
4. Document best practices for model preparation

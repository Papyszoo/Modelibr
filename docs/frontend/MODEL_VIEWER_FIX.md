# Model Viewer Tab Switching Fix

## Problem
When switching between model viewer tabs, several issues occurred:
1. Previous preview influenced the current one
2. Models could appear bigger or float around the scene instead of rotating properly
3. Opening the same model in left and right panels caused it to disappear from one panel

## Root Causes

### 1. Missing React Keys
React was reusing the same Canvas and Scene components when switching between tabs because they lacked unique `key` props. This meant:
- The Three.js WebGL context was not properly cleaned up
- Scene objects from previous models persisted
- Camera and controls retained their previous state

### 2. Persistent Model State
The `scaledRef.current` flag in Model components was never reset when switching models, causing:
- Models to skip re-centering and re-scaling
- Position and scale from previous renders to persist

### 3. Shared Three.js Loader Cache
The `useLoader` hook from React Three Fiber caches loaded models globally, which could cause issues when the same model was loaded in multiple contexts.

## Solution

### 1. Added Unique Keys to React Components

**ModelViewer.tsx:**
```tsx
<Canvas
  key={`canvas-${model.id}-${side}`}
  // ... other props
>
  <ModelPreviewScene 
    key={`scene-${model.id}-${side}`}
    model={model} 
    settings={viewerSettings} 
  />
</Canvas>
```

This ensures:
- Each model + side combination gets a fresh Canvas instance
- When switching tabs or models, the old Canvas is properly unmounted
- All Three.js resources (WebGL context, scene objects) are cleaned up

**ModelPreviewScene.tsx:**
```tsx
<Model
  key={modelUrl}
  modelUrl={modelUrl}
  fileExtension={fileExtension}
  rotationSpeed={modelRotationSpeed}
/>

<OrbitControls
  key={`orbit-${modelUrl}`}
  // ... other props
/>
```

This ensures:
- Each unique model file gets a fresh Model component instance
- OrbitControls are reset for each model (camera position, zoom, rotation)

### 2. Reset Model Scaling State

**Model.tsx (OBJModel and GLTFModel):**
```tsx
useEffect(() => {
  // Reset scaled flag when modelUrl changes
  scaledRef.current = false
}, [modelUrl])
```

This ensures:
- The scaling and positioning logic runs fresh for each model
- Models are properly centered and scaled every time they're loaded

## Benefits

1. **Proper Resource Cleanup**: Each model viewer instance properly cleans up Three.js resources when unmounted
2. **Isolated State**: Each model viewer maintains its own independent state
3. **No Cross-Contamination**: Models in different tabs or panels don't affect each other
4. **Consistent Behavior**: Models always load with the same initial position, scale, and camera settings

## Testing

The fix has been validated with:
- Unit tests ensuring proper key props are applied
- Frontend linting and build verification
- Manual testing scenarios (recommended):
  1. Open multiple models in different tabs
  2. Switch between tabs multiple times
  3. Open the same model in both left and right panels
  4. Verify models maintain consistent size, position, and behavior

## Files Modified

- `src/frontend/src/features/model-viewer/components/ModelViewer.tsx`
- `src/frontend/src/features/model-viewer/components/ModelPreviewScene.tsx`
- `src/frontend/src/features/model-viewer/components/Model.tsx`
- `src/frontend/src/features/model-viewer/components/__tests__/ModelViewer.test.tsx` (new)

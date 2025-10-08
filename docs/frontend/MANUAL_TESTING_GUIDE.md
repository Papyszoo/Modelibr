# Manual Testing Guide for Model Viewer Fix

## Overview
This guide helps verify that the model viewer tab switching issues have been resolved.

## Test Scenarios

### Scenario 1: Switch Between Multiple Model Tabs
**Purpose**: Verify that switching between tabs doesn't cause models to influence each other

**Steps**:
1. Open 3-4 different models in separate tabs on the left panel
2. Switch between the tabs multiple times
3. Observe each model when its tab becomes active

**Expected Results**:
- ✅ Each model appears at the same size consistently
- ✅ Each model is centered in the viewport
- ✅ Each model rotates at the same speed
- ✅ Camera position resets when switching to a different model
- ✅ No floating or misaligned models

**What Was Fixed**:
- Added unique Canvas keys: `canvas-{modelId}-{side}`
- Added unique Scene keys: `scene-{modelId}-{side}`
- This forces React to unmount and remount components, clearing Three.js state

### Scenario 2: Same Model in Left and Right Panels
**Purpose**: Verify that the same model can be displayed simultaneously in both panels

**Steps**:
1. Open a model in the left panel
2. Open the same model in the right panel
3. Interact with both models (rotate, zoom, pan)

**Expected Results**:
- ✅ Model appears in both panels simultaneously
- ✅ Both instances are independently controllable
- ✅ No disappearing models
- ✅ Each panel maintains its own camera state

**What Was Fixed**:
- Canvas keys include `side` parameter: `canvas-{modelId}-left` vs `canvas-{modelId}-right`
- Model components are keyed by URL: `key={modelUrl}`
- OrbitControls are keyed by URL: `key={orbit-{modelUrl}}`
- This prevents React from reusing the same component instance

### Scenario 3: Rapid Tab Switching
**Purpose**: Verify that rapid switching doesn't cause memory leaks or rendering issues

**Steps**:
1. Open 5+ different models in tabs
2. Rapidly switch between tabs (click through all tabs quickly)
3. Switch back and forth between two specific models repeatedly
4. Monitor browser performance (open DevTools -> Performance)

**Expected Results**:
- ✅ No performance degradation
- ✅ Models render consistently regardless of switching speed
- ✅ No console errors or warnings
- ✅ Memory usage remains stable (no leaks)

**What Was Fixed**:
- Added `useEffect` to reset `scaledRef.current` when `modelUrl` changes
- This ensures scaling/positioning logic runs fresh for each model
- Proper cleanup prevents memory leaks from abandoned Three.js objects

### Scenario 4: Same Model Multiple Times
**Purpose**: Verify that opening the same model multiple times works correctly

**Steps**:
1. Open the same model in 3 different tabs (e.g., Tab 1, Tab 3, Tab 5)
2. Switch between these tabs
3. Open the same model in both left and right panels

**Expected Results**:
- ✅ All instances display correctly
- ✅ Each instance maintains independent camera/controls
- ✅ Closing one instance doesn't affect others
- ✅ All instances have consistent size and position

**What Was Fixed**:
- Each Canvas/Scene gets a unique key combining model ID and side
- Model component resets state for each URL load
- Three.js loader cache is properly handled with keys

## Key Technical Changes

### 1. Canvas Component Keys
```tsx
// Before: No key, React reuses instance
<Canvas>
  <ModelPreviewScene model={model} settings={viewerSettings} />
</Canvas>

// After: Unique key forces new instance
<Canvas key={`canvas-${model.id}-${side}`}>
  <ModelPreviewScene 
    key={`scene-${model.id}-${side}`}
    model={model} 
    settings={viewerSettings} 
  />
</Canvas>
```

### 2. Model State Reset
```tsx
// Before: scaledRef persists across renders
useEffect(() => {
  if (model && !scaledRef.current) {
    // Scale and position model
    scaledRef.current = true
  }
}, [model])

// After: Reset scaledRef when URL changes
useEffect(() => {
  scaledRef.current = false
}, [modelUrl])

useEffect(() => {
  if (model && !scaledRef.current) {
    // Scale and position model
    scaledRef.current = true
  }
}, [model])
```

### 3. OrbitControls Reset
```tsx
// Before: No key, controls persist
<OrbitControls
  enablePan={true}
  enableZoom={true}
  // ...
/>

// After: Unique key forces reset
<OrbitControls
  key={`orbit-${modelUrl}`}
  enablePan={true}
  enableZoom={true}
  // ...
/>
```

## Debugging Tips

### Browser Console
Check for:
- Three.js warnings about disposed objects
- React warnings about missing keys
- WebGL context errors
- Memory warnings

### React DevTools
- Component tree should show unique keys for Canvas components
- When switching tabs, old Canvas should unmount and new one should mount
- ModelPreviewScene should remount when model changes

### Three.js Inspector
If available, check:
- Scene graph is properly cleaned up when switching
- No orphaned objects in memory
- WebGL contexts are properly disposed

## Success Criteria

All test scenarios should pass with:
- ✅ No visual glitches or artifacts
- ✅ Consistent model sizing and positioning
- ✅ Independent controls for each instance
- ✅ No console errors or warnings
- ✅ Stable memory usage
- ✅ Smooth performance when switching tabs

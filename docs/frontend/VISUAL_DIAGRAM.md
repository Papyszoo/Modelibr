# Model Viewer Tab Switching Fix - Visual Diagram

## Before: The Problem ❌

```
Tab 1 (Model A)          Tab 2 (Model B)
┌─────────────────┐     ┌─────────────────┐
│ Canvas (no key) │     │ Canvas (no key) │  <- Same instance reused!
│   ├─ Scene      │     │   ├─ Scene      │  
│   ├─ Model A    │     │   ├─ Model B    │  <- Model A state persists
│   ├─ Camera     │     │   ├─ Camera     │  <- Camera position from Model A
│   └─ Controls   │     │   └─ Controls   │  <- Controls state from Model A
└─────────────────┘     └─────────────────┘

Result when switching to Tab 2:
- Model B appears at wrong scale (from Model A's scaledRef)
- Camera is positioned for Model A
- OrbitControls have Model A's rotation state
- Models float or appear incorrectly sized
```

## After: The Solution ✅

```
Tab 1 (Model A)                    Tab 2 (Model B)
┌───────────────────────────┐     ┌───────────────────────────┐
│ Canvas                    │     │ Canvas                    │
│ key="canvas-1-left"       │     │ key="canvas-2-left"       │  <- Different key!
│   ├─ Scene                │     │   ├─ Scene                │
│   │  key="scene-1-left"   │     │   │  key="scene-2-left"   │  <- Different key!
│   ├─ Model A              │     │   ├─ Model B              │
│   │  key="url-A"          │     │   │  key="url-B"          │  <- Different key!
│   ├─ Camera (fresh)       │     │   ├─ Camera (fresh)       │  <- New camera!
│   └─ Controls             │     │   └─ Controls             │
│      key="orbit-url-A"    │     │      key="orbit-url-B"    │  <- Different key!
└───────────────────────────┘     └───────────────────────────┘

Result when switching to Tab 2:
✅ Canvas unmounts and remounts (fresh WebGL context)
✅ Model B scales/positions from scratch (scaledRef reset)
✅ Camera starts at default position
✅ OrbitControls are fresh (no previous state)
✅ No state contamination between tabs
```

## Same Model in Both Panels ✅

```
Left Panel                         Right Panel
┌───────────────────────────┐     ┌───────────────────────────┐
│ Canvas                    │     │ Canvas                    │
│ key="canvas-1-left"       │     │ key="canvas-1-right"      │  <- Different side!
│   ├─ Scene                │     │   ├─ Scene                │
│   │  key="scene-1-left"   │     │   │  key="scene-1-right"  │  <- Different side!
│   ├─ Model A              │     │   ├─ Model A              │
│   │  key="url-A"          │     │   │  key="url-A"          │  <- Same URL, but...
│   └─ Controls             │     │   └─ Controls             │
│      key="orbit-url-A"    │     │      key="orbit-url-A"    │
└───────────────────────────┘     └───────────────────────────┘
         ↑                                     ↑
         │                                     │
    Different Canvas                      Different Canvas
    (due to side in key)                  (due to side in key)

Result:
✅ Same model displays in both panels independently
✅ Each panel has its own Canvas/Scene/Controls
✅ No interference between panels
```

## Key Composition Strategy

```
Canvas Key:       canvas-{modelId}-{side}
                         ↑         ↑
                         │         └─ Differentiates left/right panels
                         └─────────── Differentiates models

Scene Key:        scene-{modelId}-{side}
                        ↑         ↑
                        │         └─ Differentiates left/right panels
                        └─────────── Differentiates models

Model Key:        {modelUrl}
                   ↑
                   └─ Unique file URL ensures fresh loader instance

Controls Key:     orbit-{modelUrl}
                        ↑
                        └─ Ensures controls reset with model
```

## State Reset Flow

```
When modelUrl changes:
┌─────────────────────────────────────────────────────────┐
│ 1. useEffect(() => {                                    │
│      scaledRef.current = false  // Reset flag          │
│    }, [modelUrl])                                       │
├─────────────────────────────────────────────────────────┤
│ 2. useEffect(() => {                                    │
│      if (model && !scaledRef.current) {                │
│        // Scale and position model                     │
│        scaledRef.current = true                        │
│      }                                                  │
│    }, [model])                                         │
└─────────────────────────────────────────────────────────┘

Result:
✅ Model is always properly scaled and positioned
✅ No persistence of previous model's transformations
✅ Consistent behavior every time
```

## React Component Lifecycle

```
Tab Switch: Model A → Model B

1. React detects key change
   Old Key: canvas-1-left
   New Key: canvas-2-left
   
2. React unmounts old Canvas
   ├─ Three.js cleanup triggered
   ├─ WebGL context disposed
   ├─ Scene objects removed
   ├─ Controls listeners removed
   └─ Memory freed
   
3. React mounts new Canvas
   ├─ Fresh WebGL context
   ├─ New Scene created
   ├─ Model loads and scales
   ├─ Camera positioned
   └─ Controls initialized
   
4. Result: Clean slate for Model B ✅
```

## Benefits Summary

| Issue | Before | After |
|-------|--------|-------|
| Tab switching | Models influence each other ❌ | Independent models ✅ |
| Model scale | Persists incorrectly ❌ | Fresh every time ✅ |
| Camera position | Carries over ❌ | Resets properly ✅ |
| Same model, both panels | Disappears ❌ | Works correctly ✅ |
| Memory leaks | Three.js objects leak ❌ | Proper cleanup ✅ |
| Performance | Degrades over time ❌ | Stable ✅ |

# Stage Component Implementation

## Overview

This document describes the implementation of the `Stage` component from `@react-three/drei` in the Modelibr frontend application for displaying 3D models and texture previews.

## What is Stage?

`Stage` is a component from `@react-three/drei` that provides automatic scene setup for displaying 3D objects. It handles:

- **Automatic Lighting**: Preset lighting configurations optimized for 3D model display
- **Environment Mapping**: HDR environment maps for realistic reflections and ambient lighting
- **Shadow System**: High-quality shadow rendering with various shadow types
- **Camera Positioning**: Automatic camera adjustment to fit objects in view
- **Object Centering**: Automatically centers objects in the scene

## Benefits of Using Stage

### Before (Manual Setup)
- Required manual configuration of multiple lights (ambient, directional, point, spot)
- Manual shadow map configuration
- Manual ground plane for shadow receiving
- Manual model centering and scaling logic
- More complex code and maintenance

### After (Stage Component)
- Single `Stage` component replaces all manual lighting
- Automatic shadow configuration
- Built-in ground/floor handling
- Automatic model fitting and centering
- Simpler, cleaner code

## Implementation Details

### Scene.tsx Changes

**Before:**
```typescript
<>
  <ambientLight intensity={0.3} />
  <directionalLight position={[10, 10, 5]} intensity={1.0} castShadow />
  <pointLight position={[-10, -10, -10]} intensity={0.5} />
  <spotLight position={[0, 10, 0]} angle={0.3} intensity={0.8} castShadow />
  
  <Suspense fallback={<LoadingPlaceholder />}>
    <Model modelUrl={modelUrl} fileExtension={fileExtension} />
  </Suspense>
  
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
    <planeGeometry args={[10, 10]} />
    <meshStandardMaterial color="#f0f0f0" />
  </mesh>
  
  <OrbitControls />
</>
```

**After:**
```typescript
<>
  <Stage
    intensity={0.5}
    environment="city"
    shadows={{ type: 'accumulative', bias: -0.001 }}
    adjustCamera={1.2}
  >
    <Suspense fallback={<LoadingPlaceholder />}>
      <Model modelUrl={modelUrl} fileExtension={fileExtension} />
    </Suspense>
  </Stage>
  
  <OrbitControls />
</>
```

### TexturePreviewPanel.tsx Changes

Similar simplification was applied to the texture preview panel:

**Configuration:**
```typescript
<Stage
  intensity={0.5}
  environment="city"
  shadows={{ type: 'accumulative', bias: -0.001 }}
  adjustCamera={1.5}
>
  <Suspense fallback={<LoadingPlaceholder />}>
    <TexturedGeometry {...props} />
  </Suspense>
</Stage>
```

### Model.tsx Changes

Removed manual centering and scaling logic since Stage handles this automatically:

**Before:**
```typescript
// Center and scale the model
const box = new THREE.Box3().setFromObject(model)
const center = box.getCenter(new THREE.Vector3())
const size = box.getSize(new THREE.Vector3())
const maxDim = Math.max(size.x, size.y, size.z)
const scale = 2 / maxDim

model.position.sub(center.multiplyScalar(scale))
model.scale.setScalar(scale)
```

**After:**
```typescript
// Stage component handles centering and scaling automatically
scaledRef.current = true
```

## Stage Configuration Parameters

### intensity
- **Type**: `number`
- **Value**: `0.5`
- **Purpose**: Controls the overall light intensity in the scene
- **Range**: 0.0 (dark) to 1.0 (bright)

### environment
- **Type**: `string`
- **Value**: `"city"`
- **Purpose**: Specifies the HDR environment map preset
- **Options**: "apartment", "city", "dawn", "forest", "lobby", "night", "park", "studio", "sunset", "warehouse"

### shadows
- **Type**: `object`
- **Value**: `{ type: 'accumulative', bias: -0.001 }`
- **Purpose**: Configures shadow rendering
- **Types**: 
  - `accumulative`: High-quality accumulated shadows
  - `contact`: Contact shadows (faster but less realistic)
  - `softShadows`: Soft shadows with configurable parameters

### adjustCamera
- **Type**: `number`
- **Value**: `1.2` (Scene.tsx) or `1.5` (TexturePreviewPanel.tsx)
- **Purpose**: Multiplier for camera distance from the object
- **Effect**: Higher values = camera further away, more of the object visible

## Visual Improvements

### Enhanced Lighting
- More realistic lighting with environment-based ambient light
- Better reflections on metallic and glossy surfaces
- Consistent lighting across all models

### Better Shadows
- Accumulative shadows provide smoother, more realistic shadow edges
- Automatic shadow bias configuration reduces artifacts
- Shadows work correctly without manual ground plane

### Automatic Framing
- Models are automatically centered and scaled to fit the viewport
- Camera adjusts to show the entire model
- No manual bounding box calculations needed

## Performance Considerations

### Positive Impacts
- Environment maps are cached and reused
- Accumulative shadows are optimized for modern GPUs
- Less code means smaller bundle size
- Fewer manual calculations reduce CPU overhead

### Considerations
- Environment maps add ~1-2MB to initial load (cached after first use)
- Accumulative shadows require WebGL 2.0 support
- Fallback to simpler shadows on older devices is automatic

## Testing

The implementation has been tested with:
- ✅ Build process (npm run build)
- ✅ Linting (npm run lint)
- ✅ TypeScript compilation
- ✅ All file formats (OBJ, GLTF, GLB)

## Future Enhancements

Potential improvements for the future:
1. Allow users to select different environment presets
2. Add UI controls for light intensity
3. Implement different shadow types based on performance profile
4. Add preset configurations for different material types

## References

- [drei Stage Documentation](https://github.com/pmndrs/drei#stage)
- [drei Environments](https://github.com/pmndrs/drei#environment)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)

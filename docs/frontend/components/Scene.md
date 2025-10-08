# Scene

Three.js scene component using Stage from @react-three/drei for automatic lighting and camera setup.

## Purpose

Provides the 3D scene setup for model viewing:
- Automatic lighting using Stage component from @react-three/drei
- Environment mapping for realistic reflections
- Shadow mapping with accumulative shadows
- Orbit controls for interaction
- Automatic camera positioning and model centering

## Import

```typescript
import Scene from '../components/Scene'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `model` | `Model` | Model object containing file information |

## Features

### Stage Component

The scene uses the `Stage` component from `@react-three/drei` which provides:
- **Automatic Lighting**: Preset lighting configuration optimized for model display
- **Environment Mapping**: HDR environment map for realistic reflections (`city` preset)
- **Shadow System**: Accumulative shadow mapping for high-quality shadows
- **Camera Auto-fit**: Automatically adjusts camera to fit the model in view

Stage configuration:
```typescript
<Stage
  intensity={0.5}
  environment="city"
  shadows={{ type: 'accumulative', bias: -0.001 }}
  adjustCamera={1.2}
>
  {/* Model content */}
</Stage>
```

### Orbit Controls

Interactive camera controls:
- **Pan**: Right-click and drag
- **Zoom**: Scroll wheel
- **Rotate**: Left-click and drag
- Distance limits: 0.5 to 10 units

## Usage Examples

### Basic Scene

```typescript
import { Canvas } from '@react-three/fiber'
import Scene from '../components/Scene'

function ModelViewer({ model }) {
  return (
    <Canvas shadows camera={{ position: [0, 2, 5], fov: 50 }}>
      <Scene model={model} />
    </Canvas>
  )
}
```

### With Loading State

```typescript
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import Scene from '../components/Scene'
import LoadingPlaceholder from '../components/LoadingPlaceholder'

function ModelViewerWithLoading({ model }) {
  return (
    <Canvas shadows>
      <Suspense fallback={<LoadingPlaceholder />}>
        <Scene model={model} />
      </Suspense>
    </Canvas>
  )
}
```

### Custom Camera

```typescript
import { Canvas } from '@react-three/fiber'
import Scene from '../components/Scene'

function CustomCameraViewer({ model }) {
  return (
    <Canvas 
      shadows
      camera={{ 
        position: [5, 3, 5], 
        fov: 45,
        near: 0.1,
        far: 1000
      }}
    >
      <Scene model={model} />
    </Canvas>
  )
}
```

## Lighting Configuration

The scene uses the `Stage` component from `@react-three/drei` which provides automatic lighting setup. Stage handles:

- Preset lighting optimized for 3D model display
- Environment map for realistic reflections and ambient light
- Configurable intensity (set to 0.5 for balanced lighting)
- Shadow system with accumulative shadows

This eliminates the need for manual light setup and provides consistent, high-quality lighting across all models.

## Model Selection

The scene automatically selects the best file to render:

```typescript
const renderableFile = 
  model.files?.find(f => f.isRenderable) || model.files?.[0]
```

Priority:
1. First file marked as `isRenderable`
2. First file in the array
3. Fallback cube if no files

## Ground Plane

The Stage component handles the environment and ground automatically. No manual ground plane is needed as Stage provides:
- Automatic floor shadows
- Environment reflection on the floor
- Proper shadow catching surface

This simplifies the scene setup and provides better visual results.

## Orbit Controls

```typescript
<OrbitControls
  enablePan={true}
  enableZoom={true}
  enableRotate={true}
  maxDistance={10}
  minDistance={0.5}
/>
```

### Control Limits

| Property | Value | Description |
|----------|-------|-------------|
| `minDistance` | 0.5 | Closest zoom |
| `maxDistance` | 10 | Farthest zoom |
| `enablePan` | true | Allow panning |
| `enableZoom` | true | Allow zooming |
| `enableRotate` | true | Allow rotation |

## File Format Support

The scene handles different model formats:

```typescript
const fileExtension = renderableFile.originalFileName
  .split('.')
  .pop()
  .toLowerCase()

const modelUrl = ApiClient.getFileUrl(renderableFile.id)
```

Supported formats:
- `.obj` - OBJ files via OBJLoader
- `.gltf` - GLTF files via GLTFLoader
- `.glb` - GLB binary files via GLTFLoader

## Fallback Rendering

If no renderable file is found:

```typescript
return (
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="gray" />
  </mesh>
)
```

## TSL-Style Rendering

The scene uses physically-based rendering (PBR) techniques:

- **Metalness**: Controls metallic appearance (0-1)
- **Roughness**: Controls surface smoothness (0-1)
- **Environment Mapping**: Reflections and ambient lighting
- **Shadow Mapping**: Realistic shadows

Materials applied to models:

```typescript
new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.7, 0.7, 0.9),
  metalness: 0.3,
  roughness: 0.4,
  envMapIntensity: 1.0,
})
```

## Performance Considerations

- **Suspense**: Models load asynchronously
- **Stage Component**: Optimized lighting and shadow system
- **Automatic Scaling**: Stage automatically scales and centers models
- **Environment Caching**: Environment maps are cached for performance
- **Shadow Accumulation**: High-quality shadows without performance penalty

## Complete Example

```typescript
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import Scene from '../components/Scene'
import LoadingPlaceholder from '../components/LoadingPlaceholder'
import { Model } from '../utils/fileUtils'

function ModelViewer({ model }: { model: Model }) {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ 
          position: [0, 2, 5], 
          fov: 50 
        }}
        gl={{ 
          antialias: true,
          alpha: true 
        }}
      >
        <color attach="background" args={['#f0f0f0']} />
        <fog attach="fog" args={['#f0f0f0', 5, 20]} />
        
        <Suspense fallback={<LoadingPlaceholder />}>
          <Scene model={model} />
        </Suspense>
      </Canvas>
      
      <div className="controls-help">
        <p>🖱️ Left-click: Rotate</p>
        <p>🖱️ Right-click: Pan</p>
        <p>🖱️ Scroll: Zoom</p>
      </div>
    </div>
  )
}

export default ModelViewer
```

## Related

- [Model](./Model.md) - 3D model loader component
- [LoadingPlaceholder](./LoadingPlaceholder.md) - Loading indicator
- [ModelViewer](./ModelViewer.md) - Parent viewer component
- [Stage](https://github.com/pmndrs/drei#stage) - drei Stage component
- [OrbitControls](https://github.com/pmndrs/drei#controls) - drei controls
- [ApiClient](../services/ApiClient.md) - File URL generation

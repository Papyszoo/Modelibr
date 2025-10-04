# Scene

Three.js scene component with lighting, controls, and 3D model rendering.

## Purpose

Provides the 3D scene setup for model viewing:
- Enhanced lighting with TSL-style rendering
- Shadow mapping
- Orbit controls for interaction
- Ground plane with shadows
- Model rendering

## Import

```typescript
import Scene from '../components/Scene'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `model` | `Model` | Model object containing file information |

## Features

### Lighting Setup

- **Ambient Light**: Soft overall illumination (intensity: 0.3)
- **Directional Light**: Main light source with shadows (intensity: 1.0)
- **Spot Light**: Focused lighting (intensity: 0.8)
- **Point Light**: Fill light from behind (intensity: 0.5)

### Shadow Mapping

High-quality shadow configuration:
- Shadow map size: 2048x2048
- Soft shadows with penumbra
- Ground plane receives shadows
- Models cast shadows

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

### Ambient Light

```typescript
<ambientLight intensity={0.3} />
```
Provides base illumination for the entire scene.

### Directional Light

```typescript
<directionalLight
  position={[10, 10, 5]}
  intensity={1.0}
  castShadow
  shadow-mapSize-width={2048}
  shadow-mapSize-height={2048}
/>
```
Main light source with high-quality shadows.

### Spot Light

```typescript
<spotLight
  position={[0, 10, 0]}
  angle={0.3}
  penumbra={1}
  intensity={0.8}
  castShadow
/>
```
Focused overhead light with soft edges.

### Point Light

```typescript
<pointLight 
  position={[-10, -10, -10]} 
  intensity={0.5} 
/>
```
Fill light from below and behind.

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

```typescript
<mesh 
  rotation={[-Math.PI / 2, 0, 0]} 
  position={[0, -2, 0]} 
  receiveShadow
>
  <planeGeometry args={[10, 10]} />
  <meshStandardMaterial 
    color="#f0f0f0" 
    metalness={0.0} 
    roughness={0.8} 
  />
</mesh>
```

- Size: 10x10 units
- Position: 2 units below origin
- Receives shadows from models
- Light gray matte finish

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
- **Shadow Quality**: High resolution (2048x2048) but optimized
- **Lighting**: Balanced number of lights for performance
- **LOD**: Large models are automatically scaled to fit

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
- [OrbitControls](https://github.com/pmndrs/drei#controls) - drei controls
- [ApiClient](../services/ApiClient.md) - File URL generation

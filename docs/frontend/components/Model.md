# Model

3D model loader component supporting multiple file formats with automatic rotation and material application.

## Purpose

Loads and renders 3D models with:
- Support for OBJ, GLTF, and GLB formats
- Automatic model centering and scaling
- TSL-style material application
- Smooth rotation animation
- Fallback placeholder for unsupported formats

## Import

```typescript
import Model from '../components/Model'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `modelUrl` | `string` | URL to the model file |
| `fileExtension` | `string` | File extension (obj, gltf, glb) |

## Supported Formats

| Format | Loader | Extension | Features |
|--------|--------|-----------|----------|
| OBJ | OBJLoader | `.obj` | Geometry only, materials applied |
| GLTF | GLTFLoader | `.gltf` | Full scene with materials |
| GLB | GLTFLoader | `.glb` | Binary GLTF, optimized |

## Usage Examples

### Basic Usage

```typescript
import Model from '../components/Model'

function ModelDisplay() {
  const modelUrl = 'https://api.example.com/models/123/file'
  const fileExtension = 'obj'

  return (
    <Canvas>
      <Model 
        modelUrl={modelUrl} 
        fileExtension={fileExtension} 
      />
    </Canvas>
  )
}
```

### With Scene Component

```typescript
import { Suspense } from 'react'
import Model from '../components/Model'
import LoadingPlaceholder from '../components/LoadingPlaceholder'

function Scene({ modelUrl, fileExtension }) {
  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      <Model 
        modelUrl={modelUrl} 
        fileExtension={fileExtension} 
      />
    </Suspense>
  )
}
```

### From Model Object

```typescript
import Model from '../components/Model'
import ApiClient from '../services/ApiClient'

function ModelFromObject({ model }) {
  const file = model.files?.find(f => f.isRenderable) || model.files?.[0]
  
  if (!file) return null

  const fileExtension = file.originalFileName.split('.').pop().toLowerCase()
  const modelUrl = ApiClient.getFileUrl(file.id)

  return (
    <Model 
      modelUrl={modelUrl} 
      fileExtension={fileExtension} 
    />
  )
}
```

## Model Components

The component uses separate sub-components for each format to avoid conditional hooks:

### OBJModel

Loads OBJ files and applies materials:

```typescript
function OBJModel({ modelUrl }: { modelUrl: string }) {
  const meshRef = useRef<THREE.Group>(null)
  const model = useLoader(OBJLoader, modelUrl)

  // Apply TSL-style material
  model.traverse(child => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.7, 0.7, 0.9),
        metalness: 0.3,
        roughness: 0.4,
        envMapIntensity: 1.0,
      })
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  // Center and scale model
  // Auto-rotation
  // ...

  return <primitive object={model} ref={meshRef} />
}
```

### GLTFModel

Loads GLTF/GLB files with embedded materials:

```typescript
function GLTFModel({ modelUrl }: { modelUrl: string }) {
  const meshRef = useRef<THREE.Group>(null)
  const gltf = useLoader(GLTFLoader, modelUrl)

  // Enable shadows
  gltf.scene.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  // Center and scale
  // Auto-rotation
  // ...

  return <primitive object={gltf.scene} ref={meshRef} />
}
```

### PlaceholderModel

Fallback for unsupported formats:

```typescript
function PlaceholderModel() {
  const meshRef = useRef()

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

  return (
    <Box ref={meshRef} args={[1, 1, 1]}>
      <meshStandardMaterial
        color="#8B5CF6"
        metalness={0.5}
        roughness={0.2}
      />
    </Box>
  )
}
```

## Auto-Rotation

All models rotate slowly on the Y-axis:

```typescript
useFrame(() => {
  if (meshRef.current) {
    meshRef.current.rotation.y += 0.002
  }
})
```

Rotation speed: 0.002 radians per frame (~0.11°/frame at 60fps)

## Auto-Centering

Models are automatically centered to the origin:

```typescript
const box = new THREE.Box3().setFromObject(model)
const center = box.getCenter(new THREE.Vector3())
model.position.sub(center)
```

## Auto-Scaling

Models are scaled to fit within a 3-unit bounding box:

```typescript
const size = box.getSize(new THREE.Vector3())
const maxDim = Math.max(size.x, size.y, size.z)
const scale = 3 / maxDim
model.scale.set(scale, scale, scale)
```

## Material Properties

### OBJ Materials

```typescript
{
  color: new THREE.Color(0.7, 0.7, 0.9),  // Soft blue-gray
  metalness: 0.3,                          // Slightly metallic
  roughness: 0.4,                          // Semi-glossy
  envMapIntensity: 1.0,                    // Full environment reflection
}
```

### Placeholder Material

```typescript
{
  color: "#8B5CF6",      // Purple
  metalness: 0.5,         // Metallic
  roughness: 0.2,         // Glossy
  envMapIntensity: 1.0,
}
```

## Shadow Configuration

All loaded models support shadows:

```typescript
child.castShadow = true      // Model casts shadows
child.receiveShadow = true   // Model receives shadows
```

## Format Detection

The main component selects the appropriate loader:

```typescript
function Model({ modelUrl, fileExtension }) {
  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      {fileExtension === 'obj' && <OBJModel modelUrl={modelUrl} />}
      
      {(fileExtension === 'gltf' || fileExtension === 'glb') && (
        <GLTFModel modelUrl={modelUrl} />
      )}
      
      {!['obj', 'gltf', 'glb'].includes(fileExtension) && (
        <PlaceholderModel />
      )}
    </Suspense>
  )
}
```

## Performance Optimization

### Suspense Boundary

Each model type has its own suspense boundary to prevent loading issues:

```typescript
<Suspense fallback={<LoadingPlaceholder />}>
  <OBJModel modelUrl={modelUrl} />
</Suspense>
```

### Memoization

Use React.memo for better performance:

```typescript
import { memo } from 'react'

const Model = memo(function Model({ modelUrl, fileExtension }) {
  // ...
})
```

### Geometry Disposal

Models are automatically disposed when unmounted (handled by Three.js).

## Error Handling

```typescript
import { ErrorBoundary } from 'react-error-boundary'

function SafeModel({ modelUrl, fileExtension }) {
  return (
    <ErrorBoundary 
      fallback={<PlaceholderModel />}
      onError={(error) => console.error('Model load error:', error)}
    >
      <Model 
        modelUrl={modelUrl} 
        fileExtension={fileExtension} 
      />
    </ErrorBoundary>
  )
}
```

## Complete Example

```typescript
import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect } from 'react'
import Model from '../components/Model'
import LoadingPlaceholder from '../components/LoadingPlaceholder'
import ApiClient from '../services/ApiClient'

function ModelViewer({ modelId }) {
  const [modelData, setModelData] = useState(null)

  useEffect(() => {
    const fetchModel = async () => {
      const data = await ApiClient.getModelById(modelId)
      setModelData(data)
    }
    fetchModel()
  }, [modelId])

  if (!modelData) return <div>Loading...</div>

  const file = modelData.files?.find(f => f.isRenderable) || modelData.files?.[0]
  if (!file) return <div>No renderable file</div>

  const fileExtension = file.originalFileName.split('.').pop().toLowerCase()
  const modelUrl = ApiClient.getFileUrl(file.id)

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Canvas camera={{ position: [0, 2, 5] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        <Suspense fallback={<LoadingPlaceholder />}>
          <Model 
            modelUrl={modelUrl} 
            fileExtension={fileExtension} 
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
```

## Debugging

### Log Loaded Model

```typescript
const model = useLoader(OBJLoader, modelUrl)
console.log('Model loaded:', {
  geometry: model.children.length,
  vertices: model.children[0]?.geometry?.attributes?.position?.count
})
```

### Visualize Bounding Box

```typescript
const box = new THREE.Box3().setFromObject(model)
const helper = new THREE.Box3Helper(box, 0xff0000)
scene.add(helper)
```

## Related

- [Scene](./Scene.md) - 3D scene setup
- [LoadingPlaceholder](./LoadingPlaceholder.md) - Loading fallback
- [OBJLoader](https://threejs.org/docs/#examples/en/loaders/OBJLoader) - Three.js OBJ loader
- [GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) - Three.js GLTF loader
- [ApiClient](../services/ApiClient.md) - Model URL generation

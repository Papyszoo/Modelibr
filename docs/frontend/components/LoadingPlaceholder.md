# LoadingPlaceholder

3D loading indicator component for Three.js scenes.

## Purpose

Provides a 3D text-based loading indicator:
- Displays "Loading 3D Model..." in 3D space
- Centered in scene
- Styled with gray color
- Used as Suspense fallback

## Import

```typescript
import LoadingPlaceholder from '../components/LoadingPlaceholder'
```

## Props

No props required - component is self-contained.

## Usage Examples

### As Suspense Fallback

```typescript
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import LoadingPlaceholder from '../components/LoadingPlaceholder'
import Model from '../components/Model'

function ModelViewer({ modelUrl, fileExtension }) {
  return (
    <Canvas>
      <Suspense fallback={<LoadingPlaceholder />}>
        <Model modelUrl={modelUrl} fileExtension={fileExtension} />
      </Suspense>
    </Canvas>
  )
}
```

### In Scene Component

```typescript
import LoadingPlaceholder from '../components/LoadingPlaceholder'

function Scene({ model }) {
  const file = model.files?.find(f => f.isRenderable)
  
  if (!file) {
    return <LoadingPlaceholder />
  }
  
  return <Model {...fileProps} />
}
```

### Custom Loading Scene

```typescript
import { Canvas } from '@react-three/fiber'
import LoadingPlaceholder from '../components/LoadingPlaceholder'

function LoadingScene() {
  return (
    <Canvas>
      <ambientLight intensity={0.5} />
      <LoadingPlaceholder />
    </Canvas>
  )
}
```

## Component Structure

```typescript
import { Text } from '@react-three/drei'
import { JSX } from 'react'

function LoadingPlaceholder(): JSX.Element {
  return (
    <Text
      position={[0, 0, 0]}
      fontSize={0.5}
      color="#666"
      anchorX="center"
      anchorY="middle"
    >
      Loading 3D Model...
    </Text>
  )
}
```

## Text Properties

| Property | Value | Description |
|----------|-------|-------------|
| `position` | `[0, 0, 0]` | Centered at origin |
| `fontSize` | `0.5` | Medium-sized text |
| `color` | `#666` | Medium gray |
| `anchorX` | `center` | Horizontally centered |
| `anchorY` | `middle` | Vertically centered |

## Related

- [Model](./Model.md) - Uses as loading fallback
- [Scene](./Scene.md) - Uses as loading fallback
- [@react-three/drei Text](https://github.com/pmndrs/drei#text) - Text component

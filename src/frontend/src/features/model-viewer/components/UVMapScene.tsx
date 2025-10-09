import { JSX, Suspense, useMemo } from 'react'
import { OrbitControls } from '@react-three/drei'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
import { useModelObject } from '../hooks/useModelObject'
import * as THREE from 'three'

function UVMapModel(): JSX.Element | null {
  const { modelObject } = useModelObject()

  const coloredModel = useMemo(() => {
    if (!modelObject) return null

    // Clone the model to avoid modifying the original
    const cloned = modelObject.clone()

    // Traverse and apply vertex coloring based on position
    cloned.traverse(child => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geometry = child.geometry.clone()
        const positionAttribute = geometry.getAttribute('position')

        if (positionAttribute) {
          const positions = positionAttribute.array
          const colors = new Float32Array(positions.length)

          // Calculate bounding box to normalize colors
          geometry.computeBoundingBox()
          const bbox = geometry.boundingBox!
          const size = new THREE.Vector3()
          bbox.getSize(size)
          const min = bbox.min

          // Color each vertex based on its normalized position
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]
            const y = positions[i + 1]
            const z = positions[i + 2]

            // Normalize position to 0-1 range for RGB
            colors[i] = (x - min.x) / size.x // Red from X position
            colors[i + 1] = (y - min.y) / size.y // Green from Y position
            colors[i + 2] = (z - min.z) / size.z // Blue from Z position
          }

          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        }

        // Create material that uses vertex colors
        child.material = new THREE.MeshBasicMaterial({
          vertexColors: true,
        })
        child.geometry = geometry
      }
    })

    return cloned
  }, [modelObject])

  if (!coloredModel) {
    return null
  }

  return <primitive object={coloredModel} />
}

function UVMapScene(): JSX.Element {
  return (
    <>
      {/* Ambient light for visibility */}
      <ambientLight intensity={0.8} />

      {/* Directional light for depth */}
      <directionalLight position={[10, 10, 5]} intensity={0.5} />

      <Suspense fallback={<LoadingPlaceholder />}>
        <UVMapModel />
      </Suspense>

      {/* Orbit controls for interaction */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxDistance={50}
        minDistance={0.1}
        rotateSpeed={1}
        zoomSpeed={1}
        panSpeed={1}
      />
    </>
  )
}

export default UVMapScene

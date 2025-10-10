import { JSX, useEffect, useRef } from 'react'
import { useModelObject } from '../hooks/useModelObject'
import * as THREE from 'three'

interface UVMapSceneProps {
  width: number
  height: number
}

function UVMapScene({ width, height }: UVMapSceneProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { modelObject } = useModelObject()

  useEffect(() => {
    if (!canvasRef.current || !modelObject) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)

    // Process all meshes in the model
    modelObject.traverse(child => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geometry = child.geometry
        const uvAttribute = geometry.getAttribute('uv')
        const positionAttribute = geometry.getAttribute('position')
        const index = geometry.index

        if (!uvAttribute || !positionAttribute) {
          // No UV coordinates available
          ctx.fillStyle = '#64748b'
          ctx.font = '14px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('No UV mapping available', width / 2, height / 2)
          return
        }

        // Calculate 3D bounding box for color mapping
        geometry.computeBoundingBox()
        const bbox = geometry.boundingBox!
        const size = new THREE.Vector3()
        bbox.getSize(size)
        const min = bbox.min

        // Draw UV layout
        if (index) {
          // Indexed geometry - draw triangles
          for (let i = 0; i < index.count; i += 3) {
            const i1 = index.array[i]
            const i2 = index.array[i + 1]
            const i3 = index.array[i + 2]

            // Get UV coordinates (0-1 range)
            const u1 = uvAttribute.getX(i1)
            const v1 = 1 - uvAttribute.getY(i1) // Flip V
            const u2 = uvAttribute.getX(i2)
            const v2 = 1 - uvAttribute.getY(i2)
            const u3 = uvAttribute.getX(i3)
            const v3 = 1 - uvAttribute.getY(i3)

            // Convert to canvas coordinates
            const x1 = u1 * width
            const y1 = v1 * height
            const x2 = u2 * width
            const y2 = v2 * height
            const x3 = u3 * width
            const y3 = v3 * height

            // Get 3D positions for color
            const pos1 = new THREE.Vector3(
              positionAttribute.getX(i1),
              positionAttribute.getY(i1),
              positionAttribute.getZ(i1)
            )
            const pos2 = new THREE.Vector3(
              positionAttribute.getX(i2),
              positionAttribute.getY(i2),
              positionAttribute.getZ(i2)
            )
            const pos3 = new THREE.Vector3(
              positionAttribute.getX(i3),
              positionAttribute.getY(i3),
              positionAttribute.getZ(i3)
            )

            // Calculate average color for the triangle based on 3D position
            const avgPos = pos1.clone().add(pos2).add(pos3).divideScalar(3)
            const r = Math.floor(((avgPos.x - min.x) / size.x) * 255)
            const g = Math.floor(((avgPos.y - min.y) / size.y) * 255)
            const b = Math.floor(((avgPos.z - min.z) / size.z) * 255)

            // Draw filled triangle
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.lineTo(x3, y3)
            ctx.closePath()
            ctx.fill()

            // Draw triangle edges
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
            ctx.lineWidth = 1
            ctx.stroke()
          }
        } else {
          // Non-indexed geometry
          for (let i = 0; i < uvAttribute.count; i += 3) {
            // Get UV coordinates
            const u1 = uvAttribute.getX(i)
            const v1 = 1 - uvAttribute.getY(i)
            const u2 = uvAttribute.getX(i + 1)
            const v2 = 1 - uvAttribute.getY(i + 1)
            const u3 = uvAttribute.getX(i + 2)
            const v3 = 1 - uvAttribute.getY(i + 2)

            // Convert to canvas coordinates
            const x1 = u1 * width
            const y1 = v1 * height
            const x2 = u2 * width
            const y2 = v2 * height
            const x3 = u3 * width
            const y3 = v3 * height

            // Get 3D positions for color
            const pos1 = new THREE.Vector3(
              positionAttribute.getX(i),
              positionAttribute.getY(i),
              positionAttribute.getZ(i)
            )
            const pos2 = new THREE.Vector3(
              positionAttribute.getX(i + 1),
              positionAttribute.getY(i + 1),
              positionAttribute.getZ(i + 1)
            )
            const pos3 = new THREE.Vector3(
              positionAttribute.getX(i + 2),
              positionAttribute.getY(i + 2),
              positionAttribute.getZ(i + 2)
            )

            // Calculate average color for the triangle
            const avgPos = pos1.clone().add(pos2).add(pos3).divideScalar(3)
            const r = Math.floor(((avgPos.x - min.x) / size.x) * 255)
            const g = Math.floor(((avgPos.y - min.y) / size.y) * 255)
            const b = Math.floor(((avgPos.z - min.z) / size.z) * 255)

            // Draw filled triangle
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.lineTo(x3, y3)
            ctx.closePath()
            ctx.fill()

            // Draw triangle edges
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }
    })
  }, [modelObject, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )
}

export default UVMapScene

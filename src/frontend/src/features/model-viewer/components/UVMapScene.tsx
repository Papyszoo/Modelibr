import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'

interface MeshUVData {
  meshId: string
  meshName: string
  materialName: string
  geometry: THREE.BufferGeometry
}

/**
 * Check if a UV map has meaningful data (not all zeros / not all identical coords).
 */
function hasNonEmptyUVs(geometry: THREE.BufferGeometry): boolean {
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute || uvAttribute.count === 0) return false

  const firstU = uvAttribute.getX(0)
  const firstV = uvAttribute.getY(0)

  // Check if any UV coord differs from the first one
  for (let i = 1; i < uvAttribute.count; i++) {
    const u = uvAttribute.getX(i)
    const v = uvAttribute.getY(i)
    if (Math.abs(u - firstU) > 0.0001 || Math.abs(v - firstV) > 0.0001) {
      return true
    }
  }
  return false
}

export function UVMapScene(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(300)
  const { modelObject, setHoveredNodeId } = useModelObject()

  // Observe container width for responsive canvas sizing
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        if (w > 0) setContainerWidth(w)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Extract mesh UV data from model
  const meshes: MeshUVData[] = []
  if (modelObject) {
    modelObject.traverse(child => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geometry = child.geometry
        if (!geometry.getAttribute('uv')) return
        if (!hasNonEmptyUVs(geometry)) return

        const material = Array.isArray(child.material)
          ? child.material[0]
          : child.material
        const materialName = material?.name || child.name || 'Unnamed'

        meshes.push({
          meshId: child.uuid,
          meshName: child.name || child.uuid.substring(0, 8),
          materialName,
          geometry,
        })
      }
    })
  }

  const handleMouseEnter = useCallback(
    (meshId: string) => {
      setHoveredNodeId?.(meshId)
    },
    [setHoveredNodeId]
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredNodeId?.(null)
  }, [setHoveredNodeId])

  if (meshes.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-color-secondary)',
          fontStyle: 'italic',
        }}
      >
        No UV maps available
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.5rem',
        width: '100%',
      }}
    >
      {meshes.map(mesh => (
        <div key={mesh.meshId}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-color)',
              marginBottom: '0.25rem',
              padding: '0.25rem 0',
              borderBottom: '1px solid var(--surface-border)',
            }}
          >
            {mesh.materialName}
          </div>
          <UVCanvas
            geometry={mesh.geometry}
            size={containerWidth - 16}
            onMouseEnter={() => handleMouseEnter(mesh.meshId)}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      ))}
    </div>
  )
}

interface UVCanvasProps {
  geometry: THREE.BufferGeometry
  size: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function UVCanvas({
  geometry,
  size,
  onMouseEnter,
  onMouseLeave,
}: UVCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasSize = Math.max(100, size)

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvasSize, canvasSize)

    const uvAttribute = geometry.getAttribute('uv')
    const positionAttribute = geometry.getAttribute('position')
    const index = geometry.index

    if (!uvAttribute || !positionAttribute) return

    geometry.computeBoundingBox()
    const bbox = geometry.boundingBox!
    const bboxSize = new THREE.Vector3()
    bbox.getSize(bboxSize)
    const min = bbox.min

    const drawTriangle = (i1: number, i2: number, i3: number) => {
      const u1 = uvAttribute.getX(i1)
      const v1 = 1 - uvAttribute.getY(i1)
      const u2 = uvAttribute.getX(i2)
      const v2 = 1 - uvAttribute.getY(i2)
      const u3 = uvAttribute.getX(i3)
      const v3 = 1 - uvAttribute.getY(i3)

      const x1 = u1 * canvasSize,
        y1 = v1 * canvasSize
      const x2 = u2 * canvasSize,
        y2 = v2 * canvasSize
      const x3 = u3 * canvasSize,
        y3 = v3 * canvasSize

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

      const avgPos = pos1.clone().add(pos2).add(pos3).divideScalar(3)
      const r =
        bboxSize.x > 0
          ? Math.floor(((avgPos.x - min.x) / bboxSize.x) * 255)
          : 128
      const g =
        bboxSize.y > 0
          ? Math.floor(((avgPos.y - min.y) / bboxSize.y) * 255)
          : 128
      const b =
        bboxSize.z > 0
          ? Math.floor(((avgPos.z - min.z) / bboxSize.z) * 255)
          : 128

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.lineTo(x3, y3)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        drawTriangle(index.array[i], index.array[i + 1], index.array[i + 2])
      }
    } else {
      for (let i = 0; i < uvAttribute.count; i += 3) {
        drawTriangle(i, i + 1, i + 2)
      }
    }
  }, [geometry, canvasSize])

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: '100%',
        height: 'auto',
        aspectRatio: '1 / 1',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'block',
      }}
    />
  )
}

import { useState, useEffect } from 'react'
import * as THREE from 'three'

export interface HierarchyNode {
  id: string
  name: string
  type: string
  children: HierarchyNode[]
  meshInfo?: {
    vertices: number
    faces: number
    materials: string[]
  }
  materialInfo?: {
    type: string
    color?: string
    map?: boolean
  }
}

/**
 * Extract hierarchy information from a THREE.js Object3D
 */
function extractHierarchy(object: THREE.Object3D, depth = 0): HierarchyNode {
  const node: HierarchyNode = {
    id: object.uuid,
    name: object.name || `${object.type}_${object.uuid.substring(0, 8)}`,
    type: object.type,
    children: [],
  }

  // Extract mesh information
  if (object instanceof THREE.Mesh) {
    const geometry = object.geometry
    const material = object.material

    const vertices = geometry.attributes.position?.count || 0
    const faces = geometry.index ? geometry.index.count / 3 : vertices / 3

    const materials: string[] = []
    if (Array.isArray(material)) {
      materials.push(...material.map(m => m.name || m.type))
    } else if (material) {
      materials.push(material.name || material.type)
    }

    node.meshInfo = {
      vertices: Math.floor(vertices),
      faces: Math.floor(faces),
      materials,
    }
  }

  // Extract material information
  if (object instanceof THREE.Mesh && object.material) {
    const material = Array.isArray(object.material)
      ? object.material[0]
      : object.material

    if (material instanceof THREE.Material) {
      node.materialInfo = {
        type: material.type,
      }

      if ('color' in material && material.color instanceof THREE.Color) {
        node.materialInfo.color = '#' + material.color.getHexString()
      }

      if ('map' in material && material.map) {
        node.materialInfo.map = true
      }
    }
  }

  // Recursively process children
  if (object.children && object.children.length > 0) {
    node.children = object.children.map(child =>
      extractHierarchy(child, depth + 1)
    )
  }

  return node
}

/**
 * Hook to extract and manage model hierarchy from a THREE.js scene or model
 */
export function useModelHierarchy(sceneOrModel: THREE.Object3D | null) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode | null>(null)

  useEffect(() => {
    if (sceneOrModel) {
      const extracted = extractHierarchy(sceneOrModel)
      setHierarchy(extracted)
    } else {
      setHierarchy(null)
    }
  }, [sceneOrModel])

  return hierarchy
}

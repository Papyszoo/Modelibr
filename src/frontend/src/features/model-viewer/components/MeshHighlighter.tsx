import { useFrame, useThree } from '@react-three/fiber'
import { useContext, useRef } from 'react'
import * as THREE from 'three'

import { ModelContext } from '@/contexts/ModelContext'

const HOVER_EMISSIVE = new THREE.Color(0x444444)
const SELECTED_EMISSIVE = new THREE.Color(0x0066cc)

interface OriginalMaterialState {
  emissive: THREE.Color
  emissiveIntensity: number
}

/**
 * Finds a THREE.Object3D by uuid, searching recursively through the scene.
 */
function findObjectByUuid(
  root: THREE.Object3D,
  uuid: string
): THREE.Object3D | null {
  if (root.uuid === uuid) return root
  for (const child of root.children) {
    const found = findObjectByUuid(child, uuid)
    if (found) return found
  }
  return null
}

/**
 * Collects all meshes from an object (including nested children for groups).
 */
function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  obj.traverse(child => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child)
    }
  })
  return meshes
}

/**
 * MeshHighlighter reads hoveredNodeId and selectedNodeId from the ModelContext
 * and applies emissive highlighting to the corresponding meshes in the 3D scene.
 *
 * Must be rendered inside a <Canvas> (react-three-fiber context).
 */
export function MeshHighlighter() {
  const context = useContext(ModelContext)
  const { scene } = useThree()

  // Track which meshes we've modified so we can restore them
  const modifiedMeshes = useRef<Map<string, OriginalMaterialState>>(new Map())
  const prevHoveredRef = useRef<string | null>(null)
  const prevSelectedRef = useRef<string | null>(null)

  useFrame(() => {
    if (!context) return

    const { hoveredNodeId, selectedNodeId } = context

    // Skip if nothing changed
    if (
      hoveredNodeId === prevHoveredRef.current &&
      selectedNodeId === prevSelectedRef.current
    )
      return

    prevHoveredRef.current = hoveredNodeId
    prevSelectedRef.current = selectedNodeId

    // First, restore all previously modified meshes
    modifiedMeshes.current.forEach((original, uuid) => {
      const obj = findObjectByUuid(scene, uuid)
      if (obj instanceof THREE.Mesh) {
        const material = obj.material
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          material.emissive.copy(original.emissive)
          material.emissiveIntensity = original.emissiveIntensity
        }
      }
    })
    modifiedMeshes.current.clear()

    // Apply selected highlight
    if (selectedNodeId) {
      const selectedObj = findObjectByUuid(scene, selectedNodeId)
      if (selectedObj) {
        const meshes = collectMeshes(selectedObj)
        for (const mesh of meshes) {
          applyHighlight(mesh, SELECTED_EMISSIVE, 1.0, modifiedMeshes.current)
        }
      }
    }

    // Apply hover highlight (on top of selection if needed)
    if (hoveredNodeId && hoveredNodeId !== selectedNodeId) {
      const hoveredObj = findObjectByUuid(scene, hoveredNodeId)
      if (hoveredObj) {
        const meshes = collectMeshes(hoveredObj)
        for (const mesh of meshes) {
          applyHighlight(mesh, HOVER_EMISSIVE, 1.0, modifiedMeshes.current)
        }
      }
    }
  })

  return null
}

function applyHighlight(
  mesh: THREE.Mesh,
  emissiveColor: THREE.Color,
  intensity: number,
  modified: Map<string, OriginalMaterialState>
) {
  const material = mesh.material
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    // Save original state only if not already saved (hover shouldn't overwrite selection save)
    if (!modified.has(mesh.uuid)) {
      modified.set(mesh.uuid, {
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity,
      })
    }
    material.emissive.copy(emissiveColor)
    material.emissiveIntensity = intensity
  }
}

/**
 * Scene-graph extraction — shared cross-runtime code. Walks a loaded THREE scene
 * (the three.js path; a bpy pass produces the same shape natively with the extra
 * fields filled) and produces the raw per-part rows + whole-asset rollups that
 * feed the extraction substrate.
 *
 * THREE is injected so this runs in the Puppeteer page AND in Vitest under Node
 * (see the other lib/ modules). The three.js path triangulates, so fields that
 * only exist in the authoring tool — quad/n-gon ratios, vertex groups, applied
 * modifiers — are emitted as null here, never guessed. The geometry hash is
 * computed on the triangulated geometry available in BOTH paths (see
 * geometryHash.js) so bpy and three.js agree.
 */

import { hashGeometry, GEOMETRY_HASH_VERSION } from './geometryHash.js'
import {
  resolveSiblingSegments,
  joinPartPath,
  PART_PATH_VERSION,
} from './partPath.js'

// v2: parts now carry a world-space `worldBoundingBox` (local `boundingBox` is
// kept for geometry context) so derived dimensions reflect the node transform
// (scale/rotation), not raw object-space geometry.
export const SCENE_GRAPH_EXTRACTOR_VERSION = 2

function round(value, decimals = 6) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  const r = Math.round(value * factor) / factor
  return r === 0 ? 0 : r
}

function roundTuple(values, decimals = 6) {
  return Array.from(values, v => round(v, decimals))
}

function classifyObjectType(obj) {
  if (obj.isSkinnedMesh) return 'skinnedMesh'
  if (obj.isInstancedMesh) return 'instancedMesh'
  if (obj.isMesh) return 'mesh'
  if (obj.isBone) return 'bone'
  if (obj.isLight) return 'light'
  if (obj.isCamera) return 'camera'
  if (obj.isPoints) return 'points'
  if (obj.isLine) return 'line'
  if (obj.isGroup) return 'group'
  return 'object'
}

function materialNamesOf(obj) {
  if (!obj.material) return []
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
  return materials.map(m => (m && m.name ? m.name : '')).filter(Boolean)
}

function geometryArrays(geometry) {
  const position = geometry.attributes && geometry.attributes.position
  if (!position) return null
  return {
    positions: position.array,
    indices: geometry.index ? geometry.index.array : null,
  }
}

function uvBoundsOf(geometry) {
  const uv = geometry.attributes && geometry.attributes.uv
  if (!uv) return null
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  return { min: [round(minU), round(minV)], max: [round(maxU), round(maxV)] }
}

function worldBoundingBoxOf(obj, THREE) {
  if (!THREE || !THREE.Box3) return null
  try {
    const box = new THREE.Box3().setFromObject(obj)
    if (box.isEmpty()) return null
    return {
      min: roundTuple([box.min.x, box.min.y, box.min.z]),
      max: roundTuple([box.max.x, box.max.y, box.max.z]),
      dimensions: roundTuple([
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
      ]),
    }
  } catch {
    return null
  }
}

function meshDetail(obj, THREE) {
  const geometry = obj.geometry
  if (!geometry) {
    return { triangleCount: null, vertexCount: null, geometryHash: null }
  }

  const position = geometry.attributes && geometry.attributes.position
  const vertexCount = position ? position.count : 0
  const indexCount = geometry.index ? geometry.index.count : 0
  const triangleCount = Math.round(
    indexCount > 0 ? indexCount / 3 : vertexCount / 3
  )

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox()
  }
  const bb = geometry.boundingBox
  const boundingBox = bb
    ? {
        min: roundTuple([bb.min.x, bb.min.y, bb.min.z]),
        max: roundTuple([bb.max.x, bb.max.y, bb.max.z]),
      }
    : null

  const arrays = geometryArrays(geometry)
  const geometryHash = arrays ? hashGeometry(arrays) : null

  // Shape keys DO survive to three.js as morph targets; vertex groups and
  // modifiers do not (triangulated) → null, filled only by the bpy path.
  const shapeKeys =
    geometry.morphAttributes && geometry.morphAttributes.position
      ? Object.keys(obj.morphTargetDictionary || {})
      : []

  return {
    triangleCount,
    vertexCount,
    boundingBox,
    worldBoundingBox: worldBoundingBoxOf(obj, THREE),
    geometryHash,
    hasUvs: Boolean(geometry.attributes && geometry.attributes.uv),
    uvBounds: uvBoundsOf(geometry),
    materialSlots: materialNamesOf(obj),
    shapeKeys,
    vertexGroups: null,
    modifiers: null,
    quadCount: null,
    ngonCount: null,
  }
}

function collectReferencedImages(meshes, warnings) {
  const TEXTURE_SLOTS = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'bumpMap',
    'displacementMap',
    'alphaMap',
  ]
  let resolved = 0
  const unresolved = []
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      for (const slot of TEXTURE_SLOTS) {
        const tex = material[slot]
        if (!tex) continue
        if (tex.image) {
          resolved++
        } else {
          const name = tex.name || `${material.name || 'material'}.${slot}`
          unresolved.push(name)
          warnings.push(`Unresolved image reference: ${name}`)
        }
      }
    }
  }
  return {
    resolvedCount: resolved,
    unresolved: [...new Set(unresolved)].sort(),
  }
}

/**
 * @param {object} root - The loaded model root (THREE.Object3D / Group).
 * @param {object} THREE - The three namespace (for Box3).
 * @param {{ sourceFormat?: string }} [options] - sourceFormat informs unit confidence.
 * @returns {object} Raw scene-graph payload: { parts, rollups, warnings, ...versions }.
 */
export function extractSceneGraph(root, THREE, options = {}) {
  const warnings = []
  const parts = []
  const meshes = []
  const objectCounts = {}
  const materialNames = new Set()
  let totalTriangles = 0
  let totalVertices = 0
  let boneCount = 0

  const walk = (obj, parentPath, depth) => {
    const children = obj.children || []
    const segments = resolveSiblingSegments(children.map(c => c.name || ''))

    children.forEach((child, i) => {
      const partPath = joinPartPath(parentPath, segments[i])
      const objectType = classifyObjectType(child)
      objectCounts[objectType] = (objectCounts[objectType] || 0) + 1
      if (objectType === 'bone') boneCount++

      const part = {
        partPath,
        name: child.name || '',
        parentPath: parentPath,
        depth,
        objectType,
        source: 'threejs',
        transform: {
          position: roundTuple([
            child.position.x,
            child.position.y,
            child.position.z,
          ]),
          quaternion: roundTuple([
            child.quaternion.x,
            child.quaternion.y,
            child.quaternion.z,
            child.quaternion.w,
          ]),
          scale: roundTuple([child.scale.x, child.scale.y, child.scale.z]),
        },
      }

      if (child.isMesh) {
        const detail = meshDetail(child, THREE)
        Object.assign(part, detail)
        meshes.push(child)
        totalTriangles += detail.triangleCount || 0
        totalVertices += detail.vertexCount || 0
        detail.materialSlots.forEach(n => materialNames.add(n))
      }

      parts.push(part)
      walk(child, partPath, depth + 1)
    })
  }

  // Ensure world matrices are current before walking — per-part world bounds
  // (worldBoundingBoxOf) and the whole-asset world bounds both depend on them.
  try {
    root.updateMatrixWorld(true)
  } catch {
    warnings.push('Could not update world matrices')
  }

  walk(root, '/', 1)

  // World bounds of the whole asset.
  let worldBounds = null
  try {
    const box = new THREE.Box3().setFromObject(root)
    if (!box.isEmpty()) {
      worldBounds = {
        min: roundTuple([box.min.x, box.min.y, box.min.z]),
        max: roundTuple([box.max.x, box.max.y, box.max.z]),
        dimensions: roundTuple([
          box.max.x - box.min.x,
          box.max.y - box.min.y,
          box.max.z - box.min.z,
        ]),
      }
    }
  } catch {
    warnings.push('Could not compute world bounds')
  }

  const animationClips = Array.isArray(root.animations) ? root.animations : []
  const animations = animationClips.map((clip, index) => ({
    name: clip.name || `Animation ${index + 1}`,
    duration: round(clip.duration ?? 0, 4),
    trackCount: Array.isArray(clip.tracks) ? clip.tracks.length : 0,
  }))

  const referencedImages = collectReferencedImages(meshes, warnings)

  // Unit confidence: glTF defines metres; other importers do not carry units.
  const fmt = (options.sourceFormat || '').toLowerCase()
  const unitConfidence = fmt === 'gltf' || fmt === 'glb' ? 'medium' : 'low'

  return {
    extractorVersion: SCENE_GRAPH_EXTRACTOR_VERSION,
    geometryHashVersion: GEOMETRY_HASH_VERSION,
    partPathVersion: PART_PATH_VERSION,
    parts,
    rollups: {
      objectCounts,
      meshCount: objectCounts.mesh || 0,
      totalTriangles,
      totalVertices,
      materialCount: materialNames.size,
      materialNames: [...materialNames].sort(),
      boneCount,
      worldBounds,
      unitConfidence,
      animationCount: animations.length,
      animationNames: animations.map(a => a.name),
      animations,
      referencedImages,
    },
    warnings,
  }
}

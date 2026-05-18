import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { addSharedDisplacementNormal } from '@/shared/three/sharedDisplacementNormal'

import { type GeometryType } from '../components/GeometrySelector'

/**
 * Copy `uv` to `uv2` if `uv2` doesn't already exist. AO maps require a
 * second UV set.
 */
export function ensureUv2(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv')
  if (uv && !geometry.getAttribute('uv2')) {
    geometry.setAttribute('uv2', uv.clone())
  }
  return geometry
}

/**
 * Cylinder: open-ended side + two independent CircleGeometry caps merged
 * into one buffer. `aDispNormal` is computed per piece *after* the cap's
 * rotateX/translate (three.js's `applyMatrix4` transforms position/normal
 * but not custom attributes, so computing it pre-rotation would leave the
 * cap normals pointing along the disk's original +Z) and *before*
 * `mergeGeometries`, so the side rim keeps a purely radial direction and
 * the cap rim keeps a purely vertical direction — otherwise averaging
 * across pieces would flare the rim outward-and-up under displacement.
 */
export function createCylinderGeometry(): THREE.BufferGeometry {
  const side = addSharedDisplacementNormal(
    ensureUv2(new THREE.CylinderGeometry(1, 1, 2, 128, 128, true))
  )

  const topCap = new THREE.CircleGeometry(1, 128)
  topCap.rotateX(-Math.PI / 2)
  topCap.translate(0, 1, 0)
  ensureUv2(topCap)
  addSharedDisplacementNormal(topCap)

  const bottomCap = new THREE.CircleGeometry(1, 128)
  bottomCap.rotateX(Math.PI / 2)
  bottomCap.translate(0, -1, 0)
  ensureUv2(bottomCap)
  addSharedDisplacementNormal(bottomCap)

  return (
    mergeGeometries([side, topCap, bottomCap]) ??
    addSharedDisplacementNormal(
      ensureUv2(new THREE.CylinderGeometry(1, 1, 2, 128, 128, false))
    )
  )
}

/**
 * Create a BufferGeometry for the given primitive type. Each primitive
 * gets a `uv2` (for AO sampling) and an averaged-by-position `aDispNormal`
 * attribute used by the displacement shader injection. Box/cube duplicates
 * survive — face UVs stay per-face (no smear band) and the shared
 * displacement direction prevents tearing under displacement.
 */
export function createPreviewGeometry(
  geometryType: GeometryType
): THREE.BufferGeometry {
  switch (geometryType) {
    case 'plane':
      // High subdivision (512) so displacement mapping captures fine detail
      return addSharedDisplacementNormal(
        ensureUv2(new THREE.PlaneGeometry(2.4, 2.4, 512, 512))
      )
    case 'box':
      return addSharedDisplacementNormal(
        ensureUv2(new THREE.BoxGeometry(2, 2, 2, 128, 128, 128))
      )
    case 'sphere':
      return addSharedDisplacementNormal(
        ensureUv2(new THREE.SphereGeometry(1.2, 128, 128))
      )
    case 'cylinder':
      return createCylinderGeometry()
    case 'torus':
      return addSharedDisplacementNormal(
        ensureUv2(new THREE.TorusGeometry(1, 0.4, 64, 128))
      )
    default:
      return addSharedDisplacementNormal(
        ensureUv2(new THREE.PlaneGeometry(2.4, 2.4, 512, 512))
      )
  }
}

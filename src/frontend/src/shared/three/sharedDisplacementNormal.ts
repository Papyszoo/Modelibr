import * as THREE from 'three'

/**
 * Make per-vertex displacement *direction* consistent across coincident-position
 * vertex duplicates, without merging their UVs/normals (which would smear the
 * surface texture at edges).
 *
 * The problem this solves: three.js's BoxGeometry and many user-uploaded
 * hard-edged meshes carry duplicated vertices at every shared edge — each
 * copy holds the same position but a face-aligned normal and a face-local
 * UV island. Under per-vertex displacement, those copies push along their
 * own face normal and tear the seam open. Merging the vertices (the welding
 * fix) closes the tear but also collapses the UVs to a single "first occurrence
 * wins" value, leaving a one-triangle-wide texture-smear band along every edge.
 *
 * The clean alternative is to keep both copies (so each face's UV island stays
 * intact and color sampling is unaffected) but make their *displacement*
 * direction identical: the average of the normals at that shared position.
 *
 * Pipeline:
 *   1. `addSharedDisplacementNormal(geom)` writes the averaged direction into a
 *      custom `aDispNormal` attribute (falls back to the per-vertex normal where
 *      a position has no duplicates).
 *   2. `applyDispNormalDisplacement(mat)` injects an `onBeforeCompile` hook that
 *      replaces three's stock displacement vertex chunk with one that pushes
 *      along `aDispNormal` instead of `objectNormal`.
 *
 * Trade-off: heights at duplicates can still differ if their face-local UVs
 * sample different texels. With `RepeatWrapping`, adjacent face UVs at cube
 * corners wrap to the same texel (`u = 0` and `u = 1` are identical samples);
 * only *mid-edges* can show a height mismatch. The worst-case mismatch is
 * `(maxHeight − minHeight) × displacementScale` along the averaged normal —
 * up to one percent of mesh size at the 0.02 displacement scale we use for
 * previews. Still far less perceptible than the smear band welding produced.
 */

const DISP_NORMAL_ATTR = 'aDispNormal'

/**
 * Compute averaged-by-position normals and store them on the geometry as
 * `aDispNormal`. Returns the same geometry for chaining. Idempotent — if the
 * attribute already exists, leaves it alone.
 */
export function addSharedDisplacementNormal(
  geometry: THREE.BufferGeometry,
  tolerance = 1e-4
): THREE.BufferGeometry {
  if (geometry.getAttribute(DISP_NORMAL_ATTR)) return geometry

  const position = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined
  const normal = geometry.getAttribute('normal') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined
  if (!position || !normal) return geometry

  const count = position.count
  const mult = 1 / tolerance

  // Bucket vertices by quantized position.
  const groups = new Map<string, number[]>()
  for (let i = 0; i < count; i++) {
    const x = Math.round(position.getX(i) * mult)
    const y = Math.round(position.getY(i) * mult)
    const z = Math.round(position.getZ(i) * mult)
    const key = `${x},${y},${z}`
    let bucket = groups.get(key)
    if (!bucket) {
      bucket = []
      groups.set(key, bucket)
    }
    bucket.push(i)
  }

  const dispNormals = new Float32Array(count * 3)
  for (const indices of groups.values()) {
    let nx = 0
    let ny = 0
    let nz = 0
    for (const idx of indices) {
      nx += normal.getX(idx)
      ny += normal.getY(idx)
      nz += normal.getZ(idx)
    }
    const len = Math.hypot(nx, ny, nz)
    if (len > 0) {
      nx /= len
      ny /= len
      nz /= len
    }
    for (const idx of indices) {
      dispNormals[idx * 3] = nx
      dispNormals[idx * 3 + 1] = ny
      dispNormals[idx * 3 + 2] = nz
    }
  }

  geometry.setAttribute(
    DISP_NORMAL_ATTR,
    new THREE.BufferAttribute(dispNormals, 3)
  )
  return geometry
}

const VERTEX_PARS_INJECTION = `
#include <displacementmap_pars_vertex>
attribute vec3 aDispNormal;
`

const VERTEX_DISPLACEMENT_INJECTION = `
#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( aDispNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif
`

/**
 * Swap the displacement direction from `objectNormal` to the `aDispNormal`
 * attribute. Idempotent on the same material (caches via `userData`).
 */
export function applyDispNormalDisplacement(material: THREE.Material): void {
  if (material.userData.dispNormalShaderApplied) return
  material.userData.dispNormalShaderApplied = true

  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.call(material, shader, renderer)

    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_pars_vertex>',
      VERTEX_PARS_INJECTION.trim()
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_vertex>',
      VERTEX_DISPLACEMENT_INJECTION.trim()
    )
  }

  const previousCacheKey = material.customProgramCacheKey
  material.customProgramCacheKey = () => {
    const prev = previousCacheKey ? previousCacheKey.call(material) : ''
    return prev ? `disp-normal|${prev}` : 'disp-normal'
  }
}

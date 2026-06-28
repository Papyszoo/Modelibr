/**
 * Shared "displacement direction" logic for hard-edged meshes, used identically
 * by the frontend viewer (via the `shared/three/sharedDisplacementNormal.ts`
 * wrapper) and the worker Puppeteer thumbnail (via the window side-effect).
 *
 * The problem this solves: three.js's BoxGeometry and many user-uploaded
 * hard-edged meshes carry duplicated vertices at every shared edge — each copy
 * holds the same position but a face-aligned normal and a face-local UV island.
 * Under per-vertex displacement, those copies push along their own face normal
 * and tear the seam open. Merging the vertices (welding) closes the tear but
 * collapses the UVs to a single "first occurrence wins" value, leaving a
 * one-triangle-wide texture-smear band along every edge.
 *
 * The clean alternative is to keep both copies (so each face's UV island stays
 * intact and color sampling is unaffected) but make their *displacement*
 * direction identical: the average of the normals at that shared position.
 *
 *   1. `addSharedDisplacementNormal(THREE, geom)` writes the averaged direction
 *      into a custom `aDispNormal` attribute (falls back to the per-vertex
 *      normal where a position has no duplicates).
 *   2. `applyDispNormalDisplacement(mat)` injects an `onBeforeCompile` hook that
 *      replaces three's stock displacement vertex chunk with one that pushes
 *      along `aDispNormal` instead of `objectNormal`.
 *
 * THREE is injected into `addSharedDisplacementNormal` (it constructs a
 * BufferAttribute); `applyDispNormalDisplacement` only mutates material hooks, so
 * it needs no THREE. The two GLSL chunks below are the single source of truth.
 */

const DISP_NORMAL_ATTR = 'aDispNormal'

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
 * Compute averaged-by-position normals and store them on the geometry as
 * `aDispNormal`. Returns the same geometry for chaining. Idempotent — if the
 * attribute already exists, leaves it alone. A no-op when position or normal is
 * missing.
 *
 * @param {object} THREE - The three namespace (only `BufferAttribute` is used).
 * @param {object} geometry - A BufferGeometry.
 * @param {number} [tolerance] - Position-quantization tolerance for grouping
 *   coincident vertices (default 1e-4).
 */
export function addSharedDisplacementNormal(THREE, geometry, tolerance = 1e-4) {
  if (geometry.getAttribute(DISP_NORMAL_ATTR)) return geometry

  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (!position || !normal) return geometry

  const count = position.count
  const mult = 1 / tolerance

  // Bucket vertices by quantized position.
  const groups = new Map()
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

/**
 * Swap the displacement direction from `objectNormal` to the `aDispNormal`
 * attribute. Idempotent on the same material (caches via `userData`). No THREE
 * needed — only material hooks are touched.
 *
 * @param {object} material - A three Material.
 */
export function applyDispNormalDisplacement(material) {
  if (material.userData.dispNormalShaderApplied) return
  material.userData.dispNormalShaderApplied = true

  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    if (previousOnBeforeCompile) {
      previousOnBeforeCompile.call(material, shader, renderer)
    }

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

/**
 * WebGPU/TSL equivalent of {@link applyDispNormalDisplacement}. `WebGPURenderer`
 * ignores the `onBeforeCompile` GLSL hook used above (it builds materials from
 * TSL nodes), so the displacement is expressed as a `positionNode` instead:
 * push each vertex along the averaged `aDispNormal` direction by
 * `displacementMap.x * displacementScale + displacementBias` — the same formula
 * as {@link VERTEX_DISPLACEMENT_INJECTION}.
 *
 * `displacementMap` is referenced inside the node and `material.displacementMap`
 * is deliberately left unset, so the node material's built-in displacement
 * (which pushes along the per-vertex `normalLocal` and would double-apply) stays
 * off. Scale/bias are read live from the material via `materialReference`, so the
 * viewer's displacement controls keep working. Idempotent per material.
 *
 * @param {object} args
 * @param {object} args.THREE - three webgpu namespace (unused today; kept for
 *   signature parity / future geometry needs).
 * @param {object} args.TSL - three/tsl namespace.
 * @param {object} args.material - a Node material (e.g. MeshPhysicalNodeMaterial).
 * @param {object} args.displacementMap - the displacement Texture to sample.
 * @param {number} [args.displacementScale]
 * @param {number} [args.displacementBias]
 */
export function applyDispNormalDisplacementNode({
  TSL,
  material,
  displacementMap,
  displacementScale = 1,
  displacementBias = 0,
}) {
  if (material.userData.dispNormalNodeApplied) return
  material.userData.dispNormalNodeApplied = true

  const { attribute, positionLocal, texture, uv, materialReference } = TSL

  const direction = attribute(DISP_NORMAL_ATTR, 'vec3').normalize()
  const amount = texture(displacementMap, uv())
    .x.mul(materialReference('displacementScale', 'float'))
    .add(materialReference('displacementBias', 'float'))

  material.positionNode = positionLocal.add(direction.mul(amount))
  material.displacementScale = displacementScale
  material.displacementBias = displacementBias
}

// Side-effect: expose on window for the Puppeteer page.evaluate (classic-script
// context), parity with the other shared modules.
if (typeof window !== 'undefined') {
  window.modelibrDispNormal = {
    addSharedDisplacementNormal,
    applyDispNormalDisplacement,
    applyDispNormalDisplacementNode,
  }
}

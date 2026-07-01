import * as THREE from 'three'

import {
  addSharedDisplacementNormal,
  applyDispNormalDisplacement,
} from '../sharedDisplacementNormal'

function makeHardEdgeQuad(): THREE.BufferGeometry {
  // Two coplanar-but-distinct faces meeting at a shared edge in world space.
  // Vertices 1+3 share position (1, 0, 0). Vertices 2+4 share position (0, 1, 0).
  // Each "face" carries a face-aligned normal (+Z for tri A, +X for tri B) so
  // displacement-along-normal would tear them apart.
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
  ])
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ])
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geom
}

describe('addSharedDisplacementNormal', () => {
  it('writes an averaged-by-position normal into aDispNormal', () => {
    const geom = addSharedDisplacementNormal(makeHardEdgeQuad())
    const attr = geom.getAttribute('aDispNormal')

    expect(attr).toBeDefined()
    expect(attr.count).toBe(6)

    // Vertex 0 is unique (only on tri A); keeps the +Z normal.
    expect(attr.getX(0)).toBe(0)
    expect(attr.getY(0)).toBe(0)
    expect(attr.getZ(0)).toBe(1)

    // Vertices 1 and 3 share position (1, 0, 0). +Z (from tri A) + +X (from
    // tri B) → normalised to (sqrt(2)/2, 0, sqrt(2)/2).
    const inv = 1 / Math.SQRT2
    expect(attr.getX(1)).toBeCloseTo(inv, 5)
    expect(attr.getZ(1)).toBeCloseTo(inv, 5)
    // Both copies of the shared vertex carry the SAME averaged direction.
    expect(attr.getX(3)).toBeCloseTo(attr.getX(1), 5)
    expect(attr.getY(3)).toBeCloseTo(attr.getY(1), 5)
    expect(attr.getZ(3)).toBeCloseTo(attr.getZ(1), 5)
  })

  it('falls back to per-vertex normal where there are no duplicates', () => {
    const geom = new THREE.PlaneGeometry(1, 1, 1, 1)
    addSharedDisplacementNormal(geom)
    const norm = geom.getAttribute('normal')
    const disp = geom.getAttribute('aDispNormal')

    expect(disp.count).toBe(norm.count)
    for (let i = 0; i < norm.count; i++) {
      expect(disp.getX(i)).toBeCloseTo(norm.getX(i), 6)
      expect(disp.getY(i)).toBeCloseTo(norm.getY(i), 6)
      expect(disp.getZ(i)).toBeCloseTo(norm.getZ(i), 6)
    }
  })

  it('falls back to per-vertex normals when coincident normals cancel to zero', () => {
    // Two vertices share a position but carry exactly opposing normals, so the
    // averaged direction is (0,0,0). Writing that would feed normalize() a zero
    // vector → NaN → collapsed vertex. The fallback must keep each vertex's own
    // (finite, non-zero) normal instead.
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3)
    )
    geom.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, -1]), 3)
    )

    addSharedDisplacementNormal(geom)
    const disp = geom.getAttribute('aDispNormal')

    for (let i = 0; i < disp.count * 3; i++) {
      expect(Number.isNaN(disp.array[i])).toBe(false)
    }
    expect(disp.getZ(0)).toBe(1)
    expect(disp.getZ(1)).toBe(-1)
    // Each fallback direction is unit-length (no zero vector reaches the shader).
    expect(Math.hypot(disp.getX(0), disp.getY(0), disp.getZ(0))).toBeCloseTo(
      1,
      6
    )
    expect(Math.hypot(disp.getX(1), disp.getY(1), disp.getZ(1))).toBeCloseTo(
      1,
      6
    )
  })

  it('is idempotent', () => {
    const geom = makeHardEdgeQuad()
    addSharedDisplacementNormal(geom)
    const first = geom.getAttribute('aDispNormal')
    addSharedDisplacementNormal(geom)
    expect(geom.getAttribute('aDispNormal')).toBe(first)
  })

  it('does nothing when position or normal is missing', () => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)
    )
    const result = addSharedDisplacementNormal(geom)
    expect(result.getAttribute('aDispNormal')).toBeUndefined()
  })
})

describe('applyDispNormalDisplacement', () => {
  it('injects a vertex shader that pushes along aDispNormal', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    applyDispNormalDisplacement(mat)

    expect(mat.onBeforeCompile).toBeDefined()

    const shader = {
      uniforms: {},
      vertexShader: `
#include <displacementmap_pars_vertex>
void main() {
  #include <displacementmap_vertex>
}
`,
      fragmentShader: '',
    } as unknown as Parameters<NonNullable<typeof mat.onBeforeCompile>>[0]
    mat.onBeforeCompile!(shader, {} as THREE.WebGLRenderer)

    expect(shader.vertexShader).toContain('attribute vec3 aDispNormal;')
    expect(shader.vertexShader).toContain('normalize( aDispNormal )')
    // The original objectNormal-based push should be gone.
    expect(shader.vertexShader).not.toContain('normalize( objectNormal )')
  })

  it('is idempotent', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    applyDispNormalDisplacement(mat)
    const firstOnBeforeCompile = mat.onBeforeCompile
    applyDispNormalDisplacement(mat)
    expect(mat.onBeforeCompile).toBe(firstOnBeforeCompile)
  })

  it('puts the disp-normal token at the start of the cache key', () => {
    // three.js's default Material.customProgramCacheKey returns
    // `this.onBeforeCompile.toString()` — so even with no prior caller-set
    // key there is always a "previous" key (the stringified onBeforeCompile
    // we just attached). The disp-normal token must appear at the start so
    // the key is recognisable and stable across material variants.
    const mat = new THREE.MeshPhysicalMaterial()
    applyDispNormalDisplacement(mat)
    expect(mat.customProgramCacheKey!()).toMatch(/^disp-normal/)
  })

  it('composes with a pre-existing onBeforeCompile / customProgramCacheKey', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    const priorCalls: string[] = []
    mat.onBeforeCompile = shader => {
      priorCalls.push('prior')
      shader.vertexShader += '\n//prior\n'
    }
    mat.customProgramCacheKey = () => 'prior-key'

    applyDispNormalDisplacement(mat)

    const shader = {
      uniforms: {},
      vertexShader: `
#include <displacementmap_pars_vertex>
void main() {
  #include <displacementmap_vertex>
}
`,
      fragmentShader: '',
    } as unknown as Parameters<NonNullable<typeof mat.onBeforeCompile>>[0]
    mat.onBeforeCompile!(shader, {} as THREE.WebGLRenderer)

    // Prior hook ran (and ran *first*, so disp-normal's chunk replacement
    // operates on the version produced by the prior hook).
    expect(priorCalls).toEqual(['prior'])
    expect(shader.vertexShader).toContain('//prior')
    // Disp-normal injection still applied on top.
    expect(shader.vertexShader).toContain('attribute vec3 aDispNormal;')
    expect(shader.vertexShader).toContain('normalize( aDispNormal )')
    // Cache key is the chained form; prior key still present so three can
    // invalidate the program if either side changes.
    expect(mat.customProgramCacheKey!()).toBe('disp-normal|prior-key')
  })
})

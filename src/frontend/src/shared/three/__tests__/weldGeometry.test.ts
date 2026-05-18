import * as THREE from 'three'

import { weldByPosition } from '../weldGeometry'

function makeQuad(): THREE.BufferGeometry {
  // Two triangles sharing an edge — vertices 1+2 and 3+4 are positional
  // duplicates (e.g., the hard-edge case from BoxGeometry-style authoring).
  // Positions:
  //   0: (0, 0, 0)   used by tri A
  //   1: (1, 0, 0)   used by tri A AND duplicated as vertex 3
  //   2: (0, 1, 0)   used by tri A AND duplicated as vertex 4
  //   3: (1, 0, 0)   used by tri B  (== pos of 1)
  //   4: (0, 1, 0)   used by tri B  (== pos of 2)
  //   5: (1, 1, 0)   used by tri B
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
  ])
  // UVs differ between the duplicates so stock mergeVertices wouldn't
  // collapse them; weldByPosition should.
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1])
  // Normals: tri A is back-face (-Z), tri B is front-face (+Z) so the
  // weld must average them to (0,0,0)... but computeVertexNormals will
  // recompute anyway from the merged topology.
  const normals = new Float32Array([
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ])
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5])

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geom.setIndex(new THREE.BufferAttribute(indices, 1))
  return geom
}

describe('weldByPosition', () => {
  it('collapses positional duplicates and rewrites the index buffer', () => {
    const welded = weldByPosition(makeQuad())

    expect(welded.getAttribute('position').count).toBe(4) // 6 → 4 unique
    expect(welded.index).not.toBeNull()
    expect(welded.index!.count).toBe(6) // index length unchanged
  })

  it('keeps the first occurrence UV for each merged vertex', () => {
    const welded = weldByPosition(makeQuad())
    const uv = welded.getAttribute('uv')

    // Vertex 1 (pos (1,0,0)) was seen first with UV (1,0); the duplicate at
    // old index 3 had UV (1,1) but loses since it's the second occurrence.
    // Find the welded index for that position via the rewritten index.
    const idx = welded.index!
    const mergedSlotForOldIndex1 = idx.getX(1)
    expect(uv.getX(mergedSlotForOldIndex1)).toBe(1)
    expect(uv.getY(mergedSlotForOldIndex1)).toBe(0)
  })

  it('returns the source unchanged when there are no duplicates', () => {
    const plain = new THREE.PlaneGeometry(1, 1, 1, 1)
    const result = weldByPosition(plain)
    expect(result).toBe(plain) // identity — no allocation
  })

  it('handles non-indexed input by treating each vertex as its own index', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0,
    ])
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    // No index, no other attributes.

    const welded = weldByPosition(geom)

    expect(welded.getAttribute('position').count).toBe(4)
    expect(welded.index).not.toBeNull()
    expect(welded.index!.count).toBe(6) // synthesised index covers all 6 verts
  })

  it('reads InterleavedBufferAttribute through the accessor API', () => {
    // Build a single interleaved buffer carrying both position (x,y,z) and
    // uv (u,v) per vertex — common shape for GLTF imports. The raw .array
    // path used to mis-index here; the welded result must read consistent
    // values via getX/getY/getZ.
    //
    // Layout per vertex (stride 5): [px, py, pz, u, v]
    const interleaved = new Float32Array([
      0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      1, 1, 0, 1, 1,
    ])
    const buf = new THREE.InterleavedBuffer(interleaved, 5)
    const positionAttr = new THREE.InterleavedBufferAttribute(buf, 3, 0)
    const uvAttr = new THREE.InterleavedBufferAttribute(buf, 2, 3)

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', positionAttr)
    geom.setAttribute('uv', uvAttr)
    geom.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 3, 4, 5]), 1))

    const welded = weldByPosition(geom)

    // 6 verts → 4 unique positions (same topology as the quad test).
    expect(welded.getAttribute('position').count).toBe(4)
    // Position at old index 1 was (1, 0, 0).
    const mergedSlotForOldIndex1 = welded.index!.getX(1)
    const pos = welded.getAttribute('position')
    expect(pos.getX(mergedSlotForOldIndex1)).toBe(1)
    expect(pos.getY(mergedSlotForOldIndex1)).toBe(0)
    expect(pos.getZ(mergedSlotForOldIndex1)).toBe(0)
    // UV at the same merged slot is the first occurrence's UV (1, 0).
    const uv = welded.getAttribute('uv')
    expect(uv.getX(mergedSlotForOldIndex1)).toBe(1)
    expect(uv.getY(mergedSlotForOldIndex1)).toBe(0)
  })
})

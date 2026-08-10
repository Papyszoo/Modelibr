import { describe, it, expect } from 'vitest'
import { hashGeometry, GEOMETRY_HASH_VERSION } from '../lib/geometryHash.js'

// A unit cube (8 verts, 12 triangles) as flat positions + indices.
const CUBE_POSITIONS = [
  0,
  0,
  0,
  1,
  0,
  0,
  1,
  1,
  0,
  0,
  1,
  0, // back face
  0,
  0,
  1,
  1,
  0,
  1,
  1,
  1,
  1,
  0,
  1,
  1, // front face
]
const CUBE_INDICES = [
  0,
  1,
  2,
  0,
  2,
  3, // back
  4,
  6,
  5,
  4,
  7,
  6, // front
  0,
  4,
  5,
  0,
  5,
  1, // bottom
  3,
  2,
  6,
  3,
  6,
  7, // top
  0,
  3,
  7,
  0,
  7,
  4, // left
  1,
  5,
  6,
  1,
  6,
  2, // right
]

function shuffleVerticesAndReindex(positions, indices) {
  // Build a permutation of the vertices, rewrite positions in the new order,
  // and remap the indices — same mesh, different vertex ordering.
  const vertexCount = positions.length / 3
  const perm = [...Array(vertexCount).keys()]
  // Deterministic shuffle (reverse) so the test is stable.
  perm.reverse()
  const oldToNew = new Array(vertexCount)
  perm.forEach((oldIndex, newIndex) => {
    oldToNew[oldIndex] = newIndex
  })
  const newPositions = new Array(positions.length)
  perm.forEach((oldIndex, newIndex) => {
    newPositions[newIndex * 3] = positions[oldIndex * 3]
    newPositions[newIndex * 3 + 1] = positions[oldIndex * 3 + 1]
    newPositions[newIndex * 3 + 2] = positions[oldIndex * 3 + 2]
  })
  const newIndices = indices.map(i => oldToNew[i])
  return { positions: newPositions, indices: newIndices }
}

describe('hashGeometry', () => {
  it('produces a stable 16-char hex hash', () => {
    const hash = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is invariant to vertex ordering (reindexed same mesh → same hash)', () => {
    const original = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    const reordered = shuffleVerticesAndReindex(CUBE_POSITIONS, CUBE_INDICES)
    const shuffled = hashGeometry(reordered)
    expect(shuffled).toBe(original)
  })

  it('is invariant to triangle ordering', () => {
    const original = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    // Reverse the triangle list (each tri is 3 indices).
    const tris = []
    for (let i = 0; i < CUBE_INDICES.length; i += 3) {
      tris.push(CUBE_INDICES.slice(i, i + 3))
    }
    tris.reverse()
    const reordered = tris.flat()
    expect(
      hashGeometry({ positions: CUBE_POSITIONS, indices: reordered })
    ).toBe(original)
  })

  it('is invariant to triangle winding order', () => {
    const original = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    // Flip winding of every triangle (swap 2nd and 3rd index).
    const flipped = []
    for (let i = 0; i < CUBE_INDICES.length; i += 3) {
      flipped.push(CUBE_INDICES[i], CUBE_INDICES[i + 2], CUBE_INDICES[i + 1])
    }
    expect(hashGeometry({ positions: CUBE_POSITIONS, indices: flipped })).toBe(
      original
    )
  })

  it('absorbs sub-epsilon float drift', () => {
    const original = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    const jittered = CUBE_POSITIONS.map(c => c + 1e-9)
    expect(hashGeometry({ positions: jittered, indices: CUBE_INDICES })).toBe(
      original
    )
  })

  it('differs for a different shape', () => {
    const cube = hashGeometry({
      positions: CUBE_POSITIONS,
      indices: CUBE_INDICES,
    })
    const scaled = hashGeometry({
      positions: CUBE_POSITIONS.map(c => c * 2),
      indices: CUBE_INDICES,
    })
    expect(scaled).not.toBe(cube)
  })

  it('handles non-indexed (soup) geometry', () => {
    // Two triangles as a flat vertex soup, no indices.
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    const hash = hashGeometry({ positions, indices: null })
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns null for empty geometry', () => {
    expect(hashGeometry({ positions: [] })).toBeNull()
    expect(hashGeometry({})).toBeNull()
  })

  it('exposes a version constant', () => {
    expect(GEOMETRY_HASH_VERSION).toBe(1)
  })
})

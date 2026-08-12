/**
 * Order-invariant geometry hash - shared cross-runtime code (worker Puppeteer
 * page, and any future consumer). It is the deduplication / instance-grouping /
 * cache key for meshes, so it MUST be identical for the same mesh regardless of
 * how an importer happened to order its vertices or wind its triangles. A bpy
 * native pass and the three.js path both feed the SAME triangulated arrays into
 * this function so their hashes agree (bpy enriches other fields; three.js
 * defines the hash - see prompt 21).
 *
 * Canonicalisation (this exact algorithm must be replicated byte-for-byte by any
 * other language that computes the same hash, e.g. the bpy script):
 *   1. Quantise every coordinate to an integer grid: q = round(coord / EPSILON).
 *      Absorbs float noise and importer round-trip drift.
 *   2. Describe each triangle by its three quantised vertex coordinates (NOT by
 *      vertex indices), then sort the three vertices within the triangle - this
 *      makes the hash invariant to winding order.
 *   3. Serialise each triangle as "x,y,z;x,y,z;x,y,z" and sort the whole list -
 *      invariant to triangle order and to vertex-array order.
 *   4. Hash "<vertexCount>|<triangleCount>|<joined triangles>" with FNV-1a 64.
 * A mesh with no faces (point cloud) hashes its sorted unique vertices instead.
 *
 * Bump GEOMETRY_HASH_VERSION whenever this algorithm or EPSILON changes; callers
 * persist it alongside the hash so a changed function invalidates only hashes,
 * not the rest of an extraction.
 */

export const GEOMETRY_HASH_VERSION = 1

// Quantisation grid. 1e-5 in model units - fine enough to keep distinct detail,
// coarse enough to collapse importer float drift. Part of the versioned contract.
const EPSILON = 1e-5

const FNV_OFFSET_BASIS = 14695981039346656037n
const FNV_PRIME = 1099511628211n
const U64_MASK = (1n << 64n) - 1n

function fnv1a64Hex(input) {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * FNV_PRIME) & U64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function quantize(value) {
  // Round half away from zero, then normalise -0 to 0 so its string form is stable.
  const q = Math.round(value / EPSILON)
  return q === 0 ? 0 : q
}

function vertexKey(positions, vertexIndex) {
  const o = vertexIndex * 3
  return [
    quantize(positions[o]),
    quantize(positions[o + 1]),
    quantize(positions[o + 2]),
  ]
}

function compareTuples(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * Compute the order-invariant hash for one mesh geometry.
 *
 * @param {{ positions: ArrayLike<number>, indices?: ArrayLike<number>|null }} geometry
 *   Flat vertex positions (x,y,z,x,y,z,...) and optional triangle indices. When
 *   indices are absent, every consecutive triple of vertices is one triangle.
 * @returns {string|null} 16-char hex hash, or null when there is no geometry.
 */
export function hashGeometry(geometry) {
  const positions = geometry && geometry.positions
  if (!positions || positions.length < 3) {
    return null
  }

  const vertexCount = Math.floor(positions.length / 3)
  const indices =
    geometry.indices && geometry.indices.length ? geometry.indices : null

  const triangles = []
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const tri = [
        vertexKey(positions, indices[i]),
        vertexKey(positions, indices[i + 1]),
        vertexKey(positions, indices[i + 2]),
      ]
      tri.sort(compareTuples)
      triangles.push(
        `${tri[0].join(',')};${tri[1].join(',')};${tri[2].join(',')}`
      )
    }
  } else {
    for (let v = 0; v + 2 < vertexCount; v += 3) {
      const tri = [
        vertexKey(positions, v),
        vertexKey(positions, v + 1),
        vertexKey(positions, v + 2),
      ]
      tri.sort(compareTuples)
      triangles.push(
        `${tri[0].join(',')};${tri[1].join(',')};${tri[2].join(',')}`
      )
    }
  }

  if (triangles.length === 0) {
    // Point cloud: fall back to sorted unique quantised vertices.
    const verts = []
    for (let v = 0; v < vertexCount; v++) verts.push(vertexKey(positions, v))
    verts.sort(compareTuples)
    const joined = verts.map(t => t.join(',')).join('|')
    return fnv1a64Hex(`${vertexCount}|0|${joined}`)
  }

  triangles.sort()
  return fnv1a64Hex(`${vertexCount}|${triangles.length}|${triangles.join('|')}`)
}

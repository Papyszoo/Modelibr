import * as THREE from 'three'

/**
 * Merge duplicated vertices by position alone, then recompute vertex normals.
 *
 * Why this exists: three.js primitives (BoxGeometry, SphereGeometry,
 * CylinderGeometry, TorusGeometry) and many user-uploaded meshes (anything
 * authored with hard edges) carry *duplicated* vertices at every shared
 * seam — each copy holds the same position but a face-aligned normal and a
 * face-local UV. Under per-vertex displacement, those duplicates push along
 * their own face normal — `(1,0,0)` on the +X face, `(0,1,0)` on the +Y
 * face, and so on — so the shared edge tears apart even if the height
 * sample is identical (e.g., when fed by triplanar projection).
 *
 * The stock `BufferGeometryUtils.mergeVertices` hashes by every attribute,
 * so the differing normals/UVs prevent it from collapsing those copies.
 * This welder hashes by position only, then `computeVertexNormals` averages
 * the face normals at each merged vertex so adjacent faces displace along
 * a single shared direction. The UV at each merged vertex keeps the first
 * occurrence's value; for tileable PBR textures with RepeatWrapping that
 * leaves only a one-vertex-wide texture wraparound at face boundaries —
 * an acceptable cost compared to the visible gap.
 *
 * Returns a new geometry; the input is untouched. If no duplicates exist
 * (e.g., PlaneGeometry), returns the input unchanged.
 */
export function weldByPosition(
  source: THREE.BufferGeometry,
  tolerance = 1e-4
): THREE.BufferGeometry {
  const position = source.getAttribute('position') as
    | THREE.BufferAttribute
    | undefined
  if (!position) return source

  const oldCount = position.count
  const inputIndex = source.index
  const indexCount = inputIndex ? inputIndex.count : oldCount

  const mult = 1 / tolerance
  const posKeyToNewIdx = new Map<string, number>()
  const oldToNew = new Uint32Array(oldCount)
  let newCount = 0

  for (let i = 0; i < oldCount; i++) {
    const x = Math.round(position.getX(i) * mult)
    const y = Math.round(position.getY(i) * mult)
    const z = Math.round(position.getZ(i) * mult)
    const key = `${x},${y},${z}`
    let newIdx = posKeyToNewIdx.get(key)
    if (newIdx === undefined) {
      newIdx = newCount++
      posKeyToNewIdx.set(key, newIdx)
    }
    oldToNew[i] = newIdx
  }

  if (newCount === oldCount) {
    return source
  }

  const dest = new THREE.BufferGeometry()
  for (const name in source.attributes) {
    const attr = source.attributes[name] as
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
    const itemSize = attr.itemSize
    // GLTF imports commonly use InterleavedBufferAttribute (strided buffers);
    // reading attr.array directly would index into the shared interleaved
    // buffer with the wrong stride. Use getX/getY/getZ/getW which both
    // attribute types implement and de-interleave the output.
    const srcArray =
      attr instanceof THREE.InterleavedBufferAttribute
        ? attr.data.array
        : attr.array
    const ArrCtor = srcArray.constructor as new (
      length: number
    ) => typeof srcArray
    const newArr = new ArrCtor(newCount * itemSize)
    const seen = new Uint8Array(newCount)
    for (let i = 0; i < oldCount; i++) {
      const newIdx = oldToNew[i]
      if (!seen[newIdx]) {
        seen[newIdx] = 1
        const base = newIdx * itemSize
        if (itemSize >= 1) newArr[base] = attr.getX(i)
        if (itemSize >= 2) newArr[base + 1] = attr.getY(i)
        if (itemSize >= 3) newArr[base + 2] = attr.getZ(i)
        if (itemSize >= 4) newArr[base + 3] = attr.getW(i)
      }
    }
    dest.setAttribute(
      name,
      new THREE.BufferAttribute(newArr, itemSize, attr.normalized)
    )
  }

  const newIndexArray =
    newCount < 0xffff
      ? new Uint16Array(indexCount)
      : new Uint32Array(indexCount)
  for (let i = 0; i < indexCount; i++) {
    const oldIdx = inputIndex ? inputIndex.getX(i) : i
    newIndexArray[i] = oldToNew[oldIdx]
  }
  dest.setIndex(new THREE.BufferAttribute(newIndexArray, 1))

  // Tangents (if any) reference per-vertex normals that no longer exist as
  // authored. Drop them; the renderer will recompute when a normal map is
  // attached.
  dest.deleteAttribute('tangent')
  dest.computeVertexNormals()

  return dest
}

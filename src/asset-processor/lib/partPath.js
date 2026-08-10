/**
 * Part-path identifier — the stable address of one object inside a composite
 * asset's scene graph. It ends up in URLs, API arguments and (later) MCP tool
 * arguments, so the format is decided deliberately here rather than left to
 * emerge. Shared cross-runtime so the three.js walk and the bpy script produce
 * identical paths for the same hierarchy.
 *
 * FORMAT (version 1):
 *   - A path is `/`-separated segments, always starting from the asset root `/`.
 *     The root object itself is `/`; its children are `/<segment>`, and so on.
 *   - A segment is the object's name with the four structural characters
 *     percent-encoded so a name can never be confused with the syntax:
 *       %  -> %25   (the escape char itself)
 *       /  -> %2F   (segment separator)
 *       [  -> %5B   (ordinal open)
 *       ]  -> %5D   (ordinal close)
 *   - Siblings that share the same encoded name (or whose name is blank) are
 *     disambiguated with a zero-based ordinal in brackets, assigned in the
 *     scene's stable child order: `Leg[0]`, `Leg[1]`. A name that is unique
 *     among its siblings carries no ordinal, so the common case stays readable.
 *
 * Determinism depends on the caller walking children in a stable order (the
 * importer's child order); do not sort children before assigning ordinals.
 */

export const PART_PATH_VERSION = 1

const RESERVED = { '%': '%25', '/': '%2F', '[': '%5B', ']': '%5D' }

/** Percent-encode the four structural characters in an object name. */
export function encodePartSegment(name) {
  const trimmed = (name ?? '').trim()
  return trimmed.replace(/[%/[\]]/g, ch => RESERVED[ch])
}

/**
 * Resolve the segments for one object's direct children, adding `[i]` ordinals
 * only where names collide or are blank. Input order is preserved and defines
 * the ordinals.
 *
 * @param {string[]} childNames - Raw names in stable child order.
 * @returns {string[]} One segment per child, aligned to the input order.
 */
export function resolveSiblingSegments(childNames) {
  const encoded = childNames.map(encodePartSegment)

  const totals = new Map()
  for (const seg of encoded) {
    totals.set(seg, (totals.get(seg) ?? 0) + 1)
  }

  const seen = new Map()
  return encoded.map(seg => {
    const needsOrdinal = seg === '' || totals.get(seg) > 1
    if (!needsOrdinal) {
      return seg
    }
    const ordinal = (seen.get(seg) ?? -1) + 1
    seen.set(seg, ordinal)
    return `${seg}[${ordinal}]`
  })
}

/** Append a resolved segment to a parent path. */
export function joinPartPath(parentPath, segment) {
  if (!parentPath || parentPath === '/') {
    return `/${segment}`
  }
  return `${parentPath}/${segment}`
}

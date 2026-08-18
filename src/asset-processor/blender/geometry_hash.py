"""
The order-invariant geometry hash, ported to Python for the bpy passes.

**This is a byte-for-byte port of `lib/geometryHash.js` and must stay one.** The hash is
the key of the compute cache, so a Python result that disagrees by a single character is
not a slightly-wrong answer - it is a row nothing will ever read, filed under a hash no
search hit carries. Bump nothing here without changing the JS in the same commit.

Three details are easy to get wrong, and each one silently changes every hash:

1. **JavaScript's `Math.round` rounds half towards +Infinity**, not half away from zero -
   `Math.round(-2.5)` is `-2`. Python's `round()` is banker's rounding and would disagree
   on every coordinate landing exactly on a half-grid boundary. `floor(x + 0.5)` is what
   matches.
2. **`Array.prototype.sort()` with no comparator sorts as strings**, not numerically. The
   triangle list is sorted that way on purpose, and Python's `list.sort()` on `str` agrees
   because every character involved is ASCII.
3. **The vertex count is part of the hashed input**, so the arrays fed in here must be the
   same ones three.js saw. For glTF that holds: the importer keeps the file's split
   vertices rather than merging them, verified rather than assumed. It does apply a Y-up to
   Z-up conversion, which callers must undo before hashing.
"""

import math

GEOMETRY_HASH_VERSION = 1

# Quantisation grid, in model units. Part of the versioned contract - see the JS.
EPSILON = 1e-5

_FNV_OFFSET_BASIS = 14695981039346656037
_FNV_PRIME = 1099511628211
_U64_MASK = (1 << 64) - 1


def _fnv1a64_hex(text):
    h = _FNV_OFFSET_BASIS
    for ch in text:
        h ^= ord(ch)
        h = (h * _FNV_PRIME) & _U64_MASK
    return format(h, "016x")


def quantize(value):
    """Match JS `Math.round(value / EPSILON)`: half rounds towards +Infinity."""
    q = math.floor(value / EPSILON + 0.5)
    return 0 if q == 0 else q


def _vertex_key(positions, vertex_index):
    o = vertex_index * 3
    return (
        quantize(positions[o]),
        quantize(positions[o + 1]),
        quantize(positions[o + 2]),
    )


def hash_geometry(positions, indices=None):
    """
    Compute the order-invariant hash for one mesh geometry.

    positions: flat sequence x,y,z,x,y,z,... in the SAME axis convention three.js read.
    indices:   flat triangle indices, or None for consecutive triples.
    Returns a 16-character hex string, or None when there is no geometry.
    """
    if positions is None or len(positions) < 3:
        return None

    vertex_count = len(positions) // 3
    triangles = []

    if indices:
        for i in range(0, len(indices) - 2, 3):
            tri = sorted(
                (
                    _vertex_key(positions, indices[i]),
                    _vertex_key(positions, indices[i + 1]),
                    _vertex_key(positions, indices[i + 2]),
                )
            )
            triangles.append(";".join(",".join(str(c) for c in v) for v in tri))
    else:
        for v in range(0, vertex_count - 2, 3):
            tri = sorted(
                (
                    _vertex_key(positions, v),
                    _vertex_key(positions, v + 1),
                    _vertex_key(positions, v + 2),
                )
            )
            triangles.append(";".join(",".join(str(c) for c in v) for v in tri))

    if not triangles:
        # Point cloud: sorted unique quantised vertices instead.
        verts = sorted(_vertex_key(positions, v) for v in range(vertex_count))
        joined = "|".join(",".join(str(c) for c in v) for v in verts)
        return _fnv1a64_hex(f"{vertex_count}|0|{joined}")

    triangles.sort()
    return _fnv1a64_hex(f"{vertex_count}|{len(triangles)}|{'|'.join(triangles)}")

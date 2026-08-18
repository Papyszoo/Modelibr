"""
Blender headless script: measure the things about a mesh that only a real geometry pass
can answer, keyed by the geometry hash the rest of the system already uses.

Usage:
    blender -b --python-exit-code 1 -P mesh_analysis.py -- --input model.glb

Answers, per mesh:

  * **uv-overlap** - what fraction of the UV layout sits under another face. The number
    that decides whether a bake is even meaningful: bake onto a layout where two faces
    share the same texels and each overwrites the other.
  * **texel-density** - UV area per unit of world surface area, plus what that comes to in
    pixels per metre at a few common map sizes. Two assets in one scene at wildly
    different densities is the thing that reads as "one of these looks cheap".
  * **surface-area** - exact world-space area, which no bounding box can approximate.
  * **manifold** - whether the mesh is watertight and consistently wound.

Protocol with the worker, matching uv_unwrap.py and bake_textures.py:
  MESH_ANALYSIS_ERROR:  <message>   on stderr, exit 1
  MESH_ANALYSIS_RESULT: <json>      on stdout
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geometry_hash import GEOMETRY_HASH_VERSION, hash_geometry  # noqa: E402


def fail(message):
    print(f"MESH_ANALYSIS_ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def script_args():
    argv = sys.argv
    separator = argv.index("--") if "--" in argv else -1
    return argv[separator + 1:] if separator != -1 else []


def parse_args():
    args = script_args()
    parsed = {"input": None, "overlap_samples": 512}

    index = 0
    while index < len(args):
        flag = args[index]
        if index + 1 >= len(args):
            fail(f"Missing value for {flag}")
        value = args[index + 1]
        index += 2
        if flag == "--input":
            parsed["input"] = value
        elif flag == "--overlap-samples":
            parsed["overlap_samples"] = int(value)
        else:
            fail(f"Unknown argument {flag}")

    if not parsed["input"]:
        fail("No --input path provided.")
    return parsed


def import_model(path):
    """Import by extension into the current (empty) scene. Mirrors the other scripts."""
    if not os.path.exists(path):
        fail(f"Input file does not exist: {path}")

    extension = os.path.splitext(path)[1].lower()
    try:
        if extension in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=path)
        elif extension == ".fbx":
            bpy.ops.import_scene.fbx(filepath=path)
        elif extension == ".obj":
            if hasattr(bpy.ops.wm, "obj_import"):
                bpy.ops.wm.obj_import(filepath=path)
            else:
                bpy.ops.import_scene.obj(filepath=path)
        elif extension == ".stl":
            if hasattr(bpy.ops.wm, "stl_import"):
                bpy.ops.wm.stl_import(filepath=path)
            else:
                bpy.ops.import_mesh.stl(filepath=path)
        elif extension == ".dae":
            bpy.ops.wm.collada_import(filepath=path)
        elif extension == ".blend":
            bpy.ops.wm.open_mainfile(filepath=path)
        else:
            fail(f"Cannot analyse a {extension or 'file with no extension'}: no importer for it.")
    except RuntimeError as exc:
        fail(f"Import failed: {exc}")


def gltf_positions(mesh):
    """
    Vertex positions in the axis convention three.js read, which is the one the stored
    geometry hash was computed in.

    The glTF importer converts Y-up to Z-up, so this undoes it: glTF (x, y, z) is Blender
    (x, z, -y). Hashing Blender's own coordinates would produce a hash that is internally
    consistent and matches nothing in the cache.
    """
    positions = []
    for vertex in mesh.vertices:
        positions.extend((vertex.co.x, vertex.co.z, -vertex.co.y))
    return positions


def triangle_indices(mesh):
    mesh.calc_loop_triangles()
    indices = []
    for triangle in mesh.loop_triangles:
        indices.extend(triangle.vertices)
    return indices


def triangle_area_2d(a, b, c):
    return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * 0.5


def uv_triangles(mesh, layer):
    """The UV-space triangles of a mesh, as (u,v) tuples per corner."""
    uvs = layer.uv
    result = []
    for triangle in mesh.loop_triangles:
        result.append(tuple(tuple(uvs[loop].vector) for loop in triangle.loops))
    return result


def overlap_fraction(triangles, samples):
    """
    Fraction of UV area covered by more than one triangle.

    Measured by rasterising onto a `samples` x `samples` grid rather than by testing every
    triangle pair: pairwise is O(n^2) and a 60k-triangle asset makes that hours. The grid
    answers the question actually being asked - "is this layout safe to bake onto" - and
    its error is bounded by one cell, which at 512 is 0.2% of the square.

    Triangles outside the 0-1 square are counted as overlapping: a tiling layout cannot be
    baked onto either, and reporting it as clean would be the more damaging error.
    """
    if not triangles:
        return 0.0, 0.0

    counts = {}
    total_cells = 0
    outside = 0

    for tri in triangles:
        us = [c[0] for c in tri]
        vs = [c[1] for c in tri]
        if min(us) < -1e-6 or max(us) > 1 + 1e-6 or min(vs) < -1e-6 or max(vs) > 1 + 1e-6:
            outside += 1

        # Cell-centre coverage over the triangle's bounding box, which is enough for an
        # area fraction and far cheaper than an exact scanline fill.
        u0 = max(0, int(min(us) * samples))
        u1 = min(samples - 1, int(max(us) * samples))
        v0 = max(0, int(min(vs) * samples))
        v1 = min(samples - 1, int(max(vs) * samples))
        if u1 < u0 or v1 < v0:
            continue

        for cell_v in range(v0, v1 + 1):
            for cell_u in range(u0, u1 + 1):
                point = ((cell_u + 0.5) / samples, (cell_v + 0.5) / samples)
                if point_in_triangle(point, tri):
                    key = cell_v * samples + cell_u
                    counts[key] = counts.get(key, 0) + 1
                    total_cells += 1

    covered = len(counts)
    if covered == 0:
        return 0.0, (outside / len(triangles)) if triangles else 0.0

    overlapped = sum(1 for c in counts.values() if c > 1)
    return overlapped / covered, outside / len(triangles)


def point_in_triangle(p, tri):
    (ax, ay), (bx, by), (cx, cy) = tri[0], tri[1], tri[2]
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-12:
        return False
    a = ((by - cy) * (p[0] - cx) + (cx - bx) * (p[1] - cy)) / d
    b = ((cy - ay) * (p[0] - cx) + (ax - cx) * (p[1] - cy)) / d
    c = 1 - a - b
    return a >= 0 and b >= 0 and c >= 0


def analyse(obj, options):
    mesh = obj.data
    mesh.calc_loop_triangles()

    positions = gltf_positions(mesh)
    geometry_hash = hash_geometry(positions, triangle_indices(mesh))
    if geometry_hash is None:
        return None

    # World-space area, with the object's scale applied - a mesh scaled 100x in the scene
    # has 10,000x the surface, and texel density is meaningless without it.
    matrix = obj.matrix_world
    world_area = 0.0
    for triangle in mesh.loop_triangles:
        a, b, c = (matrix @ mesh.vertices[i].co for i in triangle.vertices)
        world_area += (b - a).cross(c - a).length * 0.5

    layer = mesh.uv_layers.active or (mesh.uv_layers[0] if mesh.uv_layers else None)
    uv_area = 0.0
    overlap = None
    outside = None
    if layer is not None:
        triangles = uv_triangles(mesh, layer)
        for tri in triangles:
            uv_area += triangle_area_2d(*tri)
        overlap, outside = overlap_fraction(triangles, options["overlap_samples"])

    result = {
        "object": obj.name,
        "geometryHash": geometry_hash,
        "geometryHashVersion": GEOMETRY_HASH_VERSION,
        "surfaceArea": round(world_area, 6),
        "triangleCount": len(mesh.loop_triangles),
        "manifold": is_manifold(mesh),
    }

    if layer is None:
        result["uvOverlap"] = None
        result["texelDensity"] = None
        result["note"] = "The mesh has no UV layout, so neither UV metric has a value."
        return result

    result["uvOverlap"] = {
        "overlappingFraction": round(overlap, 4),
        "outsideUnitSquareFraction": round(outside, 4),
        # The judgement the number exists to support, stated once here rather than
        # re-derived by every caller.
        "bakeable": overlap < 0.01 and outside < 0.01,
        "sampleGrid": options["overlap_samples"],
    }

    if world_area > 0:
        ratio = uv_area / world_area
        result["texelDensity"] = {
            "uvAreaPerSquareMetre": round(ratio, 6),
            "uvCoverage": round(uv_area, 6),
            "pixelsPerMetre": {
                str(size): round((ratio ** 0.5) * size, 2) for size in (512, 1024, 2048, 4096)
            },
        }
    else:
        result["texelDensity"] = None
        result["note"] = "The mesh has no world-space area, so texel density is undefined."

    return result


def is_manifold(mesh):
    """
    Watertight and consistently wound: every edge shared by exactly two faces.

    Reported because it is the difference between a mesh that can be booleaned, thickened
    or 3D-printed and one that only looks solid.
    """
    edge_use = {}
    for polygon in mesh.polygons:
        verts = list(polygon.vertices)
        for i in range(len(verts)):
            a, b = verts[i], verts[(i + 1) % len(verts)]
            key = (a, b) if a < b else (b, a)
            edge_use[key] = edge_use.get(key, 0) + 1

    if not edge_use:
        return {"isManifold": False, "boundaryEdges": 0, "nonManifoldEdges": 0}

    boundary = sum(1 for c in edge_use.values() if c == 1)
    non_manifold = sum(1 for c in edge_use.values() if c > 2)
    return {
        "isManifold": boundary == 0 and non_manifold == 0,
        "boundaryEdges": boundary,
        "nonManifoldEdges": non_manifold,
    }


def main():
    options = parse_args()
    version = ".".join(str(v) for v in bpy.app.version)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model(options["input"])

    meshes = [
        o for o in bpy.context.scene.objects
        if o.type == "MESH" and o.data is not None and len(o.data.polygons) > 0
    ]
    if not meshes:
        fail("The input contains no mesh objects with faces to analyse.")

    parts = [r for r in (analyse(o, options) for o in meshes) if r is not None]
    if not parts:
        fail("No mesh produced a geometry hash, so nothing can be cached.")

    print(
        f"MESH_ANALYSIS_RESULT: {json.dumps({'parts': parts, 'blenderVersion': version})}",
        flush=True,
    )


if __name__ == "__main__":
    main()

"""
Importing a library model into an empty Blender scene, shared by every operation script.

There was one of these per script, and the copies had drifted. `mesh_analysis.py`'s had
lost the `enable_addon` calls, so it depended on the glTF and FBX addons already being
enabled in whatever build ran it, and it had lost the guard that catches a `.blend` Blender
refused to open - which loads the startup scene instead of failing, so the operation would
have measured a default cube and reported success. One copy, and a fourth script to write,
is what made the drift worth removing rather than repeating.

Each script keeps its own `fail`: the worker reads a `<PREFIX>_ERROR:` line to learn why an
operation failed, and the prefix names the operation. So `fail` is passed in rather than
imported.
"""

import os

import bpy

#: Extensions `import_model` can read, for an error message that lists them.
SUPPORTED_INPUTS = (".glb", ".gltf", ".fbx", ".obj", ".stl", ".dae", ".blend")


def enable_addon(module, operator_owner, operator_name, fail):
    """Enable an importer/exporter addon if its operator is not already present."""
    if hasattr(operator_owner, operator_name):
        return
    try:
        import addon_utils

        addon_utils.enable(module, default_set=True, persistent=True)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not enable the {module} addon: {exc}")
    if not hasattr(operator_owner, operator_name):
        fail(f"{module} is unavailable in this Blender build.")


def import_model(path, fail, verb="read"):
    """
    Import the input file by extension into the current (empty) scene.

    `verb` is what the calling operation does, so the "no importer for it" message names
    the operation rather than this module.
    """
    if not os.path.exists(path):
        fail(f"Input file does not exist: {path}")

    extension = os.path.splitext(path)[1].lower()

    try:
        if extension in (".glb", ".gltf"):
            enable_addon("io_scene_gltf2", bpy.ops.import_scene, "gltf", fail)
            bpy.ops.import_scene.gltf(filepath=path)
        elif extension == ".fbx":
            enable_addon("io_scene_fbx", bpy.ops.import_scene, "fbx", fail)
            bpy.ops.import_scene.fbx(filepath=path)
        elif extension == ".obj":
            # Blender 4.x ships the fast C++ importer as wm.obj_import; 3.x has
            # import_scene.obj. Prefer whichever this build actually has.
            if hasattr(bpy.ops.wm, "obj_import"):
                bpy.ops.wm.obj_import(filepath=path)
            else:
                enable_addon("io_scene_obj", bpy.ops.import_scene, "obj", fail)
                bpy.ops.import_scene.obj(filepath=path)
        elif extension == ".stl":
            if hasattr(bpy.ops.wm, "stl_import"):
                bpy.ops.wm.stl_import(filepath=path)
            else:
                enable_addon("io_mesh_stl", bpy.ops.import_mesh, "stl", fail)
                bpy.ops.import_mesh.stl(filepath=path)
        elif extension == ".dae":
            bpy.ops.wm.collada_import(filepath=path)
        elif extension == ".blend":
            bpy.ops.wm.open_mainfile(filepath=path)
            # Blender answers an unreadable .blend by loading the startup scene and
            # returning success, so the only way to notice is that nothing was opened.
            if not bpy.data.filepath:
                fail("Input .blend did not load - Blender fell back to the startup scene.")
        else:
            fail(
                f"Cannot {verb} a {extension or 'file with no extension'}: no importer for it. "
                f"Supported: {', '.join(SUPPORTED_INPUTS)}."
            )
    except RuntimeError as exc:
        fail(f"Import failed: {exc}")


def mesh_objects(with_faces=False):
    """
    Every mesh in the current scene that carries data.

    `with_faces` additionally drops meshes with no polygons, and the two callers want
    opposite things. A BAKE has nothing to render for a faceless mesh, so including one
    only gives Cycles something to fail on. An UNWRAP counts it: "3 unwrapped, 1 skipped
    (no faces)" is the honest report, and filtering it out here would silently shrink the
    denominator instead.
    """
    return [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH"
        and o.data is not None
        and (not with_faces or len(o.data.polygons) > 0)
    ]

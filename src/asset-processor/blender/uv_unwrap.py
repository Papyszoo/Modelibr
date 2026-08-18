"""
Blender headless script: generate a UV layout for a model and write it out as GLB.

Usage:
    blender -b --python-exit-code 1 -P uv_unwrap.py -- \
        --input model.glb --output unwrapped.glb \
        [--method smart|angle] [--angle-limit 66] [--island-margin 0.02] \
        [--channel-name UVMap] [--lightmap]

Runs against an EMPTY scene and imports the input, rather than opening it: the input is
usually not a .blend, and opening a file Blender cannot read silently loads the startup
scene instead of failing (see export_glb.py, which learned this the hard way).

Protocol with the worker, matching export_glb.py:
  UV_UNWRAP_ERROR:  <message>   on stderr, exit 1 - the precise reason for the failure
  UV_UNWRAP_RESULT: <json>      on stdout        - what was unwrapped, for the job result
"""

import json
import math
import os
import sys

import bpy


def fail(message):
    """Print a clearly-marked error line and exit non-zero."""
    print(f"UV_UNWRAP_ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def script_args():
    argv = sys.argv
    separator = argv.index("--") if "--" in argv else -1
    return argv[separator + 1:] if separator != -1 else []


def parse_args():
    args = script_args()
    parsed = {
        "input": None,
        "output": None,
        "method": "smart",
        "angle_limit": 66.0,
        "island_margin": 0.02,
        "channel_name": "UVMap",
        "lightmap": False,
    }

    index = 0
    while index < len(args):
        flag = args[index]
        if flag == "--lightmap":
            parsed["lightmap"] = True
            index += 1
            continue

        if index + 1 >= len(args):
            fail(f"Missing value for {flag}")
        value = args[index + 1]
        index += 2

        if flag == "--input":
            parsed["input"] = value
        elif flag == "--output":
            parsed["output"] = value
        elif flag == "--method":
            parsed["method"] = value.lower()
        elif flag == "--angle-limit":
            parsed["angle_limit"] = float(value)
        elif flag == "--island-margin":
            parsed["island_margin"] = float(value)
        elif flag == "--channel-name":
            parsed["channel_name"] = value
        else:
            fail(f"Unknown argument {flag}")

    if not parsed["input"]:
        fail("No --input path provided.")
    if not parsed["output"]:
        fail("No --output path provided.")
    if parsed["method"] not in ("smart", "angle"):
        fail(f"Unknown --method {parsed['method']}; expected 'smart' or 'angle'.")

    return parsed


def enable_addon(module, operator_owner, operator_name):
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


def import_model(path):
    """Import the input file by extension into the current (empty) scene."""
    if not os.path.exists(path):
        fail(f"Input file does not exist: {path}")

    extension = os.path.splitext(path)[1].lower()

    if extension in (".glb", ".gltf"):
        enable_addon("io_scene_gltf2", bpy.ops.import_scene, "gltf")
        bpy.ops.import_scene.gltf(filepath=path)
    elif extension == ".fbx":
        enable_addon("io_scene_fbx", bpy.ops.import_scene, "fbx")
        bpy.ops.import_scene.fbx(filepath=path)
    elif extension == ".obj":
        # Blender 4.x ships the fast C++ importer as wm.obj_import; 3.x has
        # import_scene.obj. Prefer whichever this build actually has.
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            enable_addon("io_scene_obj", bpy.ops.import_scene, "obj")
            bpy.ops.import_scene.obj(filepath=path)
    elif extension == ".stl":
        if hasattr(bpy.ops.wm, "stl_import"):
            bpy.ops.wm.stl_import(filepath=path)
        else:
            enable_addon("io_mesh_stl", bpy.ops.import_mesh, "stl")
            bpy.ops.import_mesh.stl(filepath=path)
    elif extension == ".dae":
        bpy.ops.wm.collada_import(filepath=path)
    elif extension == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
        if not bpy.data.filepath:
            fail("Input .blend did not load - Blender fell back to the startup scene.")
    else:
        fail(
            f"Cannot unwrap a {extension or 'file with no extension'}: no importer for it. "
            "Supported: .glb, .gltf, .fbx, .obj, .stl, .dae, .blend."
        )


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data is not None]


def target_uv_layer(mesh, channel_name, lightmap):
    """
    Pick the UV layer the unwrap writes into, creating it when it is not there.

    A lightmap gets its own channel and must not disturb the first: the first is what a
    texture samples, and a lightmap layout is optimised for something else entirely
    (no overlap, every face given its own space). A plain unwrap replaces the layer of
    that name if the model has one, because that is the layout being regenerated.
    """
    layers = mesh.uv_layers

    existing = layers.get(channel_name)
    if existing is not None:
        return existing, False

    if lightmap and len(layers) == 0:
        # Nothing to preserve, so a "second" channel would be the only one - and a
        # renderer sampling the first would then read the lightmap layout as a texture
        # layout. Give it a base channel first.
        layers.new(name="UVMap")

    created = layers.new(name=channel_name)
    if created is None:
        raise RuntimeError(
            f"Blender refused to add UV channel '{channel_name}' - the mesh is at its channel limit (8)."
        )
    return created, True


def unwrap_object(obj, options):
    """
    Unwrap one mesh object into the target channel.

    Returns (channel name, channel index) - the index being the half that survives export.
    GLB stores UV sets positionally as TEXCOORD_0, TEXCOORD_1, ...; the names are Blender's
    own and are gone the moment the file is written, which is why the result reports both
    and a consumer binding a lightmap must look at the index.
    """
    mesh = obj.data

    if len(mesh.polygons) == 0:
        return None, None  # nothing to lay out; caller counts it as skipped

    layer, _ = target_uv_layer(mesh, options["channel_name"], options["lightmap"])
    # Hold the NAME, not the layer. Entering and leaving edit mode rebuilds the mesh's
    # collections, and the reference taken here does not survive it - reading .name off it
    # afterwards returns an empty string, and looking it up by identity fails outright.
    layer_name = layer.name
    mesh.uv_layers.active = layer

    # A lightmap channel must not become what textures sample. Blender marks exactly one
    # layer active_render, and a newly added one can take that flag.
    if options["lightmap"]:
        for candidate in mesh.uv_layers:
            candidate.active_render = candidate.name != options["channel_name"]

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        if options["method"] == "smart":
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(options["angle_limit"]),
                island_margin=options["island_margin"],
                correct_aspect=True,
                scale_to_bounds=False,
            )
        else:
            bpy.ops.uv.unwrap(
                method="ANGLE_BASED",
                margin=options["island_margin"],
            )
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")

    return layer_name, mesh.uv_layers.find(layer_name)


def export_glb(path):
    enable_addon("io_scene_gltf2", bpy.ops.export_scene, "gltf")
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB")
    if not os.path.exists(path):
        fail("Export finished but the output file is missing.")


def main():
    options = parse_args()

    version = ".".join(str(v) for v in bpy.app.version)
    print(
        f"uv_unwrap: Blender {version}, method {options['method']}, "
        f"channel {options['channel_name']}",
        flush=True,
    )

    # Empty scene: no default cube to export alongside the model.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    import_model(options["input"])

    meshes = mesh_objects()
    if not meshes:
        fail("The input contains no mesh objects to unwrap.")

    unwrapped = 0
    skipped = []
    seams_missing = 0
    channel_indices = set()

    for obj in meshes:
        if options["method"] == "angle" and not any(edge.use_seam for edge in obj.data.edges):
            seams_missing += 1
        try:
            channel, index = unwrap_object(obj, options)
        except Exception as exc:  # noqa: BLE001
            skipped.append({"object": obj.name, "reason": str(exc)})
            continue

        if channel is None:
            skipped.append({"object": obj.name, "reason": "no faces"})
        else:
            unwrapped += 1
            channel_indices.add(index)

    if unwrapped == 0:
        fail(
            "Nothing could be unwrapped: "
            + (json.dumps(skipped) if skipped else "no mesh had any faces.")
        )

    export_glb(options["output"])

    result = {
        "meshesUnwrapped": unwrapped,
        "meshesSkipped": skipped,
        "channelName": options["channel_name"],
        # The exported file identifies UV sets by position (TEXCOORD_0, TEXCOORD_1, ...) and
        # drops Blender's names, so this is what a consumer can actually bind to. More than
        # one entry means the meshes disagreed - some already had channels others did not.
        "channelIndices": sorted(channel_indices),
        "method": options["method"],
        "blenderVersion": version,
        "outputSizeBytes": os.path.getsize(options["output"]),
    }
    # Angle-based unwrap follows seams the author marked. On a mesh with none it produces
    # one stretched island, which looks like a working unwrap and is not one - so say so
    # rather than reporting a clean success.
    if seams_missing:
        result["warning"] = (
            f"{seams_missing} of {len(meshes)} meshes had no marked seams, so angle-based "
            "unwrap produced a single island for each. Use method 'smart' for models "
            "without authored seams."
        )

    print(f"UV_UNWRAP_RESULT: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    main()

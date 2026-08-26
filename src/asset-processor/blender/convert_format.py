"""
Blender headless script: convert a model to another file format.

Usage:
    blender -b --python-exit-code 1 -P convert_format.py -- \
        --input model.fbx --output converted.glb --format glb

Runs against an EMPTY scene and imports the input rather than opening it, for the reason
model_io explains.

Only single-file targets are supported - glb, fbx, stl - and that is a property of what
the result becomes: the converted file is uploaded as a new model version, and a version
is one file. `.obj` keeps its materials in a sidecar `.mtl`, and `.gltf` keeps its geometry
in a sidecar `.bin`; both would arrive stripped of everything the sidecar held. glTF's
single-file form is GLB, which is offered. The self-contained `GLTF_EMBEDDED` variant is
NOT a way around this: Blender deprecated it and 5.x has removed it outright
(`export_format` now offers only GLB and GLTF_SEPARATE), so a `gltf` target would work on
one user's Blender and fail on another's. Both are refused by the backend validator, which
names the reason.

Protocol with the worker, matching the other operation scripts:
  CONVERT_FORMAT_ERROR:  <message>   on stderr, exit 1
  CONVERT_FORMAT_RESULT: <json>      on stdout
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_io import enable_addon, import_model, mesh_objects  # noqa: E402

#: Target format -> what that format cannot carry, said plainly. A conversion that
#: silently drops the rig is worse than one that says it did.
LOSSES = {
    "glb": None,
    "fbx": None,
    "stl": (
        "STL carries geometry only - materials, UVs, rigs, animation and object names "
        "are not in the output."
    ),
}


def fail(message):
    """Print a clearly-marked error line and exit non-zero."""
    print(f"CONVERT_FORMAT_ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def script_args():
    argv = sys.argv
    separator = argv.index("--") if "--" in argv else -1
    return argv[separator + 1:] if separator != -1 else []


def export_glb(path):
    enable_addon("io_scene_gltf2", bpy.ops.export_scene, "gltf", fail)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB")


def export_fbx(path):
    enable_addon("io_scene_fbx", bpy.ops.export_scene, "fbx", fail)
    # COPY + embed keeps the textures inside the one file the version will hold. Without
    # it FBX writes references to the temp directory this job is about to delete.
    bpy.ops.export_scene.fbx(filepath=path, path_mode="COPY", embed_textures=True)


def export_stl(path):
    if hasattr(bpy.ops.wm, "stl_export"):
        bpy.ops.wm.stl_export(filepath=path)
    else:
        enable_addon("io_mesh_stl", bpy.ops.export_mesh, "stl", fail)
        bpy.ops.export_mesh.stl(filepath=path)


EXPORTERS = {
    "glb": export_glb,
    "fbx": export_fbx,
    "stl": export_stl,
}


def parse_args():
    args = script_args()
    parsed = {"input": None, "output": None, "format": None}

    index = 0
    while index < len(args):
        flag = args[index]
        if index + 1 >= len(args):
            fail(f"Missing value for {flag}")
        value = args[index + 1]
        index += 2

        if flag == "--input":
            parsed["input"] = value
        elif flag == "--output":
            parsed["output"] = value
        elif flag == "--format":
            parsed["format"] = value.strip().lower().lstrip(".")
        else:
            fail(f"Unknown argument {flag}")

    if not parsed["input"]:
        fail("No --input path provided.")
    if not parsed["output"]:
        fail("No --output path provided.")
    if parsed["format"] not in EXPORTERS:
        fail(
            f"Unknown --format {parsed['format']}; expected one of "
            f"{', '.join(sorted(EXPORTERS))}."
        )

    return parsed


def main():
    options = parse_args()

    version = ".".join(str(v) for v in bpy.app.version)
    print(f"convert_format: Blender {version}, target {options['format']}", flush=True)

    # Empty scene: no default cube exported alongside the model.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    import_model(options["input"], fail, verb="convert")

    # with_faces, because a conversion whose only meshes are loose vertices exports a
    # file with no surface in it - and to STL, which stores triangles and nothing else,
    # an empty one. Reporting success for that is worse than refusing.
    meshes = mesh_objects(with_faces=True)
    if not meshes:
        fail("The input contains no mesh with any faces to convert.")

    directory = os.path.dirname(options["output"])
    if directory:
        os.makedirs(directory, exist_ok=True)

    try:
        EXPORTERS[options["format"]](options["output"])
    except RuntimeError as exc:
        fail(f"Export to {options['format']} failed: {exc}")

    if not os.path.exists(options["output"]):
        fail("Export finished but the output file is missing.")

    result = {
        "format": options["format"],
        "sourceFormat": os.path.splitext(options["input"])[1].lower().lstrip("."),
        "meshCount": len(meshes),
        "blenderVersion": version,
        "inputSizeBytes": os.path.getsize(options["input"]),
        "outputSizeBytes": os.path.getsize(options["output"]),
    }

    loss = LOSSES.get(options["format"])
    if loss:
        result["warning"] = loss

    print(f"CONVERT_FORMAT_RESULT: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    main()

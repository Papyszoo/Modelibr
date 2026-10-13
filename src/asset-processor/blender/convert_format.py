"""
Blender headless script: convert a model to another file format.

Usage:
    blender -b --python-exit-code 1 -P convert_format.py -- \
        --input model.fbx --output converted.glb --format glb [--bake]

Runs against an EMPTY scene and imports the input rather than opening it, for the reason
model_io explains.

`--bake` collapses the rig features a glTF/FBX cannot carry (IK and other constraints,
drivers, shape-key drivers, modifiers stacked on shape-keyed meshes) into keyframes and
applied geometry before the export, via web_bake. It is refused for STL, which carries
geometry only: there would be nothing left for a baked rig to survive in.

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
from web_bake import bake as bake_for_web  # noqa: E402

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

#: Formats a bake can write into. STL is geometry only, so the baked rig would be
#: dropped on the way out - refused rather than silently discarded.
BAKE_TARGETS = ("glb", "fbx")


def fail(message):
    """Print a clearly-marked error line and exit non-zero.

    Single-line on purpose: the worker reads the marked line out of Blender's output, and
    a Blender RuntimeError carries the whole Python traceback. Printed verbatim, everything
    after the first line was dropped, so the reported failure named no actual exception.
    """
    print(
        f"CONVERT_FORMAT_ERROR: {' | '.join(str(message).splitlines())}",
        file=sys.stderr,
        flush=True,
    )
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
    parsed = {"input": None, "output": None, "format": None, "bake": False}

    index = 0
    while index < len(args):
        flag = args[index]
        if flag == "--bake":
            parsed["bake"] = True
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
    if parsed["bake"] and parsed["format"] not in BAKE_TARGETS:
        fail(
            f"Cannot bake to {parsed['format'].upper()}: it carries geometry only, so a "
            f"baked rig (constraints, drivers, shape keys, applied modifiers) would be "
            f"dropped on the way out. Bake to {' or '.join(BAKE_TARGETS)}."
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

    baked = None
    if options["bake"]:
        try:
            baked = bake_for_web()
        except Exception as exc:  # noqa: BLE001
            # Marked, not a traceback: the worker reads the CONVERT_FORMAT_ERROR
            # line and this is the difference between "bake failed: <reason>" and
            # three lines of Blender stack for the operator to decode.
            fail(f"Baking for web failed: {exc}")

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

    if baked is not None:
        result["baked"] = baked

    loss = LOSSES.get(options["format"])
    if loss:
        result["warning"] = loss

    print(f"CONVERT_FORMAT_RESULT: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    main()

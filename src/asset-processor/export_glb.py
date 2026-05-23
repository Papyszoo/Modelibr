"""
Blender headless script to export the active scene as GLB.

Usage:
    blender -b input.blend --python-exit-code 1 -P export_glb.py -- output.glb
"""

import os
import sys
import bpy


def fail(message):
    """Print a clearly-marked error line and exit non-zero.

    The asset-processor scans stdout/stderr for the EXPORT_GLB_ERROR: prefix
    to surface a precise reason on the failed job.
    """
    print(f"EXPORT_GLB_ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def ensure_gltf_addon():
    """Make sure the glTF 2.0 exporter operator is available.

    The exporter ships enabled by default, but a freshly-extracted portable
    Blender with no user config may not have it active — enable it explicitly.
    """
    if hasattr(bpy.ops.export_scene, "gltf"):
        return
    try:
        import addon_utils

        addon_utils.enable("io_scene_gltf2", default_set=True, persistent=True)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not enable the glTF exporter addon: {exc}")
    if not hasattr(bpy.ops.export_scene, "gltf"):
        fail("glTF exporter operator (export_scene.gltf) is unavailable in this Blender build.")


def main():
    # Arguments after "--" are passed to the script
    argv = sys.argv
    separator_index = argv.index("--") if "--" in argv else -1
    if separator_index == -1 or separator_index + 1 >= len(argv):
        fail("No output path provided. Usage: blender -b input.blend -P export_glb.py -- output.glb")

    output_path = argv[separator_index + 1]

    version = ".".join(str(v) for v in bpy.app.version)
    print(f"export_glb: Blender {version}, target {output_path}", flush=True)

    # When Blender cannot read the input .blend it does NOT abort — it silently
    # loads the default startup scene (the default cube) and still exits 0.
    # bpy.data.filepath is empty in that case; detect it so the job fails loudly
    # instead of producing a bogus default-cube export.
    if not bpy.data.filepath:
        fail("Input .blend did not load — Blender fell back to the default startup "
             "scene. The uploaded file is missing, truncated, corrupt, or saved by "
             "a newer Blender than the installed CLI can read.")

    scene_objects = list(bpy.context.scene.objects)
    mesh_objects = [o for o in scene_objects if o.type == "MESH"]
    print(f"export_glb: loaded {bpy.data.filepath} — "
          f"{len(scene_objects)} object(s), {len(mesh_objects)} mesh(es)", flush=True)
    if not mesh_objects:
        fail("Loaded .blend has no mesh objects in the active scene — nothing to export.")

    ensure_gltf_addon()

    # Build export kwargs compatible with Blender 3.x and 4.x+/5.x
    kwargs = {
        "filepath": output_path,
        "export_format": "GLB",
        "export_animations": True,
        "export_image_format": "AUTO",
        "export_materials": "EXPORT",
    }

    # Blender 4.0+ renamed export_apply_modifiers -> export_apply
    if bpy.app.version >= (4, 0, 0):
        kwargs["export_apply"] = True
    else:
        kwargs["export_apply_modifiers"] = True

    try:
        result = bpy.ops.export_scene.gltf(**kwargs)
    except TypeError as exc:
        # A keyword unrecognized by this Blender version — retry with the
        # minimal, universally-supported argument set rather than failing.
        print(f"export_glb: retrying with minimal args ({exc})", flush=True)
        try:
            result = bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB")
        except Exception as retry_exc:  # noqa: BLE001
            fail(f"glTF exporter call failed: {retry_exc}")
    except Exception as exc:  # noqa: BLE001
        fail(f"glTF exporter call failed: {exc}")

    if "FINISHED" not in result:
        fail(f"glTF exporter did not finish (operator result: {result}).")

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        fail("glTF exporter reported success but no non-empty .glb file was written.")

    print(f"GLB exported to: {output_path} ({os.path.getsize(output_path)} bytes)", flush=True)


if __name__ == "__main__":
    main()

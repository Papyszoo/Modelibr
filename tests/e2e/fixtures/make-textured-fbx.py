"""
Generates tests/e2e/assets/textured-cube.fbx: a tiny binary FBX carrying a
UV-mapped cube and a small EMBEDDED base-colour texture.

The repo's other FBX fixtures (test-cone/cylinder/icosphere/torus.fbx) reference
no image at all, so they cannot exercise "the viewer applies an FBX's texture".
This one is self-contained (the checker image is packed and embedded), which is
what the model-viewer feature asserts.

Reproduce from the repo root:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
        -P tests/e2e/fixtures/make-textured-fbx.py

(Any Blender 4.x/5.x works; the file is committed, so this is authoring-time
only and nothing downloads Blender at test time.)
"""

import os
import shutil

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "assets", "textured-cube.fbx"))
# The folder the exporter copies the texture into before embedding it.
FBM_DIR = os.path.abspath(os.path.join(HERE, "..", "assets", "textured-cube.fbm"))
RESOLUTION = 64


def build_checker_image(name: str) -> "bpy.types.Image":
    """A small two-tone checker, so the texture is visibly a texture."""
    image = bpy.data.images.new(name, width=RESOLUTION, height=RESOLUTION)
    pixels = [0.0] * (RESOLUTION * RESOLUTION * 4)
    for y in range(RESOLUTION):
        for x in range(RESOLUTION):
            offset = (y * RESOLUTION + x) * 4
            light = ((x // 8) + (y // 8)) % 2 == 0
            pixels[offset] = 0.85 if light else 0.15
            pixels[offset + 1] = 0.35 if light else 0.65
            pixels[offset + 2] = 0.20 if light else 0.80
            pixels[offset + 3] = 1.0
    image.pixels[:] = pixels
    # A file name with an extension is load-bearing: three.js's FBXLoader picks
    # the embedded image's MIME type from the filename's extension, and a
    # Blender-generated image with no extension is skipped as "unsupported".
    image.file_format = "PNG"
    image.filepath_raw = "//catalog_checker.png"
    # Packing is what lets the FBX exporter embed the image in the binary file.
    image.pack()
    return image


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)

    image = build_checker_image("catalog_checker")

    bpy.ops.mesh.primitive_cube_add(size=1.0)
    cube = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project()
    bpy.ops.object.mode_set(mode="OBJECT")

    material = bpy.data.materials.new("catalog_material")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    cube.data.materials.append(material)

    bpy.ops.export_scene.fbx(
        filepath=OUT,
        use_selection=False,
        path_mode="COPY",
        embed_textures=True,
        batch_mode="OFF",
    )

    scrub_host_path(OUT)
    # The texture is embedded in the FBX's Content property, so the copied
    # sidecar folder is not needed and must not be committed.
    shutil.rmtree(FBM_DIR, ignore_errors=True)
    print("WROTE", OUT, os.path.getsize(OUT), "bytes")


def scrub_host_path(path: str) -> None:
    """
    The FBX Video node's absolute Filename is whatever machine exported it. The
    repo is public, so that path is replaced with a same-length neutral string.
    Length matters: FBX strings are length-prefixed, so the replacement has to
    keep the byte count. three.js reads RelativeFilename (already neutral) and
    the embedded Content, so the absolute value is never used to load.
    """
    absolute = os.path.join(os.path.dirname(path), "textured-cube.fbm", "catalog_checker.png")
    needle = absolute.encode("utf-8")
    prefix = b"/e2e-texture/"
    replacement = prefix + b"x" * (len(needle) - len(prefix))
    with open(path, "rb") as handle:
        data = handle.read()
    if needle in data:
        data = data.replace(needle, replacement)
        with open(path, "wb") as handle:
            handle.write(data)
        print("SCRUBBED host path from FBX")


main()

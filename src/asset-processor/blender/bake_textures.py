"""
Blender headless script: bake surface detail from a model's own materials and geometry
into texture maps.

Usage:
    blender -b --python-exit-code 1 -P bake_textures.py -- \
        --input model.glb --output-dir /tmp/bake-42 \
        --maps diffuse,ao [--resolution 1024] [--samples 32] [--margin 16] \
        [--unwrap] [--island-margin 0.02] [--angle-limit 66] \
        [--output-model rebaked.glb]

Runs against an EMPTY scene and imports the input, for the same reason uv_unwrap.py does:
opening a file Blender cannot read silently loads the startup scene instead of failing.

## The two UV layers, and why there are two

Verified against Blender 5.1.1 rather than assumed:

  * `bpy.ops.object.bake()` writes into the mesh's **active** UV layer.
  * Shader image-texture lookups without an explicit UV Map node read the **active_render**
    UV layer.

Those are two different flags, and pointing them at two different layers is the whole
mechanism behind `--unwrap`: the source material keeps sampling the layout it was authored
for (`active_render`), while the bake lands in a fresh non-overlapping layout (`active`).
That is what turns an atlas-packed asset - one sharing a palette texture with 700 others
across a UV square it only uses 3% of - into a model with its own maps.

## What comes out

One PNG per requested map, in `--output-dir`. With `--unwrap`, also a GLB at
`--output-model` whose **UV0 is the bake layout**: the source layout is deleted after the
bake, because a renderer samples TEXCOORD_0 and the baked maps are laid out for the new
one. The maps encode the source appearance, so the old layout has nothing left to say.

Protocol with the worker, matching uv_unwrap.py and export_glb.py:
  BAKE_TEXTURES_ERROR:  <message>   on stderr, exit 1
  BAKE_TEXTURES_RESULT: <json>      on stdout
"""

import json
import math
import os
import sys

import bpy


# What each map name means to Cycles, and how the result must be interpreted.
#
# `passes` narrows a bake type that would otherwise include lighting: a DIFFUSE bake with
# direct and indirect left on is a lit render, not an albedo map, and binding one as a
# base-colour texture double-lights the model in the viewer.
#
# `non_color` marks the maps whose pixels are data rather than colour. Getting this wrong
# is silent and destructive - an sRGB-tagged normal map is subtly wrong everywhere and
# looks like a bad bake rather than a bad colour space.
MAP_SPECS = {
    "diffuse": {
        "bake_type": "DIFFUSE",
        "passes": {"use_pass_direct": False, "use_pass_indirect": False, "use_pass_color": True},
        "non_color": False,
        "texture_type": "Albedo",
        "needs_material": True,
    },
    "ao": {
        "bake_type": "AO",
        "passes": {},
        "non_color": True,
        "texture_type": "AO",
        "needs_material": False,
    },
    "normal": {
        "bake_type": "NORMAL",
        "passes": {},
        "non_color": True,
        "texture_type": "Normal",
        "needs_material": False,
    },
    "roughness": {
        "bake_type": "ROUGHNESS",
        "passes": {},
        "non_color": True,
        "texture_type": "Roughness",
        "needs_material": True,
    },
    "emissive": {
        "bake_type": "EMIT",
        "passes": {},
        "non_color": False,
        "texture_type": "Emissive",
        "needs_material": True,
    },
    "combined": {
        "bake_type": "COMBINED",
        "passes": {},
        "non_color": False,
        "texture_type": "Albedo",
        "needs_material": True,
    },
}

BAKE_UV_NAME = "UVBake"


def fail(message):
    """Print a clearly-marked error line and exit non-zero."""
    print(f"BAKE_TEXTURES_ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def script_args():
    argv = sys.argv
    separator = argv.index("--") if "--" in argv else -1
    return argv[separator + 1:] if separator != -1 else []


def parse_args():
    args = script_args()
    parsed = {
        "input": None,
        "output_dir": None,
        "output_model": None,
        "maps": ["diffuse", "ao"],
        "resolution": 1024,
        "samples": 32,
        "margin": 16,
        "unwrap": False,
        "island_margin": 0.02,
        "angle_limit": 66.0,
    }

    index = 0
    while index < len(args):
        flag = args[index]
        if flag == "--unwrap":
            parsed["unwrap"] = True
            index += 1
            continue

        if index + 1 >= len(args):
            fail(f"Missing value for {flag}")
        value = args[index + 1]
        index += 2

        if flag == "--input":
            parsed["input"] = value
        elif flag == "--output-dir":
            parsed["output_dir"] = value
        elif flag == "--output-model":
            parsed["output_model"] = value
        elif flag == "--maps":
            parsed["maps"] = [m.strip().lower() for m in value.split(",") if m.strip()]
        elif flag == "--resolution":
            parsed["resolution"] = int(value)
        elif flag == "--samples":
            parsed["samples"] = int(value)
        elif flag == "--margin":
            parsed["margin"] = int(value)
        elif flag == "--island-margin":
            parsed["island_margin"] = float(value)
        elif flag == "--angle-limit":
            parsed["angle_limit"] = float(value)
        else:
            fail(f"Unknown argument {flag}")

    if not parsed["input"]:
        fail("No --input path provided.")
    if not parsed["output_dir"]:
        fail("No --output-dir path provided.")
    if not parsed["maps"]:
        fail("No --maps requested; nothing to bake.")

    unknown = [m for m in parsed["maps"] if m not in MAP_SPECS]
    if unknown:
        fail(
            f"Unknown map(s) {', '.join(unknown)}. "
            f"Known: {', '.join(sorted(MAP_SPECS))}."
        )
    if parsed["unwrap"] and not parsed["output_model"]:
        fail("--unwrap generates a new UV layout, so --output-model is required to write it.")
    if parsed["unwrap"] and not any(m in parsed["maps"] for m in COLOR_MAPS):
        # The new layout replaces the one the source textures were authored for, so those
        # textures cannot survive it. Without a colour map there is nothing to rebuild the
        # material from and the result would be a grey model - a worse asset than the
        # input, produced by an operation that reported success.
        fail(
            "Baking onto a generated layout needs a colour map to rebuild the material from. "
            f"Add 'diffuse' (or 'combined') to --maps, or bake onto the existing layout instead."
        )

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
            f"Cannot bake a {extension or 'file with no extension'}: no importer for it. "
            "Supported: .glb, .gltf, .fbx, .obj, .stl, .dae, .blend."
        )


def mesh_objects():
    return [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.data is not None and len(o.data.polygons) > 0
    ]


def ensure_material(obj):
    """
    Every bake target needs somewhere to put its image node, and that somewhere is a
    material. A mesh with none can still be baked for AO or normals - those read geometry,
    not shading - so give it a plain material rather than refusing.
    """
    if obj.data.materials and any(m is not None for m in obj.data.materials):
        return False

    material = bpy.data.materials.new(f"{obj.name}-bake")
    material.use_nodes = True
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    return True


def prepare_uvs(meshes, options):
    """
    Decide which UV layer the bake writes into, and which one the materials keep sampling.

    Returns (bake layer name, generated?). Without --unwrap the bake goes into the layout
    the model already has, which is right when that layout is a real per-model unwrap and
    wrong when it is an atlas slice - the caller decides, because only the caller knows
    which it is (search's uvStatus answers it).
    """
    if not options["unwrap"]:
        without_uvs = [o.name for o in meshes if len(o.data.uv_layers) == 0]
        if without_uvs:
            fail(
                "These meshes have no UV layout to bake into: "
                + ", ".join(without_uvs[:5])
                + (" and others" if len(without_uvs) > 5 else "")
                + ". Ask for the bake with unwrap enabled, or run generate_uvs first."
            )
        for obj in meshes:
            layers = obj.data.uv_layers
            # active_render is what the material samples; baking into the same layer is
            # exactly what "bake onto the existing layout" means.
            render_layer = next(
                (layer for layer in layers if layer.active_render), layers[0]
            )
            layers.active = render_layer
        return None, False

    # --unwrap: one shared layout across every mesh at once. Smart project packs a
    # multi-object edit-mode selection into ONE UV square, which is what lets every mesh
    # share a single set of baked maps. Unwrapping them one at a time would give each the
    # full square and stack them all on top of each other in the bake.
    for obj in meshes:
        layers = obj.data.uv_layers
        if len(layers) == 0:
            # Nothing to sample from, so the source layout question does not arise.
            layers.new(name="UVMap")
        existing = layers.get(BAKE_UV_NAME)
        bake_layer = existing if existing is not None else layers.new(name=BAKE_UV_NAME)
        if bake_layer is None:
            fail(
                f"Blender refused to add a bake UV channel to '{obj.name}' - "
                "the mesh is at its channel limit (8)."
            )
        layers.active = bake_layer
        # The material must keep reading the layout it was authored for while the bake
        # writes into the new one. These are separate flags; see the module docstring.
        for layer in layers:
            layer.active_render = layer.name != BAKE_UV_NAME

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(options["angle_limit"]),
            island_margin=options["island_margin"],
            correct_aspect=True,
            scale_to_bounds=False,
        )
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")

    return BAKE_UV_NAME, True


def bake_target_nodes(meshes, image):
    """
    Point every material at the image being baked, and hand back the nodes so they can be
    removed again. Cycles bakes into the ACTIVE image-texture node of each material, so a
    material left unprepared silently contributes nothing.
    """
    created = []
    for obj in meshes:
        for material in obj.data.materials:
            if material is None:
                continue
            if not material.use_nodes:
                material.use_nodes = True
            nodes = material.node_tree.nodes
            node = nodes.new("ShaderNodeTexImage")
            node.image = image
            node.select = True
            nodes.active = node
            created.append((material, node))
    return created


def clear_bake_targets(created):
    for material, node in created:
        try:
            material.node_tree.nodes.remove(node)
        except Exception:  # noqa: BLE001
            pass


def configure_scene(options):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = options["samples"]
    # CPU, explicitly. The worker is a container that may have no GPU at all, and Cycles
    # falling back mid-run is slower to discover than choosing CPU up front.
    scene.cycles.device = "CPU"
    scene.render.bake.margin = options["margin"]
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"


def bake_one(meshes, name, options, output_dir):
    """
    Bake a single map and write it out.

    One image at a time, freed before the next: a 4K RGBA float buffer is 268 MB, and the
    asset-processor container is capped at 4G. Holding six of them alongside the geometry
    is how this operation gets the container killed rather than failing honestly.
    """
    spec = MAP_SPECS[name]
    scene = bpy.context.scene

    image = bpy.data.images.new(
        f"bake-{name}",
        width=options["resolution"],
        height=options["resolution"],
        float_buffer=False,
        is_data=spec["non_color"],
    )
    image.colorspace_settings.name = "Non-Color" if spec["non_color"] else "sRGB"

    created = bake_target_nodes(meshes, image)
    try:
        for flag in ("use_pass_direct", "use_pass_indirect", "use_pass_color"):
            if flag in spec["passes"]:
                setattr(scene.render.bake, flag, spec["passes"][flag])

        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]

        bpy.ops.object.bake(type=spec["bake_type"])

        path = os.path.join(output_dir, f"{name}.png")
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        if not os.path.exists(path):
            raise RuntimeError("the bake finished but no file was written")

        return {
            "map": name,
            "textureType": spec["texture_type"],
            "fileName": f"{name}.png",
            "path": path,
            "sizeBytes": os.path.getsize(path),
            "colorSpace": "non-color" if spec["non_color"] else "srgb",
        }
    finally:
        clear_bake_targets(created)
        bpy.data.images.remove(image)


COLOR_MAPS = ("diffuse", "combined")


def metallic_materials(meshes):
    """
    Names the materials whose metalness a rebake cannot carry across.

    Cycles has no metallic bake pass, so a rebuilt material gets metallic 0. On a chrome
    or gold asset that is a visible downgrade, and it is worth saying out loud rather than
    letting the user find it in the viewer.
    """
    seen = set()
    for obj in meshes:
        for material in obj.data.materials:
            if material is None or material.node_tree is None:
                continue
            for node in material.node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                socket = node.inputs.get("Metallic")
                if socket is not None and not socket.is_linked and socket.default_value > 0.01:
                    seen.add(material.name)
    return sorted(seen)


def load_baked_image(entry):
    """Load a written map back in as a packed image, with the colour space it was baked in."""
    image = bpy.data.images.load(entry["path"])
    image.colorspace_settings.name = (
        "Non-Color" if entry["colorSpace"] == "non-color" else "sRGB"
    )
    image.pack()
    return image


def rewire_materials(meshes, baked):
    """
    Rebuild every material around the baked maps.

    Not optional, and not tidiness. Removing the source UV layout invalidates every image
    texture that was sampling it: left alone, the exported model reads its original atlas
    through the new layout and renders as noise - and because creating the version kicks
    off the ordinary extraction pass, that noise becomes its thumbnail. The maps are packed
    into the GLB so the new version stands on its own, whether or not anything binds the
    texture set this operation also produces.

    AO is deliberately not wired in: glTF carries occlusion outside the Principled node,
    and the viewer applies it from the bound texture set anyway.
    """
    by_map = {entry["map"]: entry for entry in baked}
    images = {name: load_baked_image(entry) for name, entry in by_map.items() if name != "ao"}

    for obj in meshes:
        for index, material in enumerate(obj.data.materials):
            if material is None:
                material = bpy.data.materials.new(f"{obj.name}-baked")
                obj.data.materials[index] = material
            if material.node_tree is None:
                material.use_nodes = True

            nodes = material.node_tree.nodes
            links = material.node_tree.links
            nodes.clear()

            output = nodes.new("ShaderNodeOutputMaterial")
            bsdf = nodes.new("ShaderNodeBsdfPrincipled")
            links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

            color_image = images.get("diffuse") or images.get("combined")
            if color_image is not None:
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = color_image
                links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

            if "roughness" in images:
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = images["roughness"]
                links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

            if "normal" in images:
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = images["normal"]
                normal_map = nodes.new("ShaderNodeNormalMap")
                links.new(tex.outputs["Color"], normal_map.inputs["Color"])
                links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

            if "emissive" in images:
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = images["emissive"]
                emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
                if emission is not None:
                    links.new(tex.outputs["Color"], emission)
                strength = bsdf.inputs.get("Emission Strength")
                if strength is not None:
                    strength.default_value = 1.0


def export_glb(path, meshes, bake_layer_name):
    """
    Write the re-laid-out model.

    The source UV layout is removed first so the bake layout becomes TEXCOORD_0. A renderer
    samples the first UV set, and these baked maps are laid out for the new one - leaving
    the old layout in front of it would render the model through coordinates its textures
    no longer match, which is the exact failure the bake exists to fix.
    """
    for obj in meshes:
        layers = obj.data.uv_layers
        doomed = [layer.name for layer in layers if layer.name != bake_layer_name]
        for layer_name in doomed:
            layer = layers.get(layer_name)
            if layer is not None:
                layers.remove(layer)
        remaining = layers.get(bake_layer_name)
        if remaining is not None:
            remaining.active_render = True
            layers.active = remaining

    enable_addon("io_scene_gltf2", bpy.ops.export_scene, "gltf")
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB")
    if not os.path.exists(path):
        fail("Export finished but the output model is missing.")


def main():
    options = parse_args()

    version = ".".join(str(v) for v in bpy.app.version)
    print(
        f"bake_textures: Blender {version}, maps {','.join(options['maps'])}, "
        f"{options['resolution']}px, {options['samples']} samples, "
        f"unwrap={options['unwrap']}",
        flush=True,
    )

    os.makedirs(options["output_dir"], exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model(options["input"])

    meshes = mesh_objects()
    if not meshes:
        fail("The input contains no mesh objects with faces to bake.")

    materials_added = sum(1 for obj in meshes if ensure_material(obj))
    bake_layer_name, generated = prepare_uvs(meshes, options)
    configure_scene(options)

    warnings = []
    if materials_added and any(MAP_SPECS[m]["needs_material"] for m in options["maps"]):
        warnings.append(
            f"{materials_added} of {len(meshes)} meshes had no material, so the maps that "
            "read shading (diffuse, roughness, emissive, combined) baked Blender's default "
            "grey for them. AO and normal are unaffected - they read geometry."
        )
    metallic = metallic_materials(meshes) if options["unwrap"] else []
    if metallic:
        warnings.append(
            f"{len(metallic)} material(s) use metalness, which Cycles has no bake pass for, "
            "so the rebuilt material renders them as non-metal. Affected: "
            + ", ".join(metallic[:3])
            + ("..." if len(metallic) > 3 else "")
            + "."
        )
    if not generated and len(meshes) > 1:
        warnings.append(
            f"Baking {len(meshes)} meshes onto their existing UV layouts and into one shared "
            "image. If those layouts each use the full 0-1 square they overlap, and the maps "
            "will show the meshes on top of each other. Ask for unwrap to give them one "
            "shared layout instead."
        )

    baked = []
    for name in options["maps"]:
        try:
            baked.append(bake_one(meshes, name, options, options["output_dir"]))
        except Exception as exc:  # noqa: BLE001
            fail(f"Baking the {name} map failed: {exc}")

    result = {
        "maps": baked,
        "resolution": options["resolution"],
        "samples": options["samples"],
        "margin": options["margin"],
        "meshesBaked": len(meshes),
        "unwrapped": generated,
        "blenderVersion": version,
    }

    if generated:
        rewire_materials(meshes, baked)
        export_glb(options["output_model"], meshes, bake_layer_name)
        result["outputModel"] = options["output_model"]
        result["outputModelSizeBytes"] = os.path.getsize(options["output_model"])
        # The layout the maps are for is now the only one on the mesh, so it exports as
        # TEXCOORD_0. Reported as an index because names do not survive GLB.
        result["bakeUvChannelIndex"] = 0

    if warnings:
        result["warning"] = " ".join(warnings)

    print(f"BAKE_TEXTURES_RESULT: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    main()

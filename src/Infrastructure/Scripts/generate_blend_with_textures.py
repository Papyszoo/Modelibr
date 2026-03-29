"""
Blender headless script to generate a .blend file from a renderable model file
with PBR material textures applied.

Usage:
    blender -b -P generate_blend_with_textures.py -- \
        --input /path/to/model.glb \
        --output /path/to/output.blend \
        --textures /path/to/textures.json

textures.json format:
{
    "materials": {
        "MaterialName": {
            "albedo": "/path/to/albedo.png",
            "normal": "/path/to/normal.png",
            "roughness": "/path/to/roughness.png",
            "metallic": "/path/to/metallic.png",
            "ao": "/path/to/ao.png",
            "emissive": "/path/to/emissive.png",
            "height": "/path/to/height.png",
            "alpha": "/path/to/alpha.png"
        }
    },
    "default": {
        "albedo": "/path/to/albedo.png",
        ...
    }
}
"""

import sys
import os
import json
import argparse

import bpy
import mathutils


def parse_args():
    """Parse arguments after the '--' separator."""
    argv = sys.argv
    separator_index = argv.index("--") if "--" in argv else -1
    if separator_index == -1:
        print("ERROR: No arguments provided. Use -- to separate Blender args from script args.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Generate .blend from renderable with textures")
    parser.add_argument("--input", required=True, help="Path to the renderable file (.glb, .fbx, .obj, .gltf)")
    parser.add_argument("--output", required=True, help="Path for the output .blend file")
    parser.add_argument("--textures", required=False, help="Path to textures.json mapping file")
    parser.add_argument("--format", required=False, help="File format override (e.g. .fbx, .glb) when input path has no extension")
    return parser.parse_args(argv[separator_index + 1:])


def clear_scene():
    """Remove all default objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Also clear orphan data
    for collection in bpy.data.collections:
        bpy.data.collections.remove(collection)


def import_model(filepath, format_override=None):
    """Import a 3D model based on its file extension or format override."""
    ext = format_override.lower() if format_override else os.path.splitext(filepath)[1].lower()

    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=filepath)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=filepath)
    elif ext == '.obj':
        if bpy.app.version >= (4, 0, 0):
            bpy.ops.wm.obj_import(filepath=filepath)
        else:
            bpy.ops.import_scene.obj(filepath=filepath)
    else:
        print(f"ERROR: Unsupported file format: {ext}")
        sys.exit(1)

    print(f"Imported model from: {filepath}")


def center_objects():
    """Center all imported objects at the world origin, preserving parent-child hierarchy."""
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

    if not mesh_objects:
        print("WARNING: No mesh objects found after import")
        return

    # Calculate combined world-space bounding box across all mesh objects
    all_coords = []
    for obj in mesh_objects:
        bbox_world = [obj.matrix_world @ mathutils.Vector(corner) for corner in obj.bound_box]
        all_coords.extend(bbox_world)

    if not all_coords:
        return

    min_x = min(v.x for v in all_coords)
    max_x = max(v.x for v in all_coords)
    min_y = min(v.y for v in all_coords)
    max_y = max(v.y for v in all_coords)
    min_z = min(v.z for v in all_coords)
    max_z = max(v.z for v in all_coords)

    offset = mathutils.Vector((
        -(min_x + max_x) / 2,
        -(min_y + max_y) / 2,
        -(min_z + max_z) / 2,
    ))

    # Only move root objects (no parent) — children follow automatically
    root_objects = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    for obj in root_objects:
        obj.location += offset

    print(f"Centered {len(mesh_objects)} objects at origin")


def create_pbr_material(mat, textures):
    """
    Set up a Principled BSDF material with PBR texture nodes.

    Args:
        mat: Blender material
        textures: dict with texture type keys ('albedo', 'normal', etc.) and file path values
    """
    loaded_images = []
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Find or create Principled BSDF
    principled = None
    for node in nodes:
        if node.type == 'BSDF_PRINCIPLED':
            principled = node
            break

    if principled is None:
        # Clear all nodes and create fresh setup
        nodes.clear()
        principled = nodes.new(type='ShaderNodeBsdfPrincipled')
        principled.location = (0, 0)

        output = nodes.new(type='ShaderNodeOutputMaterial')
        output.location = (300, 0)
        links.new(principled.outputs['BSDF'], output.inputs['Surface'])

    y_offset = 300
    x_pos = -600

    # Albedo / Base Color
    if 'albedo' in textures and os.path.isfile(textures['albedo']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['albedo'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'sRGB'
        loaded_images.append(img)
        links.new(tex_node.outputs['Color'], principled.inputs['Base Color'])
        y_offset -= 300
        print(f"  Applied albedo: {textures['albedo']}")

    # Normal Map
    if 'normal' in textures and os.path.isfile(textures['normal']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos - 200, y_offset)
        img = bpy.data.images.load(textures['normal'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)

        normal_map = nodes.new(type='ShaderNodeNormalMap')
        normal_map.location = (x_pos, y_offset)
        links.new(tex_node.outputs['Color'], normal_map.inputs['Color'])
        links.new(normal_map.outputs['Normal'], principled.inputs['Normal'])
        y_offset -= 300
        print(f"  Applied normal: {textures['normal']}")

    # Roughness
    if 'roughness' in textures and os.path.isfile(textures['roughness']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['roughness'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)
        links.new(tex_node.outputs['Color'], principled.inputs['Roughness'])
        y_offset -= 300
        print(f"  Applied roughness: {textures['roughness']}")

    # Metallic
    if 'metallic' in textures and os.path.isfile(textures['metallic']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['metallic'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)
        links.new(tex_node.outputs['Color'], principled.inputs['Metallic'])
        y_offset -= 300
        print(f"  Applied metallic: {textures['metallic']}")

    # Ambient Occlusion — multiply with Base Color if both exist
    if 'ao' in textures and os.path.isfile(textures['ao']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['ao'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)

        # Check if Base Color already has a link
        base_color_links = principled.inputs['Base Color'].links
        if base_color_links:
            mix_node = nodes.new(type='ShaderNodeMix')
            mix_node.data_type = 'RGBA'
            mix_node.blend_type = 'MULTIPLY'
            mix_node.location = (x_pos + 200, y_offset)
            mix_node.inputs['Factor'].default_value = 1.0
            # Reconnect: old Base Color source → Mix A, AO → Mix B, Mix → Base Color
            old_link_from = base_color_links[0].from_socket
            links.remove(base_color_links[0])
            links.new(old_link_from, mix_node.inputs[6])  # A
            links.new(tex_node.outputs['Color'], mix_node.inputs[7])  # B
            links.new(mix_node.outputs[2], principled.inputs['Base Color'])  # Result
        y_offset -= 300
        print(f"  Applied AO: {textures['ao']}")

    # Emissive
    if 'emissive' in textures and os.path.isfile(textures['emissive']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['emissive'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'sRGB'
        loaded_images.append(img)
        # Blender 4.0+ uses "Emission Color", earlier uses "Emission"
        emission_input = 'Emission Color' if bpy.app.version >= (4, 0, 0) else 'Emission'
        if emission_input in principled.inputs:
            links.new(tex_node.outputs['Color'], principled.inputs[emission_input])
        y_offset -= 300
        print(f"  Applied emissive: {textures['emissive']}")

    # Alpha / Transparency
    if 'alpha' in textures and os.path.isfile(textures['alpha']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset)
        img = bpy.data.images.load(textures['alpha'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)
        links.new(tex_node.outputs['Color'], principled.inputs['Alpha'])
        mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
        y_offset -= 300
        print(f"  Applied alpha: {textures['alpha']}")

    # Height / Displacement
    if 'height' in textures and os.path.isfile(textures['height']):
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.location = (x_pos, y_offset - 300)
        img = bpy.data.images.load(textures['height'])
        tex_node.image = img
        tex_node.image.colorspace_settings.name = 'Non-Color'
        loaded_images.append(img)

        disp_node = nodes.new(type='ShaderNodeDisplacement')
        disp_node.location = (x_pos + 200, y_offset - 300)
        links.new(tex_node.outputs['Color'], disp_node.inputs['Height'])

        # Connect to Material Output displacement
        for node in nodes:
            if node.type == 'OUTPUT_MATERIAL':
                links.new(disp_node.outputs['Displacement'], node.inputs['Displacement'])
                break
        print(f"  Applied height/displacement: {textures['height']}")

    return loaded_images


def apply_textures(texture_data):
    """
    Apply textures to materials in the scene based on the texture mapping data.

    Args:
        texture_data: dict with 'materials' (per-material mappings) and 'default' (fallback mapping)
    """
    if not texture_data:
        print("No texture data provided, skipping texture application")
        return []

    materials_map = texture_data.get('materials', {})
    default_textures = texture_data.get('default', {})

    all_images = []
    applied_count = 0

    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue

        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                continue

            mat_name = mat.name
            # Try exact material name match first, then fallback to default
            textures = materials_map.get(mat_name, default_textures)

            if textures:
                print(f"Applying textures to material '{mat_name}':")
                images = create_pbr_material(mat, textures)
                all_images.extend(images)
                applied_count += 1

    # If no materials existed on objects but we have default textures, create one
    if applied_count == 0 and default_textures:
        for obj in bpy.context.scene.objects:
            if obj.type != 'MESH' and len(obj.material_slots) == 0:
                continue
            if obj.type == 'MESH':
                mat = bpy.data.materials.new(name="Modelibr_Material")
                obj.data.materials.append(mat)
                print(f"Creating new material for object '{obj.name}':")
                images = create_pbr_material(mat, default_textures)
                all_images.extend(images)
                applied_count += 1

    print(f"Applied textures to {applied_count} materials")
    return all_images


def main():
    args = parse_args()

    print(f"Blender version: {bpy.app.version_string}")
    print(f"Input: {args.input}")
    print(f"Output: {args.output}")

    # Load texture data if provided
    texture_data = None
    if args.textures and os.path.isfile(args.textures):
        with open(args.textures, 'r') as f:
            texture_data = json.load(f)
        print(f"Loaded texture mappings from: {args.textures}")

    # Clear default scene
    clear_scene()

    # Import the model
    import_model(args.input, args.format)

    # Center at world origin
    center_objects()

    # Apply textures
    applied_images = apply_textures(texture_data)

    # Pack only images we loaded (not FBX-embedded refs that may point to missing files)
    for img in applied_images:
        try:
            img.pack()
            print(f"Packed image: {img.name}")
        except Exception as e:
            print(f"WARNING: Could not pack image {img.name}: {e}")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # Save as .blend
    bpy.ops.wm.save_as_mainfile(filepath=args.output)
    print(f"Saved .blend file to: {args.output}")


if __name__ == "__main__":
    main()

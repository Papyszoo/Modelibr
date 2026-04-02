"""
Blender headless script to export the active scene as GLB.

Usage:
    blender -b input.blend -P export_glb.py -- output.glb
"""

import sys
import bpy

def main():
    # Arguments after "--" are passed to the script
    argv = sys.argv
    separator_index = argv.index("--") if "--" in argv else -1
    if separator_index == -1 or separator_index + 1 >= len(argv):
        print("ERROR: No output path provided. Usage: blender -b input.blend -P export_glb.py -- output.glb")
        sys.exit(1)

    output_path = argv[separator_index + 1]

    # Build export kwargs compatible with Blender 3.x and 4.x+/5.x
    kwargs = {
        'filepath': output_path,
        'export_format': 'GLB',
        'export_animations': True,
        'export_image_format': 'AUTO',
        'export_materials': 'EXPORT',
    }

    # Blender 4.0+ renamed export_apply_modifiers → export_apply
    if bpy.app.version >= (4, 0, 0):
        kwargs['export_apply'] = True
    else:
        kwargs['export_apply_modifiers'] = True

    bpy.ops.export_scene.gltf(**kwargs)

    print(f"GLB exported to: {output_path}")

if __name__ == "__main__":
    main()

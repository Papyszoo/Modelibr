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

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_apply_modifiers=True,
        export_animations=True,
    )

    print(f"GLB exported to: {output_path}")

if __name__ == "__main__":
    main()

"""
Generates tests/e2e/assets/rig-web-bake.blend: a tiny rigged scene that exercises
every rig feature the web bake has to collapse into keyframes.

What it contains, and why each bit is there:

- "Target": an empty animated along X, the source of every driving signal below.
- "Rig": an armature whose Chain bone carries an IK constraint targeting the
  empty. The empty moves, the IK solves, and the baked GLB must carry keyframes
  for the solved bones - the constraint itself cannot survive glTF.
- "Followed": a mesh whose Copy Location constraint tracks the empty. Same
  story, at the object level.
- "Morph": a cube with three shape keys. Key1 is DRIVEN (a transform-channel
  driver reads the empty's X, so its weight was never keyed); Key2 is ANIMATED
  (an action keys its weight directly). The bake turns the driver into keys
  while leaving the action's keys in place.
- An Array modifier on "Morph", which HAS shape keys - the combination glTF
  cannot represent: the exporter refuses to apply modifiers on a morph-target
  mesh, so the only way the array's geometry survives is for the bake to apply
  it while rebuilding the shape keys around the result.

Reproduce from the repo root:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
        -P tests/e2e/fixtures/make-rig-fixture.py

(Any Blender 4.4+/5.x works; the file is committed, so this is authoring-time
only and nothing downloads Blender at test time.)
"""

import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "assets", "rig-web-bake.blend"))

FRAME_START = 1
FRAME_END = 24


def build_target(scene) -> "bpy.types.Object":
    """The empty every constraint and driver reads; animated 0 -> 2 along X."""
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0.0, 0.0, 0.0))
    target = bpy.context.active_object
    target.name = "Target"
    target.keyframe_insert("location", frame=FRAME_START)
    target.location = (2.0, 0.0, 0.0)
    target.keyframe_insert("location", frame=FRAME_END)
    return target


def build_rig(scene, target) -> "bpy.types.Object":
    """A two-bone chain with an IK constraint on its tip, aimed at the empty."""
    armature = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", armature)
    scene.collection.objects.link(rig)

    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature.edit_bones.new("Root")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 1.0, 0.0)

    chain = armature.edit_bones.new("Chain")
    chain.head = (0.0, 1.0, 0.0)
    chain.tail = (0.0, 2.0, 0.0)
    chain.parent = root
    chain.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)

    ik = rig.pose.bones["Chain"].constraints.new("IK")
    ik.name = "Target IK"
    ik.target = target
    # One bone in the chain, so Chain carries the whole solved rotation; with the
    # parent also in the chain most of the bend lands on Root and Chain's own
    # keys are nearly identity.
    ik.chain_count = 1
    return rig


def build_followed(scene, target) -> "bpy.types.Object":
    """A mesh that copies the empty's location through a constraint, not keys."""
    bpy.ops.mesh.primitive_cube_add(size=0.2, location=(0.0, 3.0, 0.0))
    followed = bpy.context.active_object
    followed.name = "Followed"
    followed.data.name = "FollowedMesh"

    copy_location = followed.constraints.new("COPY_LOCATION")
    copy_location.name = "Track Target"
    copy_location.target = target
    return followed


def build_morph(scene, target) -> "bpy.types.Object":
    """
    The shape-key mesh: a driven key, an action key, and a modifier glTF drops.

    Key1's weight has NO keys - a driver reads the empty's X. Key2's weight is
    keyed 0 -> 1. The Array modifier doubles the cube, which is only possible in
    GLB if the bake applies it while rebuilding both shape keys.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.0, 0.0, 0.0))
    morph = bpy.context.active_object
    morph.name = "Morph"
    morph.data.name = "MorphMesh"

    morph.shape_key_add(name="Basis", from_mix=False)
    key1 = morph.shape_key_add(name="Key1", from_mix=False)
    # A shape that reads as a shape: stretch the cube along Z.
    for point in key1.data:
        point.co.z *= 2.0

    key2 = morph.shape_key_add(name="Key2", from_mix=False)
    for point in key2.data:
        point.co.x += 0.5

    shape_keys = morph.data.shape_keys

    # The driven key: value tracks the empty's X, scaled into 0..1.
    driver = shape_keys.driver_add('key_blocks["Key1"].value').driver
    driver.type = "SCRIPTED"
    variable = driver.variables.new()
    variable.name = "targetX"
    variable.type = "TRANSFORMS"
    variable.targets[0].id = target
    variable.targets[0].transform_type = "LOC_X"
    driver.expression = "targetX / 2"

    # The keyed key: plain keyframes on the shape-key action.
    shape_keys.key_blocks["Key2"].value = 0.0
    shape_keys.key_blocks["Key2"].keyframe_insert("value", frame=FRAME_START)
    shape_keys.key_blocks["Key2"].value = 1.0
    shape_keys.key_blocks["Key2"].keyframe_insert("value", frame=FRAME_END)

    array = morph.modifiers.new(name="Array", type="ARRAY")
    array.count = 2
    return morph


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END

    target = build_target(scene)
    build_rig(scene, target)
    build_followed(scene, target)
    build_morph(scene, target)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # No .blend1 backup beside the committed fixture when re-running this.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print("WROTE", OUT, os.path.getsize(OUT), "bytes")


main()

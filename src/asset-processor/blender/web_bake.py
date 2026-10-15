"""
Bake rig features a glTF cannot carry into plain keyframes, shared by the
convert-format bake (`convert_format.py --bake`) and the rig inspection
(`export_glb.py`).

A .blend is Blender's own format, and an author is free to express motion with
whatever it has: IK chains, Copy Location constraints, drivers, NLA strips,
modifiers that stack geometry. Almost none of that survives a glTF export:

- Constraints and drivers are Blender concepts with no glTF equivalent. The
  exporter silently drops them, so a rigged .blend arrives in the viewer frozen
  in its rest pose (or worse, mid-solve).
- An Array modifier on a mesh WITH shape keys is dropped even by an export that
  otherwise applies modifiers: Blender refuses to apply modifiers on a mesh with
  morph targets, and the exporter has nothing to fall back to. The morphs
  survive, the stacked geometry does not.
- Shape-key drivers are not exported either, so a driven morph stops moving.

`inspect()` counts all of that without changing anything, so the thumbnail
pipeline can warn; `bake()` collapses it into keyframes, written into the mesh
where necessary, and leaves Armature modifiers in place because glTF DOES carry
skinning. Every action survives as its own clip: each is sampled over its own
range - the active action's keys, or an NLA strip's scene range - instead of
everything being folded into one clip over the scene's single range.

Blender 4.4 slotted actions are handled throughout: action fcurves are reached
through the layer/strip/channelbag tree when the legacy `fcurves` accessor is
missing (it is gone in 5.x), and keyframe_insert/keyframe_add handle slot
assignment themselves.
"""

import re

import bpy

#: Armature-modifier settings carried across a rebuild. The modifier itself has
#: no glTF representation to bake, only the skinning at runtime to keep working.
ARMATURE_MODIFIER_ATTRS = (
    "object",
    "vertex_group",
    "use_vertex_groups",
    "use_bone_envelopes",
    "invert_vertex_group",
    "use_deform_preserve_volume",
    "use_multi_modifier",
    "show_viewport",
    "show_render",
)

SHAPE_KEY_VALUE_PATH = re.compile(r'key_blocks\["(.+)"\]\.value\Z')


def action_fcurves(action):
    """
    Every fcurve of an action, legacy API or slotted-action tree.

    Blender 4.4 moved fcurves into layers/strips/channelbags (one channelbag per
    slot) and 5.x removed `Action.fcurves` outright. Both shapes are read here so
    the module works on 4.x and 5.x.
    """
    if action is None:
        return []
    try:
        return list(action.fcurves)
    except (AttributeError, RuntimeError):
        pass

    fcurves = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                fcurves.extend(bag.fcurves)
    return fcurves


def _key_name_from_path(data_path):
    match = SHAPE_KEY_VALUE_PATH.fullmatch(data_path)
    return match.group(1) if match else None


def _shape_key_driven_names(shape_keys):
    animation_data = shape_keys.animation_data
    if animation_data is None:
        return []
    names = []
    for fcurve in animation_data.drivers:
        name = _key_name_from_path(fcurve.data_path)
        if name and name not in names:
            names.append(name)
    return names


def _shape_key_action_names(action):
    """Shape-key channels one action keys."""
    names = []
    for fcurve in action_fcurves(action):
        name = _key_name_from_path(fcurve.data_path)
        if name and name not in names:
            names.append(name)
    return names


def inspect():
    """
    Count the rig features an ordinary glTF export cannot carry.

    Read-only. The counts are what the viewer's warning and the "Bake for web"
    button have to say about a .blend source; `hasRigFeatures` is the summary
    that decides whether anything needs saying at all.
    """
    counts = {
        "objectConstraints": 0,
        "boneConstraints": 0,
        "ikConstraints": 0,
        "objectDrivers": 0,
        "armatureDrivers": 0,
        "shapeKeyDrivers": 0,
        "shapeKeyActions": 0,
        "droppedModifiers": [],
    }

    for obj in bpy.context.scene.objects:
        counts["objectConstraints"] += len(obj.constraints)

        if obj.type == "ARMATURE":
            for pose_bone in obj.pose.bones:
                for constraint in pose_bone.constraints:
                    counts["boneConstraints"] += 1
                    if constraint.type == "IK":
                        counts["ikConstraints"] += 1
            if obj.animation_data is not None:
                counts["armatureDrivers"] += len(obj.animation_data.drivers)
        elif obj.animation_data is not None:
            counts["objectDrivers"] += len(obj.animation_data.drivers)

        if obj.type != "MESH" or obj.data is None or obj.data.shape_keys is None:
            continue

        shape_keys = obj.data.shape_keys
        if shape_keys.animation_data is not None:
            counts["shapeKeyDrivers"] += len(shape_keys.animation_data.drivers)
            has_action = (
                shape_keys.animation_data.action is not None
                or len(shape_keys.animation_data.nla_tracks) > 0
            )
            # A keyed morph animation exports on its own. What does NOT survive
            # is a shape-keyed mesh whose other modifiers force the exporter to
            # apply them: the apply drops the morph targets and leaves the
            # weights animation pointing at nothing (measured on this fixture:
            # an Array modifier turns "2 morph targets with a weights
            # animation" into "0 morph targets with the same animation"). So an
            # action only counts when such a modifier is present.
            dropped = [m for m in obj.modifiers if m.type != "ARMATURE"]
            if has_action and dropped:
                counts["shapeKeyActions"] += 1

        # Only the shape-keyed meshes: everywhere else the exporter can apply the
        # modifier itself, and flagging those would make every subdivided mesh
        # look like a broken rig.
        for modifier in obj.modifiers:
            if modifier.type != "ARMATURE":
                counts["droppedModifiers"].append(
                    f"{obj.name}:{modifier.name} ({modifier.type})"
                )

    counts["hasRigFeatures"] = bool(
        counts["objectConstraints"]
        or counts["boneConstraints"]
        or counts["objectDrivers"]
        or counts["armatureDrivers"]
        or counts["shapeKeyDrivers"]
        or counts["shapeKeyActions"]
        or counts["droppedModifiers"]
    )
    return counts


def _has_pose_features(obj):
    return any(pose_bone.constraints for pose_bone in obj.pose.bones)


def _has_pose_drivers(obj):
    if obj.animation_data is None:
        return False
    return any(
        fcurve.data_path.startswith("pose.bones[")
        for fcurve in obj.animation_data.drivers
    )


def _has_object_drivers(obj):
    return obj.animation_data is not None and len(obj.animation_data.drivers) > 0


def _bake_object(obj, bake_types, frame_start, frame_end, use_current_action):
    """
    Run nla.bake on ONE object, sampling the evaluated (constrained, driven)
    state into keyframes.

    Constraints are NOT cleared here: one action at a time is sampled and every
    one of them needs the constraints still live, so the caller clears them once
    all the object's actions have been baked. Pose baking needs the armature in
    pose mode with its bones selected; object baking needs the object itself
    selected and active.

    `use_current_action` bakes into the action already assigned (the object's
    own, or the one a strip points at) so the clip keeps its name and range; a
    slotted action that refuses the bake falls back to a fresh one. Returns the
    action the sampled keys actually landed in.
    """
    view_layer = bpy.context.view_layer
    for other in view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    view_layer.objects.active = obj

    pose_mode = "POSE" in bake_types and obj.type == "ARMATURE"
    if pose_mode:
        bpy.ops.object.mode_set(mode="POSE")
        for pose_bone in obj.pose.bones:
            if hasattr(pose_bone, "select"):
                pose_bone.select = True
            elif hasattr(pose_bone.bone, "select"):
                pose_bone.bone.select = True

    def run(use_current):
        return bpy.ops.nla.bake(
            frame_start=frame_start,
            frame_end=frame_end,
            step=1,
            only_selected=True,
            visual_keying=True,
            clear_constraints=False,
            clear_parents=False,
            use_current_action=use_current,
            clean_curves=False,
            bake_types=bake_types,
        )

    try:
        try:
            result = run(use_current_action)
        except RuntimeError:
            if not use_current_action:
                raise
            result = run(False)
    finally:
        if pose_mode:
            bpy.ops.object.mode_set(mode="OBJECT")

    if "FINISHED" not in result:
        raise RuntimeError(
            f"Blender declined to bake {obj.name} ({sorted(bake_types)})."
        )
    return obj.animation_data.action if obj.animation_data else None


def _action_entries(animation_data):
    """
    Every action an ID animates with, and the range it plays over.

    The active action plays over its own key range; a strip's action plays over
    the strip's scene range, which may sit anywhere on the timeline - even
    outside the scene's playback range. Both are actions the exporter writes as
    separate animations, so both are what a bake has to sample; the scene's
    range decides nothing here. Takes the AnimData rather than the object
    because shape keys carry their own.
    """
    if animation_data is None:
        return []

    entries = []
    seen = set()

    def add(action, start, end):
        if action is None or id(action) in seen:
            return
        seen.add(id(action))
        start, end = int(start), int(end)
        if end < start:
            start, end = end, start
        entries.append((action, start, end))

    if animation_data.action is not None:
        add(animation_data.action, *animation_data.action.frame_range)
    for track in animation_data.nla_tracks:
        for strip in track.strips:
            if strip.action is not None and not strip.mute:
                add(strip.action, strip.frame_start, strip.frame_end)
    return entries


def _mute_tracks(animation_data):
    """Silence every NLA track while one action at a time is sampled."""
    states = [(track, track.mute) for track in animation_data.nla_tracks]
    for track, _ in states:
        track.mute = True
    return states


def _restore_tracks(states):
    for track, was_muted in states:
        track.mute = was_muted


def _clear_constraints(collection):
    """Remove every constraint from an object's or a pose bone's collection."""
    for constraint in list(collection):
        collection.remove(constraint)


def _rebuild_tracks(animation_data, baked, active_action, summary):
    """
    Leave every baked action reachable as its own clip.

    The exporter's ACTIONS mode reads the active action plus each single-strip
    NLA track, and the old layout may stack, mute or repeat strips that no
    longer match the re-keyed actions. It is replaced with one strip per baked
    action at the action's own range; the active action stays active rather
    than stashed.
    """
    old_tracks = list(animation_data.nla_tracks)
    for track in old_tracks:
        animation_data.nla_tracks.remove(track)
    summary["nlaTracksRemoved"] += len(old_tracks)
    for action, start, _end in baked:
        if action == active_action:
            continue
        track = animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(start), action)


def _strip_armature_modifiers(obj):
    """Detach Armature modifiers during a rebuild; return their settings."""
    stripped = []
    for modifier in list(obj.modifiers):
        if modifier.type != "ARMATURE":
            continue
        settings = {
            attr: getattr(modifier, attr)
            for attr in ARMATURE_MODIFIER_ATTRS
            if hasattr(modifier, attr)
        }
        stripped.append((modifier.name, settings))
        obj.modifiers.remove(modifier)
    return stripped


def _restore_armature_modifiers(obj, stripped):
    for name, settings in stripped:
        modifier = obj.modifiers.new(name=name, type="ARMATURE")
        for attr, value in settings.items():
            try:
                setattr(modifier, attr, value)
            except (AttributeError, TypeError):
                # An attribute this Blender no longer accepts; the modifier
                # keeps its default for it rather than failing the whole bake.
                pass


def _animated_shape_key_samples(obj, names, frames):
    """Per-frame evaluated value of every animated shape key on the object."""
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    samples = {name: [] for name in names}
    for frame in frames:
        scene.frame_set(frame)
        evaluated = obj.evaluated_get(depsgraph)
        evaluated_keys = (
            evaluated.data.shape_keys if evaluated.data is not None else None
        )
        for name in names:
            block = (
                evaluated_keys.key_blocks.get(name) if evaluated_keys else None
            )
            samples[name].append(block.value if block is not None else 0.0)
    return samples


def _write_shape_key_samples(obj, samples, frames):
    """Key the sampled values onto the object's (rebuilt or original) mesh."""
    shape_keys = obj.data.shape_keys
    if shape_keys is None:
        return 0
    written = 0
    for name, values in samples.items():
        block = shape_keys.key_blocks.get(name)
        if block is None:
            continue
        for frame, value in zip(frames, values):
            block.value = value
            block.keyframe_insert("value", frame=frame)
        written += 1
    return written


def _evaluated_positions(obj, depsgraph, key_name=None):
    for key in obj.data.shape_keys.key_blocks:
        key.value = 1.0 if key.name == key_name else 0.0
    bpy.context.view_layer.update()
    depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    positions = [point.co.copy() for point in mesh.vertices]
    evaluated.to_mesh_clear()
    return positions


def _rebuild_mesh_preserving_shape_keys(obj, key_backup):
    """
    Apply every remaining modifier while keeping the shape keys.

    Blender refuses modifier_apply on a mesh with shape keys, so the modifier is
    applied to the evaluated mesh once per key state: all keys at 0 gives the
    basis (the modifier applied to the base mesh), each key at 1 gives that key's
    shape after the modifier. The deformations are then rebuilt as shape keys on
    a fresh mesh datablock. UVs, materials, vertex colors and the object's vertex
    groups come across because the mesh is produced from the evaluated object and
    the groups live on the object.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()
    basis_positions = _evaluated_positions(obj, depsgraph)
    key_positions = {
        name: _evaluated_positions(obj, depsgraph, name)
        for name in key_backup
        if name != "Basis"
    }

    # From here on the shape keys are gone on this mesh, so an animated value
    # cannot overwrite the state a sample was taken in.
    obj.shape_key_clear()
    bpy.context.view_layer.update()
    depsgraph.update()

    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    original_name = obj.data.name
    old_mesh = obj.data
    obj.data = mesh

    # The base mesh becomes the evaluated basis state, not the raw vertex data:
    # a Basis key that was moved relative to the mesh's reference positions must
    # not shift every morph target once the rebuild is done.
    if len(mesh.vertices) != len(basis_positions):
        raise RuntimeError(
            f"Rebuilding '{obj.name}' changed its vertex count "
            f"({len(mesh.vertices)} vs {len(basis_positions)}); refusing to "
            "write a mesh whose shape keys would not line up."
        )
    for vertex, position in zip(mesh.vertices, basis_positions):
        vertex.co = position

    obj.shape_key_add(name="Basis", from_mix=False)
    for name, positions in key_positions.items():
        key = obj.shape_key_add(name=name, from_mix=False)
        for point, position in zip(key.data, positions):
            point.co = position

    # Copy the properties that say HOW each key blends, not just where it is.
    for name, properties in key_backup.items():
        block = mesh.shape_keys.key_blocks.get(name)
        if block is None:
            continue
        for attr, value in properties.items():
            try:
                setattr(block, attr, value)
            except (AttributeError, TypeError):
                pass

    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    # Keep the source's datablock name when the old mesh is gone; a ".001" in
    # the exported mesh name is noise a user would not understand.
    if mesh.name != original_name and original_name not in bpy.data.meshes:
        mesh.name = original_name


def bake(frame_start=None, frame_end=None):
    """
    Collapse the scene's rig features into keyframes, in place.

    Constraints and pose drivers are sampled per frame and cleared
    (visual_keying), shape-key drivers and shape-key actions are re-keyed onto
    the mesh, and every modifier that glTF cannot carry is applied while the
    shape keys are rebuilt around the result. Armature modifiers stay: glTF
    carries them as skinning.

    Every action survives as its own clip. Each one is sampled over its own
    range - the active action's keys, or the strip's own scene range - and stays
    reachable as the action the exporter writes as a separate animation. The
    scene's playback range is only the fallback for an object whose motion comes
    from constraints or drivers alone, with no action to name a range.
    """
    scene = bpy.context.scene
    start = int(scene.frame_start if frame_start is None else frame_start)
    end = int(scene.frame_end if frame_end is None else frame_end)
    if end < start:
        start, end = end, start

    before = inspect()
    summary = {
        "poseBaked": 0,
        "objectsBaked": 0,
        "shapeKeyChannels": 0,
        "driversRemoved": 0,
        "modifiersApplied": 0,
        "meshesRebuilt": 0,
        "nlaTracksRemoved": 0,
        "constraintsCleared": before["objectConstraints"] + before["boneConstraints"],
        "inspectBefore": before,
    }

    # 1. Constraints and driven transforms -> keyframes, one action at a time so
    #    nothing is folded into a single clip. Constraints stay live for the
    #    whole loop and are cleared once every action has been sampled.
    for obj in list(scene.objects):
        needs_pose = obj.type == "ARMATURE" and (
            _has_pose_features(obj) or _has_pose_drivers(obj)
        )
        needs_object = bool(obj.constraints) or (
            obj.type != "ARMATURE" and _has_object_drivers(obj)
        )
        if not (needs_pose or needs_object):
            continue

        animation_data = obj.animation_data
        entries = _action_entries(animation_data)
        if entries:
            states = _mute_tracks(animation_data)
            original_action = animation_data.action
            baked = []
            try:
                for action, from_frame, to_frame in entries:
                    animation_data.action = action
                    current = action
                    if needs_pose:
                        current = (
                            _bake_object(obj, {"POSE"}, from_frame, to_frame, True)
                            or current
                        )
                    if needs_object:
                        current = (
                            _bake_object(obj, {"OBJECT"}, from_frame, to_frame, True)
                            or current
                        )
                    baked.append((current, from_frame, to_frame))
                    if current != action and action.users == 0:
                        # The action refused the bake and a fresh one took over;
                        # the unbaked original must not linger as a stale clip.
                        bpy.data.actions.remove(action)
            finally:
                _restore_tracks(states)
            # The action that was active stays active (under its effective
            # identity); with no active action, every baked clip is stashed.
            active_action = baked[0][0] if original_action is not None else None
            animation_data.action = active_action
            _rebuild_tracks(animation_data, baked, active_action, summary)
        else:
            # No action names a range: the constraints or drivers are the only
            # motion, so the scene's own range is what the author would scrub.
            if needs_pose:
                _bake_object(obj, {"POSE"}, start, end, False)
            if needs_object:
                _bake_object(obj, {"OBJECT"}, start, end, False)

        if needs_pose:
            summary["poseBaked"] += 1
            summary["objectsBaked"] += 1
            for pose_bone in obj.pose.bones:
                _clear_constraints(pose_bone.constraints)
        if needs_object:
            summary["objectsBaked"] += 1
            _clear_constraints(obj.constraints)

    # 2. Shape-key animation -> samples; drivers gone. Like the object bakes,
    #    every action the shape keys animate with keeps its own range and
    #    survives as its own clip; a mesh that still has dropped modifiers gets
    #    its samples written after step 3, because the rebuild replaces the keys
    #    (and the actions) they belong to.
    pending_samples = {}
    for obj in list(scene.objects):
        if obj.type != "MESH" or obj.data is None or obj.data.shape_keys is None:
            continue
        shape_keys = obj.data.shape_keys
        animation_data = shape_keys.animation_data
        driven_names = _shape_key_driven_names(shape_keys)
        entries = _action_entries(animation_data)
        if not entries and not driven_names:
            continue

        if entries:
            states = _mute_tracks(animation_data)
            original_action = animation_data.action
            baked = []
            try:
                for action, from_frame, to_frame in entries:
                    animation_data.action = action
                    names = list(
                        dict.fromkeys(driven_names + _shape_key_action_names(action))
                    )
                    if not names:
                        continue
                    action_frames = list(range(from_frame, to_frame + 1))
                    baked.append((
                        action,
                        action_frames,
                        _animated_shape_key_samples(obj, names, action_frames),
                    ))
            finally:
                animation_data.action = original_action
                _restore_tracks(states)
            if not baked:
                continue
        else:
            driven_frames = list(range(start, end + 1))
            baked = [(
                None,
                driven_frames,
                _animated_shape_key_samples(obj, driven_names, driven_frames),
            )]

        if animation_data is not None:
            for fcurve in list(animation_data.drivers):
                animation_data.drivers.remove(fcurve)
                summary["driversRemoved"] += 1

        has_dropped_modifiers = any(m.type != "ARMATURE" for m in obj.modifiers)
        if has_dropped_modifiers:
            pending_samples[obj] = baked
        else:
            summary["shapeKeyChannels"] += _write_shape_key_actions(
                obj, baked, summary
            )

    # 3. Modifiers glTF cannot carry -> applied, shape keys kept.
    for obj in list(scene.objects):
        if obj.type != "MESH" or obj.data is None:
            continue
        dropped = [m for m in obj.modifiers if m.type != "ARMATURE"]
        if not dropped:
            continue

        if obj.data.shape_keys is not None:
            _apply_modifiers_with_shape_keys(obj, dropped, summary)
            baked = pending_samples.pop(obj, None)
            if baked:
                summary["shapeKeyChannels"] += _rewrite_shape_key_actions(
                    obj, baked, summary
                )
        else:
            stripped = _strip_armature_modifiers(obj)
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            for modifier in dropped:
                # modifier_apply acts on the context's active object, and a
                # different object is active for most of a bake (the last one
                # handled, or whatever the opened file had selected). Without an
                # override Blender applies to THAT object: it silently mutates
                # the wrong mesh and leaves this one's modifier in place (a
                # name miss returns CANCELLED, not an error, so the count below
                # would even claim success). The override pins the operator to
                # obj without disturbing the user's selection.
                try:
                    with bpy.context.temp_override(
                        object=obj,
                        active_object=obj,
                        selected_objects=[obj],
                        selected_editable_objects=[obj],
                    ):
                        result = bpy.ops.object.modifier_apply(
                            modifier=modifier.name
                        )
                except RuntimeError as exc:
                    raise RuntimeError(
                        f"Could not apply modifier '{modifier.name}' ({modifier.type}) "
                        f"on '{obj.name}': {exc}"
                    )
                if "FINISHED" not in result:
                    raise RuntimeError(
                        f"Could not apply modifier '{modifier.name}' ({modifier.type}) "
                        f"on '{obj.name}': Blender returned {sorted(result)}."
                    )
                summary["modifiersApplied"] += 1
            _restore_armature_modifiers(obj, stripped)

    # End on the clip's first frame: the exporter reads the CURRENT shape-key
    # values as the file's default morph weights, and frame_start is the natural
    # default pose (and what the source's own preview shows when opened).
    scene.frame_set(start)

    return summary


def _write_shape_key_actions(obj, baked, summary):
    """
    Re-key every sampled action back into itself, without a rebuild.

    The actions (and the Key datablock that carries them) are still alive, so
    each sample lands in the action it came from and stays that action's clip.
    """
    shape_keys = obj.data.shape_keys
    written = 0
    for action, frames, samples in baked:
        if action is not None:
            shape_keys.animation_data.action = action
        written += _write_shape_key_samples(obj, samples, frames)

    animation_data = shape_keys.animation_data
    if animation_data is None:
        return written
    # The first entry is the action that was active; keep it active and stash
    # the rest, matching the object side.
    active_action = baked[0][0] if baked[0][0] is not None else animation_data.action
    animation_data.action = active_action
    _rebuild_tracks(
        animation_data,
        [
            (action, frames[0], frames[-1])
            for action, frames, _ in baked
            if action is not None
        ],
        active_action,
        summary,
    )
    return written


def _rewrite_shape_key_actions(obj, baked, summary):
    """
    Recreate the sampled actions after a mesh rebuild.

    The rebuild replaces the Key datablock and its animation data, so each clip
    is recreated under its own name and the samples are keyed into it; the first
    becomes active and the rest are stashed, like the no-rebuild path.
    """
    shape_keys = obj.data.shape_keys
    animation_data = shape_keys.animation_data_create()
    written = 0
    recreated = []
    for action, frames, samples in baked:
        if action is None:
            animation_data.action = None
        else:
            name = action.name
            if action.users == 0:
                bpy.data.actions.remove(action)
            animation_data.action = bpy.data.actions.new(name)
        written += _write_shape_key_samples(obj, samples, frames)
        recreated.append((animation_data.action, frames, samples))

    active_action = recreated[0][0] if recreated else None
    animation_data.action = active_action
    _rebuild_tracks(
        animation_data,
        [
            (action, frames[0], frames[-1])
            for action, frames, _ in recreated
            if action is not None
        ],
        active_action,
        summary,
    )
    return written


def _apply_modifiers_with_shape_keys(obj, dropped, summary):
    """The per-key rejoin: rebuild the mesh around the applied modifiers, then
    drop the modifiers the rebuild consumed."""
    shape_keys = obj.data.shape_keys
    # Per-Key attributes that say HOW a key blends. `use_relative` is a Key-level
    # flag (5.x) rather than a ShapeKey one, so it is carried separately. `value`
    # is carried so a statically-posed key keeps its default weight; animated
    # keys are re-keyed below and evaluate from their action instead.
    key_attrs = (
        "value",
        "interpolation",
        "mute",
        "slider_min",
        "slider_max",
        "vertex_group",
    )
    key_backup = {
        block.name: {
            attr: getattr(block, attr)
            for attr in key_attrs
            if hasattr(block, attr)
        }
        for block in shape_keys.key_blocks
    }
    use_relative = getattr(shape_keys, "use_relative", None)
    stripped = _strip_armature_modifiers(obj)

    # Any drivers were removed and any action would die with the old Key
    # datablock anyway; the caller re-keys the sampled values afterwards.
    if shape_keys.animation_data is not None:
        shape_keys.animation_data_clear()

    _rebuild_mesh_preserving_shape_keys(obj, key_backup)
    if use_relative is not None and obj.data.shape_keys is not None:
        try:
            obj.data.shape_keys.use_relative = use_relative
        except (AttributeError, TypeError):
            pass

    # The rebuild evaluated the object with these modifiers still attached, so
    # their result is already in the mesh. They must not stay: a later
    # evaluation (a re-export, or inspect()) would apply them a second time -
    # an Array would double the geometry it had just been baked into.
    for modifier in dropped:
        obj.modifiers.remove(modifier)

    summary["modifiersApplied"] += len(dropped)
    summary["meshesRebuilt"] += 1

    _restore_armature_modifiers(obj, stripped)

---
description: Preview animation clips and shape keys in the Modelibr viewer. Models with animation get an animated thumbnail and a clip picker in the Model Info panel.
sidebar_position: 15
---

# Animations and Shape Keys

When a model carries animation, the viewer plays it and lets you explore it without
opening a 3D tool. Open a model that has clips or shape keys and the **Animation**
section appears in the Model Info panel. A model with neither shows no section at
all.

## What the viewer plays

The viewer plays whatever clips the file itself carries, through three.js. What
that means depends on the format:

| Format        | What plays                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| glTF and GLB  | Skeletal (rig) clips and morph-target (shape key) clips, together or alone |
| FBX           | Skeletal clips mostly; morph-target clips only partially                   |
| OBJ, STL, 3MF | Nothing - these formats carry no animation                                 |

glTF is the format to aim for. It stores clips, skeletons and shape keys in one
document, so a clip that moves both a rig and a set of shape keys plays exactly as
authored.

## Playback controls

- **Clip** - pick a clip; each entry shows its name and duration (`Wave - 1.00 s`).
  Switching clips crossfades over a fifth of a second so the pose does not snap.
- **Play / Pause** - starts and stops the selected clip. A model opens paused at
  the start of its first clip.
- **Scrub** - drag the slider to any point in the clip; the readout shows the
  current time and the clip length (`0.42 / 1.00 s`). Dragging pauses playback.
- **Loop** - on by default; turn it off to play once and hold the final pose.
- **Speed** - 0.25x, 0.5x, 1x, 1.5x or 2x.

## Shape keys

Every mesh in the model that has shape keys gets a group titled with the mesh name,
with one slider per key from 0 to 1.

- While playback is paused, or the selected clip does not animate shape keys, the
  sliders write the weights directly - useful for checking a blend on its own.
- While a clip that animates shape keys is playing, the sliders lock and show the
  clip's live values; the clip wins so the two are never fighting.
- **Reset shape keys** sets every key back to 0.

All of this is the viewer's own preview state. It is not saved to the model and does
not change the asset.

## What silently drops

Some animation is authored in a way that no exported glTF can carry. Two cases are
worth knowing before you export:

- **IK, constraints and drivers** live in the DCC scene, not in glTF. They are not
  exported, so any motion they produce has to be **baked to keyframes** in Blender
  before export, or the clip arrives empty.
- **Non-glTF rigs** - a rig exported only through FBX may lose part of its
  animation; glTF is the safe target for skeletal and morph clips.

Bake the animation in Blender, export glTF or GLB, and upload the result. The
viewer then plays the baked keyframes.

See [Model Management](./models) for upload and versioning, and
[Texture Sets](./texture-sets) for materials.

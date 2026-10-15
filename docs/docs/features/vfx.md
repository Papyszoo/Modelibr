---
description: Build visual effects in Modelibr - layer timed particles, meshes, lights and sounds on one timeline, preview and autosave them, and export to Godot.
sidebar_position: 5
---

# VFX

A visual effect in Modelibr is a set of **timed components** - particles, meshes,
lights and sounds - that play together on one timeline. An effect is stored as a
single validated v1 definition, so a timeline is edited and replaced as a whole
rather than as a scattered set of rows.

## Creating an effect

Open **VFX** from the New Tab page and click **New effect**. Creating goes
straight to the editor - there is no name dialog, and no search or filter in the
list. Name the effect from the title field in the editor.

## The editor

The editor has three parts:

- **Transport** - rewind, play/pause, a time readout, a **Loop** checkbox, and
  the effect **Length** in seconds (0.1 to 60). Shrinking the length re-fits any
  component that would run past the end.
- **Workspace** - the live preview, with a button per component type:
  **Particles**, **Mesh**, **Light** and **Sound**. Mesh and Sound open a picker
  first, because they reference a library asset; Particles and Light do not.
- **Timeline and inspector** - one track per component, and the property panel
  for the selected component.

On the timeline, drag a bar to move a component's start and drag its right handle
to change its duration; both snap to 50 ms readouts and stay inside the effect.
Keyframes show as markers on the track. Scrubbing the ruler moves the playhead.

### Component properties

Every component has a **start** and a **duration** inside the effect. Beyond
that:

| Component    | What you can set                                                                 |
| ------------ | -------------------------------------------------------------------------------- |
| **Particles** | Emit continuously (a rate) or as a burst (a count); lifetime, speed, spread, gravity; size, colour and opacity over life; additive or normal blending; an optional sprite |
| **Mesh**      | A library model, or a flat disc or ring primitive with a colour and an emissive value, plus scale, opacity and Y-rotation tracks |
| **Light**     | Colour, range, and an intensity track                                             |
| **Sound**     | A library sound and its volume                                                    |

A particles emitter can also take a shape: a point, a disc or a ring - the last
two add a radius track. Position is editable for every component except a sound.
Adding a component creates it valid as it stands, so the effect is never left
unsavable.

## Autosave

The editor saves 600 ms after you stop changing something. A small label shows
the state: **Saved**, **Saving...**, a problem count when the save was rejected,
or **Save failed - not saved**. A rejected save stays dirty and lists every
problem against the field it belongs to. Switching away from the tab flushes a
pending edit rather than dropping it.

## Preview and thumbnail

The live preview and the worker's thumbnail are the **same renderer**, so what
you see in the editor is what the list tile shows. The worker renders an animated
WebP loop (up to 90 frames) after each create or update; the list refreshes a
tile that has no thumbnail yet, and one whose thumbnail may be mid-swap.

## Exporting to Godot

The editor has a **Godot** export link that downloads a zip containing a Godot 4
`.tscn` scene, the referenced files and a short README. It is a starting point,
not an exact reproduction: particle counts and timing match but the emission is
Godot's own randomness, an opacity track on an imported mesh cannot be exported
generically, model formats Godot does not import out of the box get a note to
convert to glTF, and audio must be WAV, Ogg or MP3.

## Limits

- Up to **32 components** per effect.
- Effect duration is **0.1 to 60 seconds**; a component's start plus duration
  cannot exceed it.
- Particles: rate up to 2000/s, a burst of up to 5000, spread 0 to 180 degrees.
- The preview caps live particles per emitter at 5000.

An invalid definition is refused in full, with every problem reported together,
so nothing is half-applied.

## Working through an agent

With the MCP server connected, `list_vfx` and `get_vfx` read effects, and
`create_vfx` / `update_vfx` write them. A supplied definition replaces the whole
definition rather than merging it. There is no delete tool, so an agent cannot
remove an effect - that is left to you. See
[Agent server (MCP)](/docs/features/mcp-server).

## Deleting an effect

Right-click an effect and select **Delete**. This is a **permanent hard
delete** - effects have no recycle bin - so a confirmation dialog asks first.
Deleting the effect does not affect the library assets it referenced.

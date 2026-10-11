---
description: Compose library assets into a 3D scene in Modelibr - place and transform models, block out a room, dress a node, work in four stages, and render the result.
sidebar_position: 4
---

# Scenes

A scene composes library assets into 3D space: models (and sprites and
environment maps) placed, transformed, lit and dressed with materials. A scene is
stored as one validated document with a revision number, so every save is an
explicit, reviewable step rather than a stream of small edits.

## Creating a scene

Open **Scenes** from the New Tab page and click **New scene**. The dialog asks
for:

- **Name** - required, and the only field that is.
- **Project** - optional; it defaults to **No project**.
- **Description** - optional, and useful to an agent.

Click **Create**, then click the scene card to open it. Each scene opens as its
own editor tab with its own unsaved draft.

## The editor at a glance

The editor is three columns:

- **Left** - the **Library** picker (**Click a model to place it**), a row with
  **Blockout box** and **Light**, and the node hierarchy.
- **Centre** - the viewport. Left-drag to orbit, right-drag to pan, scroll to
  zoom.
- **Right** - the **Choices** panel and the property panel for the selected node.

The header carries the scene name, a project chip, and counts for nodes, lights
and the current revision.

### Adding things to a scene

- **A library model**: click it in the picker. It lands resting on the ground
  using its measured origin. A model with no version cannot be placed.
- **A blockout box**: the **Blockout box** button adds a 1 x 1 x 1 box - useful
  for massing out walls and platforms before assets arrive.
- **A light**: the **Light** button adds a directional key light.

Select a node to edit it in the property panel. **Position** is in metres,
**Rotation** in degrees, and **Scale** as a multiplier, each with X/Y/Z fields.
**Rest on ground** sets the node's base onto the floor; it is disabled when the
node rests on another node or its offset is unknown.

## The four stages

A scene can be authored in stages. The stage picker sits in the editor header
and its options are **Unstaged**, **Layout**, **Detail**, **Lit** and
**Dressed**:

| Stage     | What it is for                          |
| --------- | --------------------------------------- |
| `layout`  | Room shell and the large forms          |
| `detail`  | Props, and things resting on other things |
| `lit`     | A key light and a believable rig        |
| `dressed` | Colour, finish and materials            |

The stage is enforced, not advisory: moving forward is refused while validation
reports a contact or containment error (something resting on nothing, geometry
under the floor). Moving back is always allowed, and is how a scene is reopened
to fix its composition. Until a scene reaches `lit` and `dressed`, missing
lights and materials are reported as notes rather than warnings.

## Dressing a node

The **Materials** panel dresses a selected model **for this placement only** -
the model keeps its own materials everywhere else. There is a default row,
**Every slot**, plus a row per material slot the model declares.

Pick a material from the dialog, which merges the two kinds of material into one
list and labels each: **PBR** for a parameter material (no UVs needed) or
**Textures** for a tiling global material (marked **needs UVs**). See
[Materials](/docs/features/materials).

## Choices

A scene can carry **slots** - decisions that are the user's to make, such as
which of several buildings is the hero. An agent proposes candidates for a slot
and you settle it in the **Choices** panel: accept a recommendation, reject one
with a reason, throw the whole round out with **None of these**, or **Reopen** a
settled slot. Rejections are kept with their reasons so the next round cannot
re-offer what you just turned down, and a choice you make is recorded as yours,
not the agent's.

## Saving and undo

There is no autosave. The header has a **Save** button (which reads **Saved**
when there is nothing pending), and each scene tab keeps its own draft.

- Closing a tab with unsaved changes asks first: **Save and close**, **Discard**
  or **Cancel**. A failed save keeps the tab and the draft.
- **Undo** and **Redo** (buttons, or **Ctrl/⌘ + Z** and **Ctrl/⌘ + Shift + Z**)
  step through whole-document snapshots.
- If the scene was changed elsewhere while a tab was open, the save is refused
  rather than overwriting the newer revision.

## Rendering a scene

There is no render button in the editor - you are already looking at the live
viewport. Rendering is what lets an **agent** see the scene: the `render_scene`
MCP tool photographs the same component the editor draws with, from an
`iso`, `front`, `side` or `top` viewpoint, and returns the image. See
[Agent server (MCP)](/docs/features/mcp-server).

## Projects

A scene links to at most one project, optionally. The link is context, not
content: it is not stored in the scene document. When a scene belongs to a
project, its project brief (style, budget, world convention) is what the agent is
given, and anything the scene uses joins that project's asset list. See
[Projects](/docs/features/projects).

## Working through an agent

Scenes have a full set of MCP tools. Reads are always available: `list_scenes`,
`get_scene`, `get_slots`, `validate_scene`, `get_scenes_using_asset`,
`render_scene` and `get_scene_render`. With writes enabled, an agent can
`create_scene`, place and move assets (`place_asset`, `place_assets_batch`,
`distribute_assets`), block out geometry (`place_primitive`, `create_room`), light
(`set_lighting_preset`, `set_light`), dress (`apply_material`), run the stage and
choice flow, replace the document, link a project and delete a scene. The
`compose_scene` prompt walks an agent through the stages in order.

## Deleting a scene

Right-click a scene and select **Delete**. A scene is a **hard delete** - there
is no recycle bin for scenes - so a confirmation dialog asks first. Deleting a
scene never touches the assets it referenced, only the composition.

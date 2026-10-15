---
description: PBR materials defined by parameters with no UVs, and tiling Global Materials built from image sets. Create, dress a scene node, tag and recycle.
sidebar_position: 3
---

# Materials

Modelibr has two kinds of material, and they answer different questions:

- **PBR Materials** are defined purely by parameters - a colour, a roughness, a
  metallic value and a few more. They need no image files and no UVs, so they
  dress any model.
- **Global Materials** are tiling image sets - a set of texture maps that a model
  samples through its UV layout. They are a kind of texture set. See
  [Texture Sets](/docs/features/texture-sets) for the maps themselves.

Two further texture-set kinds, **Multi-Model Textures** and **model-owned**
sets, are created for a specific model and live with it rather than on their own
page.

## PBR Materials

### Creating one

Open **PBR Materials** from the New Tab page and click **New material**. The
editor asks for a **Name** (required) and an optional **Description**, then the
material's parameters:

| Field            | What it does                                             | Default     |
| ---------------- | -------------------------------------------------------- | ----------- |
| **Base colour**  | The surface colour                                        | `#cccccc`   |
| **Roughness**    | Matte (1) to mirror-smooth (0)                            | `0.5`       |
| **Metallic**     | Dielectric (0) to metal (1)                               | `0`         |
| **IOR**          | Index of refraction                                       | `1.5`       |
| **Normal scale** | Strength of a normal map, if the model carries one        | `1`         |
| **Occlusion**    | Strength of an AO map, if the model carries one           | `1`         |
| **Alpha mode**   | `Opaque`, `Mask` or `Blend`                               | `Opaque`    |
| **Opacity**      | Shown only in `Blend` mode                                | `1`         |
| **Alpha cutoff** | Shown only in `Mask` mode                                 | `0.5`       |
| **Double sided** | Render both faces of a surface                            | Off         |

Normal scale and occlusion only have an effect if the model already has the
matching map; on an untextured model they are harmless. A material has a swatch
in the list and in pickers. It is an approximation of the parameters - materials
that carry runtime effects get a real preview sphere instead.

### Effects

A material can carry up to four optional runtime **Effects**, at most one of
each type: **jelly wobble**, **rim** glow, **translucency** and **emission
pulse**. Add one from the **Add effect** dropdown and tune its parameters; an
invalid document is refused as a whole.

### Finding and recycling

The PBR Materials list has a name search. **Recycle** from the context menu
soft-deletes a material to the Recycle Bin and offers an **Undo** toast; it is
not a permanent delete.

## Global Materials

A **Global Material** is a tiling texture set that exists independently of any
model and can be reused across many. It samples a UV layout, so it needs a model
with UVs to look right. Open the **Global Materials** tab from the New Tab page,
or drop image files onto the grid to create a set from a file. Categories are
kept per kind, so Global Materials and Multi-Model Textures each have their own
tree. See [Texture Sets](/docs/features/texture-sets) for creating sets,
channel-packing and merging.

## Choosing between them

| You want to...                                             | Use                          |
| ---------------------------------------------------------- | ---------------------------- |
| Dress a model with no UVs, cheaply                         | A **PBR Material**           |
| Reuse a tileable image set across many models               | A **Global Material**        |
| Use maps baked for one model's UVs                          | A **Multi-Model** texture set |

## Where the two meet

The one surface that deliberately shows both kinds together is the material
picker in the **scene editor** (the **Materials** panel of a selected node). It
labels a PBR material **PBR** and a texture set **Textures**, and marks a set
that **needs UVs**. Picking one dresses that node for that scene only - the
model's own materials are untouched. See [Scenes](/docs/features/scenes).

A PBR material is bound to **scene nodes**, not to models directly. To change how
a model itself renders, use its texture sets (see
[Model Management](/docs/features/models)).

## Working through an agent

The MCP server exposes the same library. `list_materials` browses parameter and
tiling materials in one list with their `requiresUvs` flag, `get_material` reads
one in full, and `create_material` / `update_material` write parameters and
effects. An agent dresses a node with `apply_material`, passing a `materialId`
for a PBR material or a `textureSetId` for a tiling one. See
[Agent server (MCP)](/docs/features/mcp-server).

---
description: Work in a tabbed Modelibr workspace with pinned pages, a drag-to-split layout, global search on Ctrl or Command + K, and a launcher page for every asset type.
sidebar_position: 7
---

# User Interface

Modelibr uses a flexible tab system that lets you organize your workspace around the pages you use most.

<div className="feature-video-container">
  <video
    controls
    width="100%"
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    poster="/img/videos/user-interface-poster.webp"
  >
    <source src="/videos/user-interface.webm" type="video/webm" />
    <p className="video-fallback">A short screen recording of navigating tabs and workspace controls in Modelibr</p>
  </video>
</div>

## Panel Layout

Modelibr opens as a **single full-width pane**. The pane holds the main dock - a
row of **tabs** - and a **New Tab** entry in that row opens the launcher. The app
starts with one pane; a second pane appears only when you make one by dragging a
tab into the right half.

### Pinned pages

Pinned pages are always present in the main dock and cannot be closed. The
catalogue is Models, Global Materials, VFX, Scenes and Projects; **Models** and
**Projects** are pinned by default. Turn any of them on or off under **Settings →
Appearance → Pinned tabs**. A pinned page that is closed shows as an entry that
opens it; everything else opens from the New Tab page like any other tab.

### Tab Types

**Asset libraries:**

| Tab                      | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| **Models**               | Your model library grid with versions and tags                     |
| **Global Materials**     | Reusable texture sets shared across many models                    |
| **PBR Materials**        | [Materials defined by parameters](/docs/features/materials) rather than images - no UVs needed |
| **Multi-Model Textures** | Texture sets created for specific models                           |
| **Environment Maps**     | HDR panoramas and six-face cube maps used for lighting             |
| **Sprites**              | 2D sprite sheets, atlases, and UI iconography                      |
| **Sounds**               | Audio assets - SFX, dialogue, ambient loops                        |
| **Scripts**              | Source code and shaders with live previews                         |
| **VFX**                  | [Visual effects](/docs/features/vfx): timed particles, meshes, lights and sounds |
| **Scenes**               | Compose library assets into a scene, by hand or through an agent   |

**Organize and system:**

| Tab                | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| **Packs**          | Reusable asset bundles                                            |
| **Projects**       | Project workspaces                                                |
| **Asset Store**    | Import packs from your store library (built in, online)           |
| **History**        | Batch upload history                                              |
| **Recycled Files** | Recover deleted items                                             |
| **Settings**       | Appearance, upload, thumbnails, Blender, WebDAV, backups, MCP - see [Settings](/docs/features/settings) |

**Viewers** open when you click an asset: **Model Viewer** (3D), **Texture Set Viewer**, **Environment Map Viewer**, **Script Viewer**, **VFX Editor**, plus **Pack** and **Project** viewers.

A **Scene editor** opens the same way - clicking a scene in the Scenes tab
replaces the list with a dock tab of its own, one per scene, so two scenes can be
open side by side. Each scene tab keeps its own unsaved draft, and Back closes
that tab and discards that draft. See [Scenes](/docs/features/scenes) for the
editor's stages, placement and choices.

### The New Tab Page

Opening a new tab shows the **New Tab page** - a launcher for the whole app:

- **Tiles** for every tab type, grouped into Asset Types, Organize, and System
- **Recently Closed** - reopen tabs you closed, with their exact content restored
- **Sessions** - restore recently closed windows and their full tab layout
- A **search box** (autofocused) to filter tiles quickly

### Global Search

Press **Ctrl/⌘ + K** anywhere to open Global Search. It searches your models,
texture sets, environment maps, sprites, sounds, scripts, packs and projects by
name (models also by tag) and highlights matches. Pick a result to open it;
sprites and sounds open their list tab, since they have no per-item viewer.

### Working with Tabs

- **Open a page**: pick a tile on the New Tab page, or click an asset
- **Close a tab**: click the × button or middle-click the tab (pinned pages cannot be closed)
- **Switch tabs**: click any tab to make it active
- **Rearrange tabs**: drag a tab within the dock to reorder it
- **Split the layout**: drag a tab into the right half of the pane; the second pane appears and holds it
- **Undo the split**: drag the tab back, or close the last tab in the right pane - the pane that remains takes over the main dock

## Smart Tab Behavior

### Deduplication

Modelibr prevents opening the **same item twice** in the same pane:

- Clicking an item that's already open will **switch to that tab** instead of creating a duplicate
- This keeps your workspace clean and prevents confusion

### Side-by-side viewing

The two panes are independent, so you can keep a model in one and something you
compare it against in the other:

- Open a model in the main pane
- Drag its tab to the right half to split the layout
- Open a texture set, environment map, or scene in the second pane

This is useful for:

- Comparing model versions
- Viewing a model while adjusting texture sets
- Side-by-side texture comparisons

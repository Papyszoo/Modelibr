---
sidebar_position: 4
---

# User Interface

Modelibr uses a flexible panel system that lets you organize your workspace and share layouts with URLs.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/videos/user-interface.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Panel Layout

The interface is split into **two panels** (left and right), each containing multiple **tabs**.

### Tab Types

**Asset libraries:**

| Tab                      | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| **Models**               | Your model library grid with versions and tags                     |
| **Texture Sets**         | Browse and manage all texture sets                                 |
| **Global Materials**     | Reusable PBR materials shared across many models                   |
| **Multi-Model Textures** | Texture sets created for specific models                           |
| **Environment Maps**     | HDR panoramas and six-face cube maps used for lighting             |
| **Sprites**              | 2D sprite sheets, atlases, and UI iconography                      |
| **Sounds**               | Audio assets - SFX, dialogue, ambient loops                        |
| **Scripts**              | Source code and shaders with live previews                         |

**Organize and system:**

| Tab                | Description                                            |
| ------------------ | ------------------------------------------------------ |
| **Packs**          | Reusable asset bundles                                 |
| **Projects**       | Project workspaces                                     |
| **Asset Store**    | Import packs from your store library (optional)        |
| **History**        | Recent uploads, renames, and version bumps             |
| **Recycled Files** | Recover deleted items                                  |
| **Settings**       | Storage, appearance, WebDAV, and Blender CLI           |

**Viewers** open when you click an asset: **Model Viewer** (3D), **Texture Set Viewer**, **Environment Map Viewer**, **Script Viewer**, plus **Pack** and **Project** viewers.

### The New Tab Page

Opening a new tab shows the **New Tab page** - a launcher for the whole app:

- **Tiles** for every tab type, grouped into Asset Types, Organize, and System
- **Recently Closed** - reopen tabs you closed, with their exact content restored
- **Sessions** - restore recently closed windows and their full tab layout
- A **search box** (autofocused) to filter tiles quickly

### Global Search

Press **Ctrl/⌘ + K** anywhere to open Global Search. It searches every asset
type by name (models also by tag) and highlights matches. Pick a result to
open it in the right viewer tab.

### Working with Tabs

- **Open new tab**: Click items in the library to open them
- **Close tab**: Click the × button or middle-click the tab
- **Switch tabs**: Click on any tab to make it active
- **Drag tabs**: Rearrange tabs by dragging within a panel

## URL State Synchronization

Your workspace layout is automatically saved to the URL. This means:

:::tip Shareable Layouts
Copy and share URLs to give others the exact same view you're seeing.
:::

### What's Saved in the URL

- Open tabs (left and right panels)
- Active tab in each panel
- Which model, texture set, or environment map is being viewed

### Example URL

```
?leftTabs=modelList,model-5&rightTabs=textureSets&activeLeft=model-5
```

### Persistence

The URL state **survives page refresh** - your layout is restored exactly as you left it.

## Smart Tab Behavior

### Deduplication

Modelibr prevents opening the **same item twice** in the same panel:

- Clicking a model that's already open will **switch to that tab** instead of creating duplicate
- This keeps your workspace clean and prevents confusion

### Dual Panel Viewing

While duplicates are prevented within a single panel, you **can** open the same model in **both panels**:

- Open a model in the left panel
- Open the same model in the right panel
- Compare different views or settings side-by-side

This is useful for:

- Comparing model versions
- Viewing model while adjusting texture sets
- Side-by-side texture comparisons

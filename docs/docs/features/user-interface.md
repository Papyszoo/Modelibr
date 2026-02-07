---
sidebar_position: 4
---

# User Interface

Modelibr uses a flexible panel system that lets you organize your workspace and share layouts with URLs.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/user-interface.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Panel Layout

The interface is split into **two panels** (left and right), each containing multiple **tabs**.

### Tab Types

| Tab                    | Icon      | Description                    |
| ---------------------- | --------- | ------------------------------ |
| **Models**             | List      | Your model library grid        |
| **Texture Sets**       | Folder    | Browse and manage texture sets |
| **Sprites**            | Image     | Your sprite/image library      |
| **Sounds**             | Volume    | Your audio asset library       |
| **Packs**              | Inbox     | Reusable asset bundles         |
| **Projects**           | Briefcase | Project workspaces             |
| **Settings**           | Cog       | Application settings           |
| **Recycled Files**     | Trash     | Recover deleted items          |
| **Model Viewer**       | Cube      | 3D viewer for a specific model |
| **Texture Set Viewer** | Image     | Preview a texture set          |

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
- Which model/texture set is being viewed

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

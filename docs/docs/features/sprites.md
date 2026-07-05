---
sidebar_position: 5
---

# Sprites

Modelibr includes a built-in sprite manager for organizing 2D image assets alongside your 3D models. Sprites are ideal for icons, UI elements, reference images, and texture previews.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/sprites.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Uploading Sprites

### Drag and Drop

Drag image files directly onto the Sprite Library panel to upload them.

**Supported formats:** common image formats — PNG, JPG, WebP, GIF, APNG, BMP

### What Happens After Upload

1. **Sprite Created** — A new sprite entry appears in your library
2. **Thumbnail Generated** — A preview is generated automatically
3. **Ready to Use** — Click to view full-size or assign to packs/projects

:::tip Batch Upload
You can drag multiple images at once. Each file becomes a separate sprite.
:::

## Sprite Grid

Sprites are displayed in a responsive card grid with automatic thumbnails. Each card shows:

- **Preview thumbnail** — Visual preview of the image
- **Name** — The filename (editable)
- **File size** — Original file dimensions

## Managing Sprites

### Renaming

Right-click a sprite card and select **Rename** to change its display name.

### Organizing with Categories

Use the category sidebar (left of the grid) to organize sprites into groups:

- Click **Add Category** in the toolbar to create a new category
- Drag sprites onto a category in the sidebar to move them
- Hover a category to rename or delete it
- **Unassigned** collects sprites that aren't in any category

### Recycling

To remove a sprite:

1. Right-click the sprite card
2. Select **Recycle**
3. The sprite moves to [Recycled Files](./recycled-files)

:::note
Recycled sprites can be restored from the Recycled Files panel.
:::

## Using Sprites in Packs & Projects

Sprites can be added to [Packs](./packs) and [Projects](./projects) for organized asset collections. Open a pack or project and click **Add Sprite** to include sprites from your library.

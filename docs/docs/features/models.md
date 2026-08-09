---
sidebar_position: 1
---

# Model Management

Modelibr helps you organize and manage your 3D model library with automatic thumbnails, version control, and easy navigation.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/model-management.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Uploading Models

### Drag and Drop

The easiest way to upload models is to drag and drop files directly onto the Model Library panel.

![Model List](/img/screenshots/model-list.png)

**Supported formats:** GLB, GLTF, FBX, OBJ, STL, 3MF, Blend

### What Happens After Upload

1. **Model Created** - A new model entry appears in your library
2. **Thumbnail Generated** - The worker service renders a preview image
3. **Ready to View** - Click to open in the 3D viewer

:::tip Batch Upload
You can drag multiple files at once. Each file becomes a separate model.
:::

### Multi-file glTF (external `.bin` + textures)

A packed **GLB** is self-contained and always the recommended path. Some models,
though, ship only as a loose **`.gltf`** that references external files — a
`.bin` buffer and image textures alongside it (the Khronos glTF-Sample-Assets and
many kit layouts). A single-file upload can't resolve those references, so use one
of these instead:

- **Import folder** (folder toolbar button) — pick the folder that holds the
  models. Each `.gltf` is grouped with the `.bin`/textures in its directory and
  imported together; a whole library of subfolders imports in one action.
- **Import `.zip`** (archive toolbar button) — upload a `.zip` and the app unzips
  it, groups every model by directory, and imports each one.

The external files are stored with the model and resolved when its thumbnail and
scene graph are extracted, so a multi-file `.gltf` looks and behaves like its
packed `.glb` twin. Nothing is ever fetched from the network — only the files you
uploaded are used, and an unresolved reference is skipped with a warning rather
than failing the import.

## Organizing with Categories

Use the category sidebar (left of the grid) to organize models into groups:

- Right-click anywhere in the sidebar and choose **Add category**, then type
  the name directly in the tree
- Right-click a category to **Add subcategory**, **Rename**, or **Delete** it
  — deleting removes the whole branch, and its models become uncategorized
- Drag model cards onto a category in the sidebar to move them — dragging a
  selected card moves the whole selection
- **All** shows every one of your models; **Unassigned** collects models
  that aren't in any category

The **Categories** toolbar button hides or shows the sidebar; a badge on it
reminds you that a category filter is active while the sidebar is hidden. The
sidebar appears on the standalone Models tab — model grids embedded in packs
and projects are not category-filtered.

## Viewing Models

Click any model card to open it in the 3D viewer:

![Model Viewer](/img/screenshots/model-viewer.png)

### Viewer Controls

| Control            | Action        |
| ------------------ | ------------- |
| Left Click + Drag  | Rotate camera |
| Right Click + Drag | Pan camera    |
| Scroll Wheel       | Zoom in/out   |
| Double Click       | Reset camera  |

### Control Buttons

The viewer includes floating control buttons:

- **Add Version** - Upload a new version of this model
- **Viewer Settings** - Adjust lighting and environment
- **Model Info** - View file details and metadata
- **Texture Sets** - Apply textures to the model
- **Model Hierarchy** - Explore mesh structure
- **Thumbnail Details** - View and regenerate thumbnail
- **UV Map** - Preview UV mapping

## Version Control

Each model can have multiple versions, allowing you to track changes over time.

### Adding a New Version

1. Open a model in the viewer
2. Click **Add Version**
3. Select a new model file
4. Optionally add a description
5. Choose whether to set as active version

### Switching Versions

Use the version dropdown in the viewer header to switch between versions. Each version has its own:

- Thumbnail
- File(s)
- Default texture set

## Deleting Models

Models are **soft deleted** to the Recycle Bin, allowing recovery if needed.

1. Right-click on a model card
2. Select **Recycle**
3. Model moves to [Recycled Files](./recycled-files)

:::note
Deleting a model with multiple versions will recycle all versions together.
:::

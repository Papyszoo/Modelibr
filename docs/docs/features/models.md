---
sidebar_position: 1
---

# Model Management

Modelibr helps you organize and manage your 3D model library with automatic thumbnails, version control, and easy navigation.

## Uploading Models

### Drag and Drop

The easiest way to upload models is to drag and drop files directly onto the Model Library panel.

![Model List](/img/screenshots/model-list.png)

**Supported formats:** GLB, GLTF, FBX, OBJ, DAE, 3DS, Blend

### What Happens After Upload

1. **Model Created** - A new model entry appears in your library
2. **Thumbnail Generated** - The worker service renders a preview image
3. **Ready to View** - Click to open in the 3D viewer

:::tip Batch Upload
You can drag multiple files at once. Each file becomes a separate model.
:::

## Viewing Models

Click any model card to open it in the 3D viewer:

![Model Viewer](/img/screenshots/model-viewer.png)

### Viewer Controls

| Control | Action |
|---------|--------|
| Left Click + Drag | Rotate camera |
| Right Click + Drag | Pan camera |
| Scroll Wheel | Zoom in/out |
| Double Click | Reset camera |

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

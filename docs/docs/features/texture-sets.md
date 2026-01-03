---
sidebar_position: 2
---

# Texture Sets

Texture Sets allow you to manage PBR (Physically Based Rendering) textures and apply them to your 3D models.

## What is a Texture Set?

A Texture Set is a collection of texture images that define a material's appearance:

| Texture Type | Purpose |
|--------------|---------|
| **Albedo** | Base color/diffuse |
| **Normal** | Surface detail bumps |
| **Metallic** | Metal vs non-metal areas |
| **Roughness** | Surface smoothness |
| **Ambient Occlusion** | Soft shadows in crevices |
| **Emissive** | Self-illuminating areas |
| **Height** | Displacement mapping |
| **Opacity** | Transparency |

## Creating Texture Sets

### From the Texture Sets Panel

![Texture Sets](/img/screenshots/texture-sets.png)

1. Navigate to the **Texture Sets** tab
2. Click **Upload Textures** or drag and drop image files
3. A new texture set is created automatically, named after the file

### From the Model Viewer

1. Open a model in the viewer
2. Click the **Texture Sets** button
3. Upload textures directly to link them to the model

## Linking Texture Sets to Models

Texture sets are linked to **model versions**, not models. This means different versions can have different textures.

### To Link a Texture Set

1. Open the model in the viewer
2. Click **Texture Sets** button
3. Select a texture set from the list
4. Click **Link** to associate it with the current version

### Setting Default Texture

Each model version can have one **default texture set** that:
- Displays in the library thumbnail
- Loads automatically when viewing the model

To set default:
1. Link the texture set to the version
2. Click **Set as Default**

:::note Thumbnail Regeneration
Changing the default texture will regenerate the model's thumbnail.
:::

### Version Independence

Each model version maintains its **own** default texture set independently:

- Version 1 can have "Metal" as default
- Version 2 can have "Wood" as default
- Switching versions automatically loads that version's default texture

This allows you to preserve the intended look for each version of your model.

## Previewing Textures

You can preview different textures without setting them as default:

1. Open model in viewer
2. Select a linked texture set
3. The 3D view updates immediately
4. Switch between textures to compare

## Managing Texture Sets

### Renaming

Right-click a texture set and select **Rename**.

### Deleting

Texture sets are soft deleted to the Recycle Bin:

1. Right-click the texture set
2. Select **Recycle**

:::warning
Deleting a texture set will unlink it from all model versions using it.
:::

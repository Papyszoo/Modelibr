---
sidebar_position: 4
---

# Blender Addon

The Modelibr Blender addon enables direct integration with your model library, allowing you to browse, import, and upload models without leaving Blender.

## Features

- **Browse Models** - View your library with thumbnails
- **Import Models** - Load models directly into Blender
- **Upload Versions** - Create new versions of imported models
- **Upload New** - Add current scene as a new model
- **URI Handler** - Open models from the web app in Blender

## Installation

### Step 1: Download the Addon

Download `modelibr.zip` from the `blender-addon/` folder in the repository.

### Step 2: Install in Blender

1. Open Blender
2. Go to **Edit > Preferences > Add-ons**
3. Click **Install...**
4. Select `modelibr.zip`
5. Enable the addon by checking the checkbox

### Step 3: Configure

1. Expand the addon in preferences
2. Set your **Server URL** (e.g., `http://localhost:5009`)
3. Choose your **Default Export Format** (GLB recommended)

## Usage

### Accessing the Panel

1. Open a 3D Viewport
2. Press **N** to open the sidebar
3. Click the **Modelibr** tab

### Browsing Models

1. Click **Load Models** to fetch from server
2. Use the search box to filter
3. Select a model from the list
4. Click **Import** to load it

### Creating New Versions

After importing a model:

1. Make your changes in Blender
2. Click **Upload New Version**
3. Add an optional description
4. Click OK to upload

### Uploading New Models

1. Click **Upload as New Model**
2. Enter a name
3. Choose export format
4. Click OK

## URI Handler (Open in Blender)

To enable the "Open in Blender" button in the web app:

```bash
cd blender-addon
python install_uri_handler.py
```

This registers the `modelibr://` protocol so clicking "Open in Blender" launches Blender with the model context.

---

## Texture Handling

The Modelibr addon automatically manages textures when importing and exporting models.

### Importing Textures

When you import a model with textures:

1. **Texture sets** are downloaded and applied to materials
2. **Channel-packed textures** (like ORM) are automatically extracted into separate channels
3. Each texture is tagged with its **Modelibr file ID** for tracking changes

![SCREENSHOT: Import with textures applied to material]

### Texture Reuse

If you import multiple models that share the same texture set, the addon **reuses existing textures** instead of duplicating them. You'll see the user count increase on shared images.

![SCREENSHOT: Shared texture with user count > 1]

---

## Uploading Textures

### Modification Detection

The addon tracks which textures have changed since import:

- **Unchanged textures**: Referenced by file ID (not re-uploaded)
- **Modified textures**: Re-uploaded to server
- **New textures**: Uploaded as new files

This **selective upload** saves bandwidth and time when only some textures have changed.

### Channel Packing

When uploading, if the addon detects separate grayscale textures that could be packed (Roughness, Metallic, AO), you'll see a **Texture Packing** option in the upload dialog:

![SCREENSHOT: Upload dialog with Texture Packing box]

| Option | Description |
|--------|-------------|
| **Upload Separately** | Keep textures as individual files |
| **Pack into ORM** | Combine into single ORM texture (R=AO, G=Roughness, B=Metallic) |

> **Tip:** ORM textures are more efficient for real-time rendering and reduce file count.

---

## Addon Preferences

Access via **Edit > Preferences > Add-ons > Modelibr**:

![SCREENSHOT: Addon preferences panel]

| Setting | Description |
|---------|-------------|
| **Server URL** | URL of your Modelibr server |
| **Default Export Format** | GLB, GLTF, or FBX |
| **Always Include .blend File** | Upload source file with each version |
| **Show Channel Packing UI** | Show texture packing options on export |

---

## Troubleshooting

### Connection Failed
- Verify Modelibr server is running
- Check Server URL in addon preferences
- Ensure no firewall blocking

### Import Failed
- Check if format is supported
- Verify model has files in selected version
- Check Blender console for errors

### Upload Failed
- Ensure model context is set (import first)
- Check file size limits
- Verify API connectivity

### Textures Not Applied
- Check Blender console for texture loading errors
- Verify texture files exist in the texture set
- Ensure materials use Principled BSDF shader


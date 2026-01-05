---
sidebar_position: 1
slug: /
---

# Getting Started

Modelibr is a self-hosted 3D model library that helps you organize, preview, and manage your 3D assets.

## Features

- **3D Model Library** - Upload and organize OBJ, FBX, GLTF/GLB, and Blender files
- **Automatic Thumbnails** - Generated previews for quick browsing
- **Version Control** - Track changes with multiple versions per model
- **Texture Sets** - Manage PBR textures and apply them to models
- **Blender Integration** - Direct import/export via addon
- **Recycle Bin** - Safe deletion with restore capability

## Quick Start

### 1. Start the Application

```bash
docker compose up -d
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080

### 2. Upload Your First Model

1. Open the application in your browser
2. Drag and drop a 3D model file onto the Model Library panel
3. Wait for the thumbnail to generate

![Model List](/img/screenshots/model-list.png)

### 3. View Models in 3D

Click on any model card to open it in the 3D viewer:

![Model Viewer](/img/screenshots/model-viewer.png)

## Supported File Formats

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| GLB/GLTF | ✅ | ✅ | Recommended |
| FBX | ✅ | ✅ | Binary format |
| OBJ | ✅ | ✅ | With MTL support |
| .blend | ✅ | - | Native Blender files |

## Next Steps

- [Model Management](./features/models) - Learn about versions and organization
- [Texture Sets](./features/texture-sets) - Apply PBR textures to your models
- [Blender Addon](./features/blender-addon) - Integrate with your Blender workflow

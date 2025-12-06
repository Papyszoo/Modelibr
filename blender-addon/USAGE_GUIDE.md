# Modelibr Blender Addon - Usage Guide

## Quick Start

### Step 1: Open the Browser
There are three ways to open the Modelibr Browser:

**Method 1: Window Menu** (Recommended)
```
Top Menu Bar → Window → Modelibr Browser
```

**Method 2: Sidebar Panel**
```
3D Viewport → Press N → Modelibr Tab → "Open Browser Window" button
```

**Method 3: Search**
```
Press F3 → Type "Modelibr Browser" → Enter
```

## Browser Interface

### Layout Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Modelibr Browser Window                          │
├─────────────────────────────────────────────────────────────────────┤
│  [Test Connection]  Current: My Model #123  [×]                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ Browse ] [ Versions ] [ Upload ]    ← Tab Selector               │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                      (Tab Content Area)                             │
│                                                                      │
│                     See tabs below for details                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Browse Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  [🔍 Search...           ] [🔄] [🖼️]    ← Search, Refresh, Thumbnails│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Models (15):                                                        │
│                                                                      │
│  ┌────────────────┬────────────────────────────────────────────────┐│
│  │ Model List     │ Model Details                                  ││
│  │                │                                                 ││
│  │ □ Car Model    │ Preview:                                       ││
│  │ ☑ Chair v2     │ [Thumbnail available ✓]                        ││
│  │ □ Table        │                                                 ││
│  │ □ Lamp         │ Chair v2                                        ││
│  │ □ Desk         │ ─────────────                                   ││
│  │ □ Monitor      │ Description:                                    ││
│  │ □ Keyboard     │ Modern office chair with ergonomic design      ││
│  │ □ Mouse        │                                                 ││
│  │ □ Plant        │ Tags: furniture office                         ││
│  │ □ Book         │ Created: 2024-01-15 10:30:00                   ││
│  │                │                                                 ││
│  │                │ [     Import Model      ]                      ││
│  └────────────────┴────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Controls:
- 🔍 Search box: Filter models by name or tags
- 🔄 Refresh: Reload model list from server
- 🖼️ Toggle: Show/hide thumbnails
- Click model: Select and view details
- Import button: Download and import selected model
```

### Versions Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  Model: Chair v2 [#123]                                             │
│                                                                      │
│  [      Load Versions      ]                                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Version List                                                    │ │
│  │                                                                 │ │
│  │ Version 3  ✓  (2 files)                                        │ │
│  │ Version 2     (1 file)                                         │ │
│  │ Version 1     (3 files)                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Version #3                                                          │
│  ───────────                                                         │
│  Fixed materials and textures                                        │
│  Created: 2024-01-20 14:45:00                                        │
│  Active Version ✓                                                    │
│                                                                      │
│  Files:                                                              │
│  📦 chair_v3.glb (2.4 MB)                                           │
│  📦 chair_v3.blend (8.1 MB)                                         │
│                                                                      │
│  [     Import This Version      ]                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Features:
- Shows all versions of current model
- ✓ indicates active version
- Lists all files in each version
- Import specific version with one click
```

### Upload Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  Upload to: Chair v2                                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  [      Upload New Version      ]                              │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Create New Model                                                    │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  [      Upload as New Model      ]                             │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Notes:
- "Upload New Version" requires a model context (import a model first)
- "Upload as New Model" works anytime
- Both open dialog boxes with export options
```

## Workflow Examples

### Example 1: Browse and Import a Model

1. Open Browser (Window → Modelibr Browser)
2. Browser opens on Browse tab
3. Type "chair" in search box
4. Click "Chair v2" in model list
5. Review details in right panel
6. Click "Import Model" button
7. Model downloads and imports into Blender
8. Model context is set (shown in header)

### Example 2: View Model Versions

1. After importing a model (or with model context set)
2. Click "Versions" tab
3. Click "Load Versions" button
4. List of versions appears
5. Click a version to see details
6. Review files included in that version
7. Click "Import This Version" to switch versions

### Example 3: Upload New Version

1. Import a model to set context
2. Make changes to the model in Blender
3. Click "Upload" tab
4. Click "Upload New Version"
5. Dialog opens with options:
   - Description field
   - Export format (GLB/FBX/OBJ)
   - Set as active checkbox
   - Include .blend file checkbox
6. Configure options and click OK
7. Model exports and uploads to server

### Example 4: Create New Model

1. Create your model in Blender
2. Open Browser (any tab)
3. Click "Upload" tab
4. Click "Upload as New Model"
5. Dialog opens:
   - Model name field
   - Export format selection
   - Include .blend file option
6. Enter name, configure options
7. Click OK to create new model

## Tips and Tricks

### Keyboard Shortcuts
- **F3**: Quick search (type "Modelibr Browser")
- **N**: Toggle sidebar (where Modelibr panel is)
- **Esc**: Close browser window

### Efficient Browsing
- Use search to quickly filter large model libraries
- Toggle thumbnails off for faster loading on slow connections
- Keep browser window open while working (it's modal but non-blocking)

### Version Management
- Always check which version is active (✓ marker)
- Review file list before importing to ensure correct format
- Import specific versions to test different iterations

### Upload Best Practices
- Add descriptive version descriptions
- Choose export format based on target use:
  - GLB: Best for web/real-time engines
  - FBX: Good for game engines and DCC apps
  - OBJ: Universal but limited features
- Include .blend file for full editability

### Thumbnail Display
- Thumbnails cache locally for fast access
- Cache persists across Blender sessions
- Toggle off if not needed to save screen space

## Troubleshooting

### Browser Won't Open
- Check that addon is enabled (Edit → Preferences → Add-ons)
- Look for errors in System Console (Window → Toggle System Console)
- Try restarting Blender

### Models Not Loading
1. Click "Test Connection" in header
2. Check server URL in preferences
3. Verify server is running
4. Check network connection

### Thumbnails Not Showing
- Thumbnails require server-side generation
- Check if model has thumbnail in web interface
- Try clicking refresh button
- Toggle thumbnails off and on again

### Version List Empty
- Ensure model context is set (import a model first)
- Click "Load Versions" button
- Check server connection
- Verify model has versions on server

### Import Fails
- Check file format is supported
- Verify version has renderable files
- Check available disk space
- Review Blender console for errors

## Integration with Web App

### "Open in Blender" Feature
1. Install URI handler (see main README)
2. In Modelibr web app, click "Open in Blender"
3. Blender launches automatically
4. Model context is pre-set
5. You can immediately create new versions

### Workflow
```
Web App                          Blender
   │                                │
   ├─→ "Open in Blender"           │
   │                                │
   │   ←──────────────────────────→ │
   │   modelibr://open?modelId=123  │
   │                                │
   │                             Launches
   │                                │
   │                        Context Set: Model #123
   │                                │
   │                        Make Changes
   │                                │
   │                        Upload New Version
   │                                │
   │   ←────────── New Version ─────┤
   │                                │
   ├─→ Version appears in web UI    │
```

## Advanced Usage

### Multiple Windows
- You can open multiple 3D Viewports
- Each can have its own Modelibr sidebar panel
- Browser window is shared across viewports
- Model context is scene-wide

### Batch Workflows
- Use Python scripting for batch imports
- Access operators: `bpy.ops.modelibr.import_model(model_id=123)`
- Automate uploads with custom scripts
- Integrate with Blender's command-line mode

### API Integration
- All browser operations use REST API
- Custom scripts can use `api_client.py`
- Extend functionality with custom operators
- Add new tabs or features to browser

## Summary

The Modelibr window-based browser provides a professional, integrated workflow for:
- ✅ Browsing models with visual previews
- ✅ Managing model versions
- ✅ Importing any version of any model
- ✅ Uploading new models and versions
- ✅ Seamless integration with Modelibr server

Access it via **Window → Modelibr Browser** and start managing your 3D asset library!

# Asset Browser Integration Guide

This document describes the Asset Browser integration architecture for the Modelibr Blender addon.

## Overview

The Asset Browser integration allows users to manage Modelibr 3D models as native Blender assets, providing:
- Seamless integration with Blender's Asset Browser
- Automatic syncing from the Modelibr server
- Version management for assets
- Metadata preservation and tagging
- Thumbnail support
- Future extensibility for scenes and other asset types

## Architecture

### Components

#### 1. Asset Library Handler (`asset_browser.py`)

The `AssetLibraryHandler` class is the core component managing the asset library:

**Key Responsibilities:**
- Library path management (`get_library_path()`)
- Library registration in Blender preferences (`register_asset_library()`)
- Asset synchronization from API (`sync_assets_from_api()`)
- Asset creation as .blend files (`create_asset_blend()`)
- Asset metadata marking (`mark_object_as_asset()`)

**Library Location:**
```
{blender_user_data}/modelibr_assets/
  ├── model_123/
  │   ├── model_v1.blend
  │   ├── model_v2.blend
  │   └── thumbnail.webp
  ├── model_456/
  │   ├── model_v1.blend
  │   └── thumbnail.webp
  └── ...
```

#### 2. Asset Operators (`asset_operators.py`)

Operators specifically designed for Asset Browser workflows:

**`MODELIBR_OT_register_asset_library`**
- Registers the Modelibr library in Blender's preferences
- Creates the library directory if needed
- Called automatically on first addon load

**`MODELIBR_OT_sync_assets`**
- Downloads all models from the API
- Creates .blend files for each model
- Marks objects as assets with metadata
- Downloads thumbnails
- Progress reporting during sync

**`MODELIBR_OT_switch_version`**
- Loads a different version of an asset
- Used for version management
- Imports from versioned .blend files

**`MODELIBR_OT_import_from_browser`**
- Placeholder for future custom import logic
- Currently, native drag-and-drop works

#### 3. Asset Browser Panels (`asset_panels.py`)

UI panels that appear in the Asset Browser sidebar:

**`ASSETBROWSER_PT_modelibr_tools`**
- Library registration status
- Sync assets button
- Upload tools (new model, new version)
- Connection test

**`ASSETBROWSER_PT_modelibr_details`**
- Current model context display
- Version information
- Future: Version switching UI

**`ASSETBROWSER_PT_modelibr_info`**
- Quick help and usage instructions
- Step-by-step guide for users

### Metadata System

Each asset stores metadata in two ways:

#### 1. Blender Asset Metadata
```python
obj.asset_data.description = "Model description"
obj.asset_data.tags.new("environment")
obj.asset_data.tags.new("outdoor")
```

#### 2. Custom Properties (ID Properties)
```python
obj["modelibr_model_id"] = 123
obj["modelibr_version_id"] = 456
obj["modelibr_version_number"] = 2
obj["modelibr_asset_type"] = "MODEL"
obj["modelibr_model_name"] = "Cool Building"
obj["modelibr_description"] = "A cool building model"
```

Custom properties ensure metadata persists even if Blender's asset system changes.

## Asset Types

The system is designed to support multiple asset types (as defined in `properties.py`):

### Current: MODEL
3D models that can be imported into scenes.

### Future: TEXTURE
Texture files and material assets.

### Future: RIG
Rigging setups for characters and objects.

### Future: ANIMATION
Animation clips and sequences.

### Future: SCENE
Complete scenes with references to other assets. Key design:
- Scene assets are .blend files containing an empty scene
- Models are linked (not appended) for efficiency
- Scene metadata includes `referenced_models` field listing model IDs
- Scene thumbnail generated from scene render

## Workflow Diagrams

### Asset Sync Workflow

```
User clicks "Sync Assets"
    ↓
Fetch models from API
    ↓
For each model:
    ↓
    Fetch active version
    ↓
    Download model files to temp
    ↓
    Create new .blend file
    ↓
    Import model into blend
    ↓
    Mark objects as assets
    ↓
    Add Modelibr metadata
    ↓
    Download thumbnail
    ↓
    Save .blend to library
    ↓
Complete
```

### Asset Import Workflow

```
User drags asset from browser
    ↓
Blender loads .blend file
    ↓
Objects imported with metadata
    ↓
(Optional) User uploads new version
    ↓
Version uploaded to server
    ↓
Model context preserved
```

## Version Management

### Version Storage
- Each version stored as separate .blend file
- Filename: `model_v{version_number}.blend`
- Active version determined by API
- All versions available locally after sync

### Version Switching
Future implementation:
1. List available versions in Asset Details panel
2. User selects different version
3. Operator imports that version's .blend file
4. Scene updated with new version

## Future Enhancements

### Scene Assets (Priority)

**Creation:**
1. User creates scene in Blender
2. Clicks "Upload as Scene" operator
3. Operator:
   - Identifies all Modelibr assets in scene
   - Creates metadata with referenced model IDs
   - Saves scene .blend with linked assets
   - Uploads to server with scene thumbnail

**Loading:**
1. User drags scene from Asset Browser
2. Operator:
   - Loads scene .blend
   - Verifies all referenced models are available
   - Auto-syncs missing models if needed
   - Instantiates scene with all assets

### Other Asset Types

**Textures:**
- Store as material asset in .blend
- Include texture files
- Metadata for texture properties

**Rigs:**
- Store armature as asset
- Include constraints and drivers
- Metadata for rig features

**Animations:**
- Store as Action asset
- Include animation data
- Metadata for animation properties

## API Integration

### Current Endpoints Used
- `GET /models` - List all models
- `GET /models/{id}` - Get model details
- `GET /models/{id}/versions` - Get versions
- `GET /files/{id}` - Download file
- `GET /models/{id}/thumbnail/file` - Download thumbnail

### Future Endpoints Needed
- `GET /assets/types` - List supported asset types
- `GET /scenes` - List scene assets
- `POST /scenes` - Create scene asset
- `GET /scenes/{id}` - Get scene details

## Configuration

### Preferences

Users can configure:
- Server URL
- API key
- Enable/disable Asset Browser integration
- Default export format
- Always include .blend file

### Library Path

The library path is automatically determined:
- **Linux:** `~/.config/blender/4.0/modelibr_assets/`
- **macOS:** `~/Library/Application Support/Blender/4.0/modelibr_assets/`
- **Windows:** `%APPDATA%\Blender Foundation\Blender\4.0\modelibr_assets\`

Cannot be changed by user (follows Blender conventions).

## Error Handling

### Common Issues

**Library not registered:**
- Addon auto-registers on first load
- Manual registration via preferences
- Check permissions on library directory

**Sync fails:**
- Check server connectivity
- Verify API credentials
- Check disk space
- Review Blender console for errors

**Assets don't appear:**
- Refresh Asset Browser (F5)
- Verify Modelibr library is selected
- Check if sync completed successfully
- Restart Blender if needed

### Logging

All operations log to:
- Blender's console (stdout)
- Blender's System Console (Windows)
- Terminal (Linux/macOS when launched from terminal)

Debug format: `[Modelibr] <message>`

## Performance Considerations

### Sync Behavior and Strategy

**Current Implementation:**
The "Sync Assets from Server" operation downloads ALL model files immediately:
- Downloads each model file to temporary storage
- Creates a .blend asset file for each model
- Stores assets in the local asset library
- Downloads thumbnails for each model

**Storage Impact:**
- Each synced model: ~1-10 MB (typical) for the .blend file
- Thumbnails: ~50-200 KB each (WebP format)
- Total storage scales linearly with number of models
- Large collections (100+ models) can use 1-5 GB of disk space

**Considerations for Large Collections:**
If you plan to have a huge collection of files and don't want to download them all:
1. **Use Sidebar Workflow**: The traditional sidebar (View3D > Sidebar > Modelibr) downloads models on-demand when you import them
2. **Selective Sync** (future): We plan to add options to sync only specific models or categories
3. **Lazy Loading** (future): Placeholder assets that download on first use

**Alternative Workflow:**
For large collections, consider using the sidebar instead of Asset Browser:
- Models listed without downloading
- Files downloaded only when imported
- Search and filter before downloading
- More suitable for large libraries (1000+ models)

### Sync Performance
- Downloads files sequentially to avoid server overload
- Creates assets in background
- Progress reporting for user feedback
- Recommended: Sync during downtime or off-hours
- Consider network bandwidth for large collections

### Asset Loading
- .blend files are lightweight once created
- Assets load on-demand (Blender's standard behavior)
- Thumbnails cached by Blender
- No performance impact on normal Blender usage after sync

### Thumbnail Handling
- Thumbnails downloaded as WebP images
- Animated WebP thumbnails display as static (first frame only) in Blender
- Blender's Asset Browser does not support animated previews
- Thumbnails cached by Blender for fast browsing

## Testing Checklist

### Basic Functionality
- [ ] Library auto-registers on first load
- [ ] Manual registration works from preferences
- [ ] Sync downloads all models
- [ ] Assets appear in Asset Browser
- [ ] Thumbnails display correctly
- [ ] Drag-and-drop import works
- [ ] Metadata preserved on import

### Upload Workflows
- [ ] Upload new model from Asset Browser
- [ ] Upload new version from Asset Browser
- [ ] Upload operators show in Asset Browser panels
- [ ] Uploaded models appear on server

### Backward Compatibility
- [ ] Sidebar panels still work
- [ ] Existing operators function
- [ ] URI handler still works
- [ ] Model context preserved

### Error Handling
- [ ] Graceful handling of network errors
- [ ] Proper error messages to user
- [ ] Recovery from partial sync
- [ ] Works without internet after initial sync

## Development Tips

### Adding New Asset Types

1. Add type to `ModelibrAssetMetadata.asset_type` enum in `properties.py`
2. Update `AssetLibraryHandler.create_asset_blend()` for new type
3. Add type-specific metadata fields
4. Create operators for creating/loading new type
5. Add UI panels for new type
6. Update API client with new endpoints

### Debugging

Enable Blender's Developer Extras:
1. Edit → Preferences → Interface
2. Check "Developer Extras"
3. Access Python console (Shift+F4)
4. View operator execution logs

### Testing Without Server

Create mock data:
```python
# In Blender's Python console
import bpy
from blender-addon.modelibr.asset_browser import AssetLibraryHandler

# Create test asset
handler = AssetLibraryHandler()
handler.ensure_library_exists()
# Manually create test .blend files in library
```

## Contributing

When contributing to the asset system:

1. **Follow existing patterns** - Match coding style in existing modules
2. **Preserve backward compatibility** - Don't break sidebar workflow
3. **Add error handling** - All operations should handle failures gracefully
4. **Update documentation** - Keep this guide current
5. **Test thoroughly** - Verify both new and existing functionality

## References

- [Blender Asset Browser Documentation](https://docs.blender.org/manual/en/latest/editors/asset_browser.html)
- [Blender Python API - Asset Data](https://docs.blender.org/api/current/bpy.types.AssetMetaData.html)
- [Modelibr API Documentation](../../docs/)

## License

Part of the Modelibr project. See main repository for license information.

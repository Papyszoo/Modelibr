# Modelibr Window-Based Browser Interface

## Overview

The Modelibr Blender addon has been upgraded from a simple sidebar panel to a comprehensive window-based browser interface, similar to Blender's built-in Asset Browser and File Browser.

## What's New (v1.1.0)

### 1. Window-Based Browser Interface (`space.py`)
- **Dedicated Browser Window**: Open a modal window with full browser functionality
- **Accessible via Window Menu**: Found in Window > Modelibr Browser
- **Also accessible via**: Sidebar panel button or F3 search menu
- **Tabbed Interface**: Three tabs for different workflows:
  - **Browse Tab**: Search and browse all available models
  - **Versions Tab**: View all versions of the selected model
  - **Upload Tab**: Upload new models or versions

### 2. Thumbnail Preview Support (`thumbnails.py`)
- **Automatic Thumbnail Caching**: Thumbnails are downloaded and cached locally
- **Cache Location**: System temp directory (`/tmp/modelibr_thumbnails`)
- **Toggle Display**: Show/hide thumbnails with a button in the browser
- **Persistent Cache**: Thumbnails persist across Blender sessions

### 3. Version Management
- **Version Browser**: View all versions of any model
- **Version Details**: See version number, description, creation date
- **Active Version Indicator**: Clearly shows which version is active
- **File List**: View all files included in each version
- **Import Specific Versions**: Choose exactly which version to import

### 4. Enhanced UI Components
- **New Operator**: `MODELIBR_OT_open_browser` - Opens the browser window
- **New Operator**: `MODELIBR_OT_refresh_versions` - Refreshes version list
- **New UIList**: `MODELIBR_UL_version_list` - Displays versions in a list
- **Enhanced Properties**: Added browser tab selection, thumbnail toggle, versions collection

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────┐
│                  __init__.py                        │
│            (Main registration module)                │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   panels.py  │  │   space.py   │  │ operators.py │
│  (Sidebar)   │  │  (Browser)   │  │  (Actions)   │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │  properties.py  │  thumbnails.py    │
        │  (Data)         │  (Cache)          │
        └─────────────────────────────────────┘
```

### Key Files

#### `space.py` - Window Browser
- `MODELIBR_OT_open_browser`: Main browser operator
- `_draw_browse_tab()`: Renders model browsing interface
- `_draw_versions_tab()`: Renders version management interface
- `_draw_upload_tab()`: Renders upload interface
- Split-panel layout for better information display

#### `thumbnails.py` - Thumbnail Management
- `ThumbnailCache`: Manages thumbnail downloads and caching
- `get_thumbnail_cache()`: Returns global cache instance
- `load_thumbnail_preview()`: Loads thumbnails into Blender's preview system
- Automatic cleanup and cache management

#### `properties.py` - Enhanced Data Structures
- Added `browser_tab`: Enum for tab selection (Browse/Versions/Upload)
- Added `show_thumbnails`: Boolean to toggle thumbnail display
- Added `versions`: Collection of version items
- Added `active_version_index`: Track selected version

#### `operators.py` - New Operations
- `MODELIBR_OT_refresh_versions`: Fetches version list from API
- Populates version collection with full details
- Includes file information for each version

## Usage Flow

### Opening the Browser
```
Window Menu > Modelibr Browser
        │
        ▼
Modal Window Opens (900px wide)
        │
        ▼
Default: Browse Tab
```

### Browsing Models
```
Browse Tab
    │
    ├─→ Search/Filter Models
    ├─→ View Thumbnails (optional)
    ├─→ Select Model → View Details
    └─→ Import Model
            │
            ▼
        Model Context Set
```

### Managing Versions
```
Versions Tab
    │
    ├─→ Load Versions (requires model context)
    ├─→ View Version List
    ├─→ Select Version → View Details & Files
    └─→ Import Specific Version
```

### Uploading
```
Upload Tab
    │
    ├─→ Upload New Version (requires model context)
    └─→ Upload as New Model
```

## Integration Points

### Window Menu
The browser is registered in Blender's Window menu:
```python
bpy.types.TOPBAR_MT_window.append(draw_modelibr_menu)
```

### Sidebar Panel
The original sidebar panel remains for quick access:
- Shows current model context
- Provides "Open Browser Window" button
- Test connection shortcut

### Search Menu
Available via F3 search:
- Type "Modelibr Browser"
- Direct access to browser window

## API Usage

The window interface uses these Modelibr API endpoints:

| Endpoint | Method | Used By |
|----------|--------|---------|
| `/models` | GET | Browse tab - model list |
| `/models/{id}` | GET | Browse tab - model details |
| `/models/{id}/versions` | GET | Versions tab - version list |
| `/models/{id}/versions/{versionId}` | GET | Version details |
| `/models/{id}/thumbnail/file` | GET | Thumbnail preview |
| `/files/{id}` | GET | File download for import |

## Technical Details

### Modal Dialog Window
- Uses `invoke_props_dialog()` for modal window
- Width: 900px (configurable)
- Dynamic updates via `check()` method
- Proper cleanup on close

### Tab System
- Uses EnumProperty for tab selection
- Each tab has dedicated draw function
- Preserves state between tab switches
- Clean separation of concerns

### Thumbnail System
- Async download support (prepared for future)
- WebP format for efficiency
- Cached in system temp directory
- Preview collection management
- Automatic cleanup on unregister

### Version Management
- Full version metadata stored
- File list with size and type info
- Active version indicator
- Import any version capability

## Benefits

### User Experience
- **Better Organization**: Clear tabbed interface
- **More Information**: Larger window shows more details
- **Visual Browsing**: Thumbnail support for quick identification
- **Version Control**: Complete version history access
- **Professional Look**: Similar to built-in Blender browsers

### Developer Experience
- **Modular Design**: Clear separation of concerns
- **Extensible**: Easy to add new tabs or features
- **Maintainable**: Well-organized code structure
- **Type-Safe**: Proper use of Blender's property system

### Performance
- **Cached Thumbnails**: Faster browsing on repeat visits
- **Lazy Loading**: Data loaded only when needed
- **Efficient Updates**: Only refreshes what changed

## Future Enhancements

Potential improvements for future versions:

1. **Grid View**: Icon-based grid layout for thumbnails
2. **Filtering**: Advanced filtering by tags, date, file type
3. **Sorting**: Multiple sort options (name, date, size)
4. **Batch Operations**: Import/export multiple models at once
5. **Preview 3D**: Real-time 3D preview in browser
6. **Drag & Drop**: Drag models directly into viewport
7. **Favorites**: Mark favorite models for quick access
8. **Recent Models**: Quick access to recently used models

## Migration from v1.0

Users upgrading from v1.0 will:
- Retain all existing sidebar panel functionality
- Gain access to new window-based browser
- See "Open Browser Window" button in sidebar
- Find browser in Window menu
- Experience no breaking changes

## Testing Checklist

- [ ] Browser opens from Window menu
- [ ] Browser opens from sidebar panel
- [ ] Browser opens from F3 search
- [ ] Browse tab displays models
- [ ] Search filters models correctly
- [ ] Thumbnail toggle works
- [ ] Model selection shows details
- [ ] Import button works
- [ ] Versions tab shows when model selected
- [ ] Version list loads correctly
- [ ] Version details display
- [ ] Version import works
- [ ] Upload tab shows correct options
- [ ] Upload new version works (with context)
- [ ] Upload new model works
- [ ] Tab switching preserves state
- [ ] Error messages display properly
- [ ] Loading indicators appear
- [ ] Connection test works

## Conclusion

The window-based interface transforms Modelibr from a simple sidebar tool into a comprehensive model management system within Blender, providing users with a professional, integrated workflow for browsing, versioning, and managing 3D models.

# Modelibr Blender Addon

A Blender addon that integrates with the self-hosted Modelibr application, enabling users to browse, import, and upload 3D models directly from within Blender. Features full Asset Browser integration for seamless asset management.

## Features

-   **Asset Browser Integration** (NEW) - Access your Modelibr models through Blender's native Asset Browser
-   **Automatic Asset Library** - Models are automatically synced to a local asset library with thumbnails
-   **Model Browser Panel** - Browse and search models from your Modelibr server (legacy sidebar view)
-   **Model Import** - Import models directly into Blender (supports GLB, FBX, OBJ, and .blend files)
-   **Version Upload** - Create new versions of models you're working on (accessible from both sidebar and Asset Browser)
-   **New Model Upload** - Upload current scene as a completely new model
-   **Open from Web App** - Support for `modelibr://` URI scheme for opening Blender from the web app

## Requirements

-   Blender 4.0 or higher
-   Python 3.10+ (included with Blender 4.0+)
-   A running Modelibr server

## Installation

### 1. Install the Addon

**Option A: Using Blender's Install Method (Recommended)**

1. Download or clone this repository
2. Create a zip file of the `modelibr` folder (the one containing `__init__.py`, not the `blender-addon` folder)
    - On Windows: Right-click the `modelibr` folder → Send to → Compressed (zipped) folder
    - On macOS/Linux: `cd blender-addon && zip -r modelibr.zip modelibr/`
3. In Blender, go to **Edit > Preferences > Add-ons**
4. Click **Install...** and select the `modelibr.zip` file
5. Enable the addon by checking the checkbox next to "Import-Export: Modelibr"

**Option B: Manual Installation**

Manually copy the `modelibr` folder (the one containing `__init__.py`) to your Blender addons directory:

-   **Windows**: `%APPDATA%\Blender Foundation\Blender\4.0\scripts\addons\`
-   **macOS**: `~/Library/Application Support/Blender/4.0/scripts/addons/`
-   **Linux**: `~/.config/blender/4.0/scripts/addons/`

Then restart Blender and enable the addon in preferences.

### 2. Configure the Addon

1. In Blender, go to **Edit > Preferences > Add-ons**
2. Find "Modelibr" in the list and expand it
3. Set your **Server URL** (e.g., `http://localhost:5009` for local development)
4. If your server requires authentication, enter your **API Key**
5. Configure your preferred **Default Export Format** (GLB, FBX, or OBJ)
6. Optionally enable **Always Include .blend File** for uploads
7. Enable **Asset Browser Integration** (enabled by default)
8. Click **Register Asset Library** to add Modelibr to your asset libraries

The asset library is automatically registered on first load, but you can manually register it from preferences if needed.

### 3. Install URI Handler (Optional)

To enable the "Open in Blender" button from the Modelibr web app, you need to register the `modelibr://` URI scheme:

```bash
# From the blender-addon directory
python install_uri_handler.py

# Or specify your Blender path explicitly
python install_uri_handler.py /path/to/blender
```

This script will register the URI handler for your operating system:

-   **Windows**: Adds registry entries for the protocol handler
-   **macOS**: Creates a launcher app and registers it with Launch Services
-   **Linux**: Creates a .desktop file and registers with xdg-mime

## Usage

### Using the Asset Browser (Recommended)

The Asset Browser integration provides the most streamlined workflow:

1. Open the **Asset Browser** (Top left area type menu → Asset Browser, or via workspace)
2. In the Asset Browser sidebar, find the **Modelibr** tab
3. Click **Sync Assets from Server** to download all models as assets
4. Select the **Modelibr** library from the library dropdown
5. Browse your models with thumbnails
6. **Drag and drop** assets into your scene to import them

The Asset Browser panels provide:
-   **Modelibr Tools** - Sync assets, upload new models, test connection
-   **Asset Details** - View model context and version information
-   **Quick Help** - Usage instructions

**Important Notes:**
-   **Sync Downloads All Files**: The "Sync Assets from Server" operation downloads all model files and creates local .blend assets. This is by design for offline access. For large collections, consider syncing selectively or using the sidebar workflow which downloads models on-demand.
-   **Thumbnails**: Thumbnails are downloaded as WebP images. If your server provides animated WebP thumbnails, Blender will display only the first frame as static previews.
-   **Storage**: Each synced model requires disk space for both the .blend asset file and the original model file during processing.

### Using the Sidebar (Legacy)

The traditional sidebar interface is still available:

1. Open a 3D Viewport
2. Press **N** to open the sidebar (or View > Sidebar)
3. Click on the **Modelibr** tab

**Browsing Models:**

1. Click **Load Models** or the refresh button to fetch models from your server
2. Use the search box to filter models by name or tags
3. Select a model from the list
4. Click **Import** to import the selected model

**Importing Models:**

When importing a model:

-   The addon will download the active version by default
-   File format priority: GLB > FBX > OBJ > .blend
-   The model context is automatically set after import

### Uploading New Versions

After importing a model (or opening via URI):

1. Make your changes to the model
2. Click **Upload New Version**
3. Choose your export format and options
4. Add a description (optional)
5. Click OK to upload

### Uploading New Models

1. Click **Upload as New Model**
2. Enter a name for your model
3. Choose your export format and options
4. Click OK to upload

### Opening from Web App

1. Install the URI handler (see above)
2. In the Modelibr web app, click "Open in Blender" on any model
3. Blender will launch with the model context pre-set
4. You can then create new versions of that model

## Supported File Formats

### Import

-   **GLB/GLTF** - GL Transmission Format
-   **FBX** - Autodesk FBX
-   **OBJ** - Wavefront OBJ
-   **.blend** - Native Blender files

### Export/Upload

-   **GLB** - GL Transmission Format Binary (recommended)
-   **FBX** - Autodesk FBX
-   **OBJ** - Wavefront OBJ
-   **.blend** - Can be included alongside exported model

## API Endpoints Used

The addon communicates with the following Modelibr API endpoints:

| Endpoint                                  | Method | Description          |
| ----------------------------------------- | ------ | -------------------- |
| `/models`                                 | GET    | List all models      |
| `/models/{id}`                            | GET    | Get model details    |
| `/models/{id}/versions`                   | GET    | Get model versions   |
| `/models/{id}/versions/{versionId}`       | GET    | Get specific version |
| `/files/{id}`                             | GET    | Download file        |
| `/models/{id}/thumbnail/file`             | GET    | Download thumbnail   |
| `/models`                                 | POST   | Create new model     |
| `/models/{id}/versions`                   | POST   | Create new version   |
| `/models/{id}/versions/{versionId}/files` | POST   | Add file to version  |

## Troubleshooting

### Connection Failed

-   Verify your Modelibr server is running
-   Check the Server URL in addon preferences
-   Ensure no firewall is blocking the connection

### Import Failed

-   Check if the file format is supported
-   Verify the model has files in the selected version
-   Check Blender's console for error details

### Upload Failed

-   Ensure you have a model context set (import first or use URI)
-   Check file size limits on your server
-   Verify your API key has write permissions

### URI Handler Not Working

-   Re-run the `install_uri_handler.py` script
-   On Linux, try logging out and back in
-   On macOS, restart the Finder
-   On Windows, try running as administrator

### Asset Sync Issues

-   If assets don't appear after sync, try refreshing the Asset Browser
-   Check Blender's console for sync errors
-   Verify you have write permissions to the asset library directory
-   The library is located at: `{blender_user_data}/modelibr_assets/`

### Asset Library Not Showing

-   Go to Edit → Preferences → Add-ons → Modelibr
-   Click "Register Asset Library"
-   Restart Blender if needed

## Development

### Project Structure

```
blender-addon/
├── modelibr/
│   ├── __init__.py          # Addon registration
│   ├── preferences.py       # Addon preferences
│   ├── properties.py        # Scene properties & asset metadata
│   ├── api_client.py        # REST API client
│   ├── operators.py         # Blender operators (sidebar)
│   ├── panels.py            # UI panels (sidebar)
│   ├── handlers.py          # URI and startup handlers
│   ├── asset_browser.py     # Asset library management
│   ├── asset_operators.py   # Asset Browser operators
│   └── asset_panels.py      # Asset Browser panels
├── install_uri_handler.py   # URI handler installer
└── README.md                # This file
```

### Asset System Architecture

The asset system consists of three main components:

1. **AssetLibraryHandler** (`asset_browser.py`): Manages the local asset library
   - Registers the library in Blender preferences
   - Syncs models from API to local .blend files
   - Creates assets with proper metadata and tags

2. **Asset Operators** (`asset_operators.py`): Provides asset-specific operations
   - Sync assets from server
   - Switch between versions
   - Register/unregister library

3. **Asset Panels** (`asset_panels.py`): UI panels in Asset Browser
   - Tools panel for sync and upload
   - Details panel for asset metadata
   - Help panel with usage instructions

### Testing

To test the addon during development:

1. Enable "Developer Extras" in Blender preferences
2. Open Blender's Python console
3. Use `bpy.ops.wm.reload_userpref()` to reload preferences
4. Use `bpy.ops.script.reload()` to reload scripts

## License

This addon is part of the Modelibr project. See the main repository for license information.

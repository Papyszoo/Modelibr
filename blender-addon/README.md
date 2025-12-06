# Modelibr Blender Addon

A Blender addon that integrates with the self-hosted Modelibr application, enabling users to browse, import, and upload 3D models directly from within Blender.

## Features

-   **Window-Based Browser** - Dedicated browser window interface for better workflow (accessible via Window menu)
-   **Model Browser with Thumbnails** - Browse and search models from your Modelibr server with thumbnail previews
-   **Version Browser** - View and manage all versions of your models
-   **Tabbed Interface** - Switch between Browse, Versions, and Upload tabs
-   **Model Import** - Import models directly into Blender (supports GLB, FBX, OBJ, and .blend files)
-   **Version Upload** - Create new versions of models you're working on
-   **New Model Upload** - Upload current scene as a completely new model
-   **Sidebar Panel** - Quick access panel in 3D Viewport sidebar
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

### Opening the Modelibr Browser Window

There are three ways to access the Modelibr browser:

**Method 1: Window Menu (Recommended)**
1. Go to **Window** menu in the top menu bar
2. Click **Modelibr Browser** at the bottom
3. A dedicated browser window will open

**Method 2: Sidebar Panel**
1. Open a 3D Viewport
2. Press **N** to open the sidebar (or View > Sidebar)
3. Click on the **Modelibr** tab
4. Click **Open Browser Window** button

**Method 3: Search**
1. Press **F3** (or Edit > Menu Search)
2. Type "Modelibr Browser"
3. Press Enter

### Using the Browser Window

The browser window has three tabs:

#### Browse Tab
- **Search**: Use the search box to filter models by name or tags
- **Refresh**: Click the refresh icon to reload the model list
- **Thumbnails**: Toggle thumbnail display with the image icon
- **Model List**: Browse available models in the list view
- **Details Panel**: View model details, description, tags, and creation date
- **Import**: Select a model and click "Import Model" to load it into Blender

#### Versions Tab
- **View Versions**: Shows all versions of the currently selected model
- **Version Details**: See version number, description, creation date, and active status
- **File List**: View all files included in each version
- **Import Version**: Import a specific version of the model

#### Upload Tab
- **Upload New Version**: Create a new version of the current model (requires model context)
- **Upload New Model**: Upload the current scene as a completely new model

### Working with Model Versions

The Versions tab allows you to:
- View all versions of a model
- See which version is currently active
- Check version details and descriptions
- Browse files included in each version
- Import specific versions

To use the Versions tab:
1. First import a model from the Browse tab (this sets the model context)
2. Switch to the **Versions** tab
3. Click **Load Versions** to fetch all versions
4. Select a version to see its details and files
5. Click **Import This Version** to import that specific version

### Importing Models

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

### Thumbnail Previews

The addon supports thumbnail previews for models:
- Thumbnails are automatically downloaded and cached
- Toggle thumbnail display with the image icon in the Browse tab
- Thumbnails are stored in your system's temporary directory
- The cache persists across Blender sessions for faster loading

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

## Development

### Project Structure

```
blender-addon/
├── modelibr/
│   ├── __init__.py          # Addon registration
│   ├── preferences.py       # Addon preferences
│   ├── properties.py        # Scene properties and data structures
│   ├── api_client.py        # REST API client
│   ├── operators.py         # Blender operators (import, upload, refresh)
│   ├── panels.py            # UI panels for sidebar
│   ├── space.py             # Window-based browser interface
│   ├── thumbnails.py        # Thumbnail caching and preview management
│   └── handlers.py          # URI and startup handlers
├── install_uri_handler.py   # URI handler installer
└── README.md                # This file
```

### Testing

To test the addon during development:

1. Enable "Developer Extras" in Blender preferences
2. Open Blender's Python console
3. Use `bpy.ops.wm.reload_userpref()` to reload preferences
4. Use `bpy.ops.script.reload()` to reload scripts

## License

This addon is part of the Modelibr project. See the main repository for license information.

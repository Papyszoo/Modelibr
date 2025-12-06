# Modelibr Blender Addon

A Blender addon that integrates with the self-hosted Modelibr application, enabling users to browse, import, and upload 3D models directly from within Blender.

## Features

-   **Model Browser Panel** - Browse and search models from your Modelibr server with thumbnails
-   **Model Import** - Import models directly into Blender (supports GLB, FBX, OBJ, and .blend files)
-   **Version Upload** - Create new versions of models you're working on
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

### Accessing the Panel

The Modelibr panel is located in the 3D Viewport sidebar:

1. Open a 3D Viewport
2. Press **N** to open the sidebar (or View > Sidebar)
3. Click on the **Modelibr** tab

### Browsing Models

1. Click **Load Models** or the refresh button to fetch models from your server
2. Use the search box to filter models by name or tags
3. Select a model from the list
4. Click **Import** to import the selected model

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
│   ├── properties.py        # Scene properties
│   ├── api_client.py        # REST API client
│   ├── operators.py         # Blender operators
│   ├── panels.py            # UI panels
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

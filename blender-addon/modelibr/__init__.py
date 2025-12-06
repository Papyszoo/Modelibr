bl_info = {
    "name": "Modelibr",
    "author": "Patryk Kowalczyk",
    "version": (1, 1, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Modelibr, Asset Browser",
    "description": "Browse, import, and upload 3D models from Modelibr with Asset Browser integration",
    "category": "Import-Export",
}

import bpy

from . import preferences
from . import properties
from . import operators
from . import panels
from . import handlers
from . import asset_browser
from . import asset_operators
from . import asset_panels


def register():
    preferences.register()
    properties.register()
    operators.register()
    panels.register()
    asset_browser.register()
    asset_operators.register()
    asset_panels.register()
    handlers.register()
    
    # Auto-register asset library on first load
    from .asset_browser import AssetLibraryHandler
    if not AssetLibraryHandler.is_library_registered():
        try:
            AssetLibraryHandler.register_asset_library()
            print("[Modelibr] Asset library auto-registered")
        except Exception as e:
            print(f"[Modelibr] Could not auto-register asset library: {e}")


def unregister():
    handlers.unregister()
    asset_panels.unregister()
    asset_operators.unregister()
    asset_browser.unregister()
    panels.unregister()
    operators.unregister()
    properties.unregister()
    preferences.unregister()


if __name__ == "__main__":
    register()

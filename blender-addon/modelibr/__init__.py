bl_info = {
    "name": "Modelibr",
    "author": "Patryk Kowalczyk",
    "version": (1, 1, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Modelibr, or use 'Modelibr Browser' operator",
    "description": "Browse, import, and upload 3D models from Modelibr with thumbnail preview and version support",
    "category": "Import-Export",
}

import bpy

from . import preferences
from . import properties
from . import operators
from . import panels
from . import handlers
from . import space
from . import thumbnails


def register():
    preferences.register()
    properties.register()
    operators.register()
    space.register()
    panels.register()
    handlers.register()
    thumbnails.register()


def unregister():
    thumbnails.unregister()
    handlers.unregister()
    panels.unregister()
    space.unregister()
    operators.unregister()
    properties.unregister()
    preferences.unregister()


if __name__ == "__main__":
    register()

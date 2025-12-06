bl_info = {
    "name": "Modelibr",
    "author": "Modelibr",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Modelibr",
    "description": "Browse, import, and upload 3D models from Modelibr",
    "category": "Import-Export",
}

import bpy

from . import preferences
from . import properties
from . import operators
from . import panels
from . import handlers


def register():
    preferences.register()
    properties.register()
    operators.register()
    panels.register()
    handlers.register()


def unregister():
    handlers.unregister()
    panels.unregister()
    operators.unregister()
    properties.unregister()
    preferences.unregister()


if __name__ == "__main__":
    register()

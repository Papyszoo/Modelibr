import bpy
from bpy.types import AddonPreferences
from bpy.props import StringProperty, EnumProperty, BoolProperty


class ModelibrPreferences(AddonPreferences):
    bl_idname = __package__

    server_url: StringProperty(
        name="Server URL",
        description="URL of your Modelibr server",
        default="http://localhost:8080",
    )

    api_key: StringProperty(
        name="API Key",
        description="API key for authentication (leave empty if not required)",
        default="",
        subtype='PASSWORD',
    )

    default_export_format: EnumProperty(
        name="Default Export Format",
        description="Default format when uploading models",
        items=[
            ('GLB', "GLB", "GL Transmission Format Binary"),
            ('FBX', "FBX", "Autodesk FBX"),
            ('OBJ', "OBJ", "Wavefront OBJ"),
        ],
        default='GLB',
    )

    always_include_blend: BoolProperty(
        name="Always Include .blend File",
        description="Always include the .blend file when uploading",
        default=False,
    )

    use_asset_browser: BoolProperty(
        name="Enable Asset Browser Integration",
        description="Use Blender's Asset Browser for model management",
        default=True,
    )

    def draw(self, context):
        layout = self.layout

        layout.label(text="Server Configuration:")
        box = layout.box()
        box.prop(self, "server_url")
        box.prop(self, "api_key")

        layout.label(text="Upload Settings:")
        box = layout.box()
        box.prop(self, "default_export_format")
        box.prop(self, "always_include_blend")

        layout.label(text="Asset Browser:")
        box = layout.box()
        box.prop(self, "use_asset_browser")
        if self.use_asset_browser:
            box.operator("modelibr.register_asset_library", text="Register Asset Library", icon='ASSET_MANAGER')


def get_preferences():
    return bpy.context.preferences.addons[__package__].preferences


def register():
    bpy.utils.register_class(ModelibrPreferences)


def unregister():
    bpy.utils.unregister_class(ModelibrPreferences)

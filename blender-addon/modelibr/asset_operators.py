"""
Asset Browser operators for Modelibr.
Operators specifically for use in the Asset Browser context.
"""

import bpy
from bpy.types import Operator
from bpy.props import IntProperty

from .asset_browser import AssetLibraryHandler
from .api_client import ModelibrApiClient, ApiError
from .preferences import get_preferences


def get_api_client() -> ModelibrApiClient:
    """Get configured API client."""
    prefs = get_preferences()
    return ModelibrApiClient(prefs.server_url, prefs.api_key)


class MODELIBR_OT_register_asset_library(Operator):
    """Register Modelibr asset library in Blender preferences"""
    bl_idname = "modelibr.register_asset_library"
    bl_label = "Register Asset Library"
    bl_description = "Register the Modelibr asset library in Blender's preferences"
    
    def execute(self, context):
        success, message = AssetLibraryHandler.register_asset_library()
        
        if success:
            self.report({'INFO'}, message)
        else:
            self.report({'ERROR'}, message)
        
        return {'FINISHED'}


class MODELIBR_OT_sync_assets(Operator):
    """Sync models from API to local asset library"""
    bl_idname = "modelibr.sync_assets"
    bl_label = "Sync Assets from Server"
    bl_description = "Download and sync all models from Modelibr server to asset library"
    
    _timer = None
    _syncing = False
    _progress_message = ""
    
    def modal(self, context, event):
        if event.type == 'TIMER':
            if not self._syncing:
                return {'FINISHED'}
            
            # Update UI
            context.area.tag_redraw()
        
        return {'PASS_THROUGH'}
    
    def execute(self, context):
        # Ensure library is registered
        if not AssetLibraryHandler.is_library_registered():
            success, message = AssetLibraryHandler.register_asset_library()
            if not success:
                self.report({'ERROR'}, f"Failed to register library: {message}")
                return {'CANCELLED'}
        
        try:
            client = get_api_client()
            
            # Progress tracking
            def progress_callback(current, total, message):
                self._progress_message = f"Syncing {current}/{total}: {message}"
                print(f"[Modelibr] {self._progress_message}")
            
            self.report({'INFO'}, "Starting asset sync...")
            success, message, count = AssetLibraryHandler.sync_assets_from_api(
                client,
                progress_callback
            )
            
            if success:
                self.report({'INFO'}, f"Sync complete: {message}")
            else:
                self.report({'ERROR'}, message)
            
            return {'FINISHED'}
            
        except ApiError as e:
            self.report({'ERROR'}, f"API Error: {str(e)}")
            return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Sync failed: {str(e)}")
            return {'CANCELLED'}


class MODELIBR_OT_switch_version(Operator):
    """Switch to a different version of the current asset"""
    bl_idname = "modelibr.switch_version"
    bl_label = "Switch Asset Version"
    bl_description = "Load a different version of the selected asset"
    
    model_id: IntProperty(name="Model ID")
    version_number: IntProperty(name="Version Number")
    
    def execute(self, context):
        if self.model_id <= 0 or self.version_number <= 0:
            self.report({'ERROR'}, "Invalid model or version")
            return {'CANCELLED'}
        
        try:
            # Get the asset path for this version
            asset_path = AssetLibraryHandler.get_model_asset_path(
                self.model_id,
                self.version_number
            )
            
            if not asset_path.exists():
                self.report({'ERROR'}, f"Version {self.version_number} not found locally. Sync assets first.")
                return {'CANCELLED'}
            
            # Load the blend file (append or link based on user choice)
            # For now, we'll append
            with bpy.data.libraries.load(str(asset_path), link=False) as (data_from, data_to):
                data_to.objects = data_from.objects
            
            # Link imported objects to current scene
            for obj in data_to.objects:
                if obj is not None:
                    context.collection.objects.link(obj)
            
            self.report({'INFO'}, f"Loaded version {self.version_number}")
            return {'FINISHED'}
            
        except Exception as e:
            self.report({'ERROR'}, f"Failed to switch version: {str(e)}")
            return {'CANCELLED'}


class MODELIBR_OT_import_from_browser(Operator):
    """Import selected asset from Asset Browser"""
    bl_idname = "modelibr.import_from_browser"
    bl_label = "Import from Asset Browser"
    bl_description = "Import the selected asset from the asset browser"
    
    # This operator is mainly for future use when we need custom import logic
    # For now, Blender's native asset drag-and-drop works fine
    
    def execute(self, context):
        # Get selected asset from context
        # Note: This requires Blender 3.0+ asset browser context
        self.report({'INFO'}, "Use drag-and-drop to import assets from the browser")
        return {'FINISHED'}


classes = [
    MODELIBR_OT_register_asset_library,
    MODELIBR_OT_sync_assets,
    MODELIBR_OT_switch_version,
    MODELIBR_OT_import_from_browser,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

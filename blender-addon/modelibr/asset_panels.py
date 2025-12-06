"""
Asset Browser UI panels for Modelibr.
Panels that appear in the Asset Browser sidebar.
"""

import bpy
from bpy.types import Panel

from .asset_browser import AssetLibraryHandler


class ASSETBROWSER_PT_modelibr_tools(Panel):
    """Modelibr tools panel in Asset Browser"""
    bl_space_type = 'FILE_BROWSER'
    bl_region_type = 'TOOLS'
    bl_category = "Modelibr"
    bl_label = "Modelibr Tools"
    bl_options = {'DEFAULT_CLOSED'}
    
    @classmethod
    def poll(cls, context):
        # Only show in asset browser context
        return (
            context.space_data.browse_mode == 'ASSETS' and
            hasattr(context, 'asset_library_reference')
        )
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr
        
        # Library status
        is_registered = AssetLibraryHandler.is_library_registered()
        
        box = layout.box()
        if is_registered:
            box.label(text="Library Status: Registered", icon='CHECKMARK')
        else:
            box.label(text="Library Status: Not Registered", icon='ERROR')
            box.operator("modelibr.register_asset_library", icon='ASSET_MANAGER')
        
        layout.separator()
        
        # Sync assets
        col = layout.column(align=True)
        col.label(text="Asset Management:", icon='ASSET_MANAGER')
        col.operator("modelibr.sync_assets", text="Sync Assets from Server", icon='FILE_REFRESH')
        
        if props.is_loading:
            col.label(text="Syncing...", icon='TIME')
        
        layout.separator()
        
        # Upload tools
        col = layout.column(align=True)
        col.label(text="Upload Tools:", icon='EXPORT')
        col.operator("modelibr.upload_new_model", text="Upload as New Model", icon='ADD')
        
        if props.current_model_id > 0:
            col.operator("modelibr.upload_version", text="Upload New Version", icon='EXPORT')
        
        layout.separator()
        
        # Connection test
        layout.operator("modelibr.test_connection", text="Test Connection", icon='URL')


class ASSETBROWSER_PT_modelibr_details(Panel):
    """Asset details panel in Asset Browser"""
    bl_space_type = 'FILE_BROWSER'
    bl_region_type = 'TOOLS'
    bl_category = "Modelibr"
    bl_label = "Asset Details"
    bl_options = {'DEFAULT_CLOSED'}
    
    @classmethod
    def poll(cls, context):
        # Only show in asset browser context
        return (
            context.space_data.browse_mode == 'ASSETS' and
            hasattr(context, 'asset_library_reference')
        )
    
    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr
        
        # Try to get selected asset's metadata
        # Note: Getting selected asset info in Blender's Asset Browser is complex
        # This is a simplified version
        
        # Show current model context if available
        if props.current_model_id > 0:
            box = layout.box()
            box.label(text="Current Model Context:", icon='OBJECT_DATA')
            box.label(text=f"Name: {props.current_model_name}")
            box.label(text=f"Model ID: {props.current_model_id}")
            if props.current_version_id > 0:
                box.label(text=f"Version ID: {props.current_version_id}")
            
            box.operator("modelibr.clear_model_context", text="Clear Context", icon='X')
        else:
            layout.label(text="No model context set", icon='INFO')
            layout.label(text="Import a model to set context")
        
        layout.separator()
        
        # Version switching (if context is set)
        if props.current_model_id > 0:
            col = layout.column(align=True)
            col.label(text="Version Management:", icon='CURRENT_FILE')
            col.label(text="Version switching coming soon...")
            # Future: Add version list and switch operator


class ASSETBROWSER_PT_modelibr_info(Panel):
    """Info panel about using Modelibr assets"""
    bl_space_type = 'FILE_BROWSER'
    bl_region_type = 'TOOLS'
    bl_category = "Modelibr"
    bl_label = "Quick Help"
    bl_options = {'DEFAULT_CLOSED'}
    
    @classmethod
    def poll(cls, context):
        return (
            context.space_data.browse_mode == 'ASSETS' and
            hasattr(context, 'asset_library_reference')
        )
    
    def draw(self, context):
        layout = self.layout
        
        col = layout.column(align=True)
        col.label(text="How to use Modelibr assets:", icon='HELP')
        col.separator()
        col.label(text="1. Click 'Sync Assets' to download")
        col.label(text="2. Select 'Modelibr' library")
        col.label(text="3. Drag assets into your scene")
        col.separator()
        col.label(text="Upload:")
        col.label(text="• Use 'Upload as New Model'")
        col.label(text="• Or 'Upload New Version'")


classes = [
    ASSETBROWSER_PT_modelibr_tools,
    ASSETBROWSER_PT_modelibr_details,
    ASSETBROWSER_PT_modelibr_info,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

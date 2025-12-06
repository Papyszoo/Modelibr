import bpy
from bpy.types import Panel
import bpy.utils.previews
import os
import tempfile

preview_collections = {}


class MODELIBR_PT_main_panel(Panel):
    bl_label = "Modelibr"
    bl_idname = "MODELIBR_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        # Current model context
        if props.current_model_id > 0:
            box = layout.box()
            box.label(text="Current Model:", icon='OBJECT_DATA')
            box.label(text=props.current_model_name or f"Model #{props.current_model_id}")
            if props.current_version_id > 0:
                box.label(text=f"Version ID: {props.current_version_id}")
            box.operator("modelibr.clear_model_context", text="Clear", icon='X')

        # Connection status
        layout.operator("modelibr.test_connection", icon='URL')


class MODELIBR_PT_browse_panel(Panel):
    bl_label = "Browse Models"
    bl_idname = "MODELIBR_PT_browse_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'
    bl_parent_id = "MODELIBR_PT_main_panel"

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        # Search bar
        row = layout.row(align=True)
        row.prop(props, "search_query", text="", icon='VIEWZOOM')
        row.operator("modelibr.refresh_models", text="", icon='FILE_REFRESH')

        # Loading indicator
        if props.is_loading:
            layout.label(text="Loading...", icon='TIME')
            return

        # Error message
        if props.error_message:
            box = layout.box()
            box.alert = True
            box.label(text="Error:", icon='ERROR')
            col = box.column()
            # Wrap long error messages
            words = props.error_message.split()
            line = ""
            for word in words:
                if len(line + " " + word) > 40:
                    col.label(text=line)
                    line = word
                else:
                    line = (line + " " + word).strip()
            if line:
                col.label(text=line)

        # Model list
        if len(props.models) > 0:
            layout.template_list(
                "MODELIBR_UL_model_list",
                "",
                props,
                "models",
                props,
                "active_model_index",
                rows=5,
            )

            # Import selected
            if props.active_model_index >= 0 and props.active_model_index < len(props.models):
                selected = props.models[props.active_model_index]
                layout.operator(
                    "modelibr.import_model",
                    text=f"Import: {selected.name}",
                    icon='IMPORT',
                ).model_id = selected.id
        else:
            layout.label(text="No models found")
            layout.operator("modelibr.refresh_models", text="Load Models", icon='FILE_REFRESH')


class MODELIBR_PT_upload_panel(Panel):
    bl_label = "Upload"
    bl_idname = "MODELIBR_PT_upload_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'
    bl_parent_id = "MODELIBR_PT_main_panel"

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        # Upload new version (only if model context exists)
        if props.current_model_id > 0:
            layout.operator("modelibr.upload_version", text="Upload New Version", icon='EXPORT')
        else:
            box = layout.box()
            box.label(text="Import a model first to create versions", icon='INFO')

        layout.separator()

        # Upload new model
        layout.operator("modelibr.upload_new_model", text="Upload as New Model", icon='ADD')


class MODELIBR_UL_model_list(bpy.types.UIList):
    bl_idname = "MODELIBR_UL_model_list"

    def draw_item(self, context, layout, data, item, icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            
            # Try to show thumbnail if available
            pcoll = preview_collections.get("modelibr_thumbs")
            if pcoll and str(item.id) in pcoll:
                icon_val = pcoll[str(item.id)].icon_id
                row.label(text="", icon_value=icon_val)
            
            row.label(text=item.name, icon='MESH_DATA')
            if item.tags:
                row.label(text=f"[{item.tags}]")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.label(text=item.name, icon='MESH_DATA')


class MODELIBR_UL_version_list(bpy.types.UIList):
    bl_idname = "MODELIBR_UL_version_list"

    def draw_item(self, context, layout, data, item, icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            row.label(text=f"Version {item.version_number}", icon='SEQUENCE')
            if item.is_active:
                row.label(text="", icon='CHECKMARK')
            row.label(text=f"({len(item.files)} files)")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.label(text=f"v{item.version_number}", icon='SEQUENCE')


class MODELIBR_PT_versions_panel(Panel):
    bl_label = "Versions"
    bl_idname = "MODELIBR_PT_versions_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'
    bl_parent_id = "MODELIBR_PT_main_panel"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr
        
        if props.current_model_id <= 0:
            box = layout.box()
            box.label(text="Import a model first", icon='INFO')
            return
        
        layout.label(text=f"Model: {props.current_model_name}", icon='OBJECT_DATA')
        layout.operator("modelibr.refresh_versions", text="Load Versions", icon='FILE_REFRESH')
        
        if props.is_loading:
            layout.label(text="Loading...", icon='TIME')
            return
        
        if len(props.versions) > 0:
            layout.template_list(
                "MODELIBR_UL_version_list",
                "",
                props,
                "versions",
                props,
                "active_version_index",
                rows=4,
            )
            
            if props.active_version_index >= 0 and props.active_version_index < len(props.versions):
                selected = props.versions[props.active_version_index]
                box = layout.box()
                box.label(text=f"Version {selected.version_number}", icon='SEQUENCE')
                if selected.description:
                    box.label(text=selected.description)
                if selected.created_at:
                    box.label(text=f"Created: {selected.created_at}", icon='TIME')
                if selected.is_active:
                    box.label(text="Active Version", icon='CHECKMARK')
                
                if len(selected.files) > 0:
                    box.separator()
                    box.label(text="Files:", icon='FILE')
                    for file_item in selected.files:
                        row = box.row()
                        icon = 'FILE_3D' if file_item.is_renderable else 'FILE_BLANK'
                        row.label(text=file_item.original_filename, icon=icon)
                
                box.separator()
                box.operator(
                    "modelibr.import_model",
                    text="Import This Version",
                    icon='IMPORT'
                ).version_id = selected.id
        else:
            layout.label(text="No versions found")


classes = [
    MODELIBR_UL_model_list,
    MODELIBR_UL_version_list,
    MODELIBR_PT_main_panel,
    MODELIBR_PT_browse_panel,
    MODELIBR_PT_versions_panel,
    MODELIBR_PT_upload_panel,
]


def load_thumbnails_for_models(context):
    """Load thumbnails for visible models."""
    from .api_client import ModelibrApiClient
    from .preferences import get_preferences
    
    props = context.scene.modelibr
    if len(props.models) == 0:
        return
    
    pcoll = preview_collections.get("modelibr_thumbs")
    if not pcoll:
        return
    
    prefs = get_preferences()
    client = ModelibrApiClient(prefs.server_url, prefs.api_key)
    temp_dir = tempfile.gettempdir()
    
    for model in props.models:
        model_id = str(model.id)
        if model_id in pcoll or not model.thumbnail_url:
            continue
        
        try:
            thumb_path = client.download_thumbnail(model.id, temp_dir)
            if os.path.exists(thumb_path):
                pcoll.load(model_id, thumb_path, 'IMAGE')
        except Exception:
            pass


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    
    pcoll = bpy.utils.previews.new()
    preview_collections["modelibr_thumbs"] = pcoll


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    
    for pcoll in preview_collections.values():
        bpy.utils.previews.remove(pcoll)
    preview_collections.clear()

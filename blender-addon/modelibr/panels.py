import bpy
from bpy.types import Panel

from .tracking import get_modelibr_objects, is_modified


class MODELIBR_PT_main_panel(Panel):
    bl_label = "Modelibr"
    bl_idname = "MODELIBR_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        # Browse Assets button
        row = layout.row(align=True)
        row.operator("modelibr.browse_assets", text="Browse Assets", icon='FILEBROWSER')
        row.operator("modelibr.refresh_models", text="", icon='FILE_REFRESH')
        
        layout.separator()

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
        obj = context.active_object
        
        # Context-aware upload for selected imported asset
        if obj and "modelibr_model_id" in obj:
            box = layout.box()
            box.label(text=f"Selected: {obj.name}", icon='OBJECT_DATA')
            
            # Show modification status
            if is_modified(obj):
                box.label(text="(Modified)", icon='ERROR')
            
            # Context-aware upload buttons
            row = box.row(align=True)
            upload_op = row.operator(
                "modelibr.upload_from_imported",
                text="Upload New Version",
                icon='EXPORT'
            )
            upload_op.upload_as = 'VERSION'
            
            upload_op = row.operator(
                "modelibr.upload_from_imported", 
                text="As New Model",
                icon='ADD'
            )
            upload_op.upload_as = 'MODEL'
            
            layout.separator()
        
        # Upload new version (only if model context exists)
        elif props.current_model_id > 0:
            layout.operator("modelibr.upload_version", text="Upload New Version", icon='EXPORT')
            layout.separator()
        else:
            box = layout.box()
            box.label(text="Import a model first to create versions", icon='INFO')
            layout.separator()

        # Upload new model
        layout.operator("modelibr.upload_new_model", text="Upload as New Model", icon='ADD')


class MODELIBR_PT_imported_panel(Panel):
    bl_label = "Imported Assets"
    bl_idname = "MODELIBR_PT_imported_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'
    bl_parent_id = "MODELIBR_PT_main_panel"

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        
        # Find all imported objects
        imported_objects = get_modelibr_objects(scene)
        
        if not imported_objects:
            layout.label(text="No imported assets", icon='INFO')
            return
        
        # Display each imported object
        for obj in imported_objects:
            row = layout.row(align=True)
            
            # Color yellow if modified
            if is_modified(obj):
                row.alert = True
            
            # Object name (clickable to focus)
            focus_op = row.operator(
                "modelibr.focus_object",
                text=obj.name,
                emboss=False,
                icon='OBJECT_DATA'
            )
            focus_op.object_name = obj.name
            
            # Version info
            version_num = obj.get('modelibr_version_number', 1)
            row.label(text=f"v{version_num}")
            
            # Modified indicator
            if is_modified(obj):
                row.label(text="", icon='ERROR')


class MODELIBR_UL_model_list(bpy.types.UIList):
    bl_idname = "MODELIBR_UL_model_list"

    def draw_item(self, context, layout, data, item, icon, active_data, active_property, index):
        if self.layout_type in {'DEFAULT', 'COMPACT'}:
            row = layout.row(align=True)
            row.label(text=item.name, icon='MESH_DATA')
            if item.tags:
                row.label(text=f"[{item.tags}]")
        elif self.layout_type == 'GRID':
            layout.alignment = 'CENTER'
            layout.label(text=item.name, icon='MESH_DATA')


classes = [
    MODELIBR_UL_model_list,
    MODELIBR_PT_main_panel,
    MODELIBR_PT_browse_panel,
    MODELIBR_PT_upload_panel,
    MODELIBR_PT_imported_panel,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

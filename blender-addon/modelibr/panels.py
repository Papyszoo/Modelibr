import bpy
from bpy.types import Panel


class MODELIBR_PT_main_panel(Panel):
    bl_label = "Modelibr"
    bl_idname = "MODELIBR_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Modelibr'

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        # Open Browser button (prominent)
        layout.operator("modelibr.open_browser", text="Open Browser Window", icon='FILEBROWSER')
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


# Menu entry for opening the browser
class MODELIBR_MT_editor_menus(bpy.types.Menu):
    bl_label = "Modelibr Browser"
    bl_idname = "MODELIBR_MT_editor_menus"

    def draw(self, context):
        layout = self.layout
        layout.operator("modelibr.open_browser", text="Open Browser", icon='FILEBROWSER')


def draw_modelibr_menu(self, context):
    """Draw Modelibr in the Editor Type menu"""
    self.layout.separator()
    self.layout.operator("modelibr.open_browser", text="Modelibr Browser", icon='FILEBROWSER')


classes = [
    MODELIBR_UL_model_list,
    MODELIBR_UL_version_list,
    MODELIBR_MT_editor_menus,
    MODELIBR_PT_main_panel,
    MODELIBR_PT_browse_panel,
    MODELIBR_PT_upload_panel,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    
    # Add to Window menu
    bpy.types.TOPBAR_MT_window.append(draw_modelibr_menu)


def unregister():
    # Remove from Window menu
    bpy.types.TOPBAR_MT_window.remove(draw_modelibr_menu)
    
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

"""
Modelibr Space/Window Implementation

Since Blender's Python API doesn't support creating new SpaceTypes directly,
we implement a window-based browser using a custom operator that opens
in a new window with a custom draw function.
"""

import bpy
from bpy.types import Operator, UILayout
import os
from .thumbnails import get_thumbnail_cache, load_thumbnail_preview, get_preview_collection
from .operators import get_api_client


class MODELIBR_OT_open_browser(Operator):
    """Open Modelibr Browser in a new window"""
    bl_idname = "modelibr.open_browser"
    bl_label = "Modelibr Browser"
    bl_options = {'REGISTER'}
    
    # Make the dialog wider for better UX
    width: bpy.props.IntProperty(default=900)

    def execute(self, context):
        # This operator will be invoked to open the browser window
        return {'FINISHED'}

    def invoke(self, context, event):
        # Open a dialog window with custom UI
        # Use invoke_props_dialog for a proper modal dialog
        wm = context.window_manager
        return wm.invoke_props_dialog(self, width=self.width)
    
    def check(self, context):
        # Allow the dialog to update dynamically
        return True

    def draw(self, context):
        """Draw the browser UI"""
        layout = self.layout
        props = context.scene.modelibr

        # Header section
        self._draw_header(context, layout)

        # Main content area
        box = layout.box()
        self._draw_browser_content(context, box)

    def _draw_header(self, context, layout):
        """Draw the header with connection status and model context"""
        props = context.scene.modelibr
        
        header = layout.row()
        header.alignment = 'LEFT'
        
        # Connection status
        header.operator("modelibr.test_connection", text="Test Connection", icon='URL')
        
        # Current model context
        if props.current_model_id > 0:
            header.separator()
            header.label(text=f"Current: {props.current_model_name or f'Model #{props.current_model_id}'}", icon='OBJECT_DATA')
            header.operator("modelibr.clear_model_context", text="", icon='X')

    def _draw_browser_content(self, context, layout):
        """Draw the main browser content with tabs"""
        props = context.scene.modelibr
        
        # Tab selector
        row = layout.row(align=True)
        row.prop(props, "browser_tab", expand=True)
        
        layout.separator()
        
        # Draw content based on selected tab
        if props.browser_tab == 'BROWSE':
            self._draw_browse_tab(context, layout)
        elif props.browser_tab == 'VERSIONS':
            self._draw_versions_tab(context, layout)
        elif props.browser_tab == 'UPLOAD':
            self._draw_upload_tab(context, layout)

    def _draw_browse_tab(self, context, layout):
        """Draw the browse models tab"""
        props = context.scene.modelibr
        
        # Search bar and controls
        row = layout.row(align=True)
        row.prop(props, "search_query", text="", icon='VIEWZOOM')
        row.operator("modelibr.refresh_models", text="", icon='FILE_REFRESH')
        row.prop(props, "show_thumbnails", text="", icon='IMAGE_DATA', toggle=True)
        
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
                if len(line + " " + word) > 60:
                    col.label(text=line)
                    line = word
                else:
                    line = (line + " " + word).strip()
            if line:
                col.label(text=line)
        
        # Model browser
        if len(props.models) > 0:
            layout.label(text=f"Models ({len(props.models)}):", icon='MESH_DATA')
            
            # Split layout for thumbnails and details
            split = layout.split(factor=0.4)
            
            # Left side: Model list with thumbnails
            left_col = split.column()
            
            # Model list
            left_col.template_list(
                "MODELIBR_UL_model_list",
                "",
                props,
                "models",
                props,
                "active_model_index",
                rows=10,
            )
            
            # Right side: Details and thumbnail
            right_col = split.column()
            
            # Model details and import
            if props.active_model_index >= 0 and props.active_model_index < len(props.models):
                selected = props.models[props.active_model_index]
                
                # Try to show thumbnail
                if props.show_thumbnails and selected.thumbnail_url:
                    box = right_col.box()
                    box.label(text="Preview:", icon='IMAGE_DATA')
                    # Note: Actual thumbnail display would require preview collection
                    # For now, we show the thumbnail URL availability
                    box.label(text="Thumbnail available", icon='CHECKMARK')
                
                box = right_col.box()
                col = box.column(align=True)
                col.label(text=f"{selected.name}", icon='MESH_DATA')
                col.separator()
                
                if selected.description:
                    col.label(text="Description:")
                    # Wrap description text
                    desc_words = selected.description.split()
                    desc_line = ""
                    for word in desc_words:
                        if len(desc_line + " " + word) > 30:
                            col.label(text=desc_line)
                            desc_line = word
                        else:
                            desc_line = (desc_line + " " + word).strip()
                    if desc_line:
                        col.label(text=desc_line)
                    col.separator()
                
                if selected.tags:
                    col.label(text=f"Tags: {selected.tags}", icon='BOOKMARKS')
                if selected.created_at:
                    col.label(text=f"Created: {selected.created_at}", icon='TIME')
                
                col.separator()
                
                # Import button
                col.operator(
                    "modelibr.import_model",
                    text="Import Model",
                    icon='IMPORT',
                ).model_id = selected.id
        else:
            layout.label(text="No models found")
            layout.operator("modelibr.refresh_models", text="Load Models", icon='FILE_REFRESH')

    def _draw_versions_tab(self, context, layout):
        """Draw the versions tab"""
        props = context.scene.modelibr
        
        if props.current_model_id <= 0:
            box = layout.box()
            box.label(text="No model selected", icon='INFO')
            box.label(text="Import a model to view its versions")
            return
        
        # Header with model info
        box = layout.box()
        box.label(text=f"Model: {props.current_model_name or f'#{props.current_model_id}'}", icon='OBJECT_DATA')
        
        # Refresh versions button
        layout.operator("modelibr.refresh_versions", text="Load Versions", icon='FILE_REFRESH')
        
        # Versions list
        if props.is_loading:
            layout.label(text="Loading versions...", icon='TIME')
        elif len(props.versions) > 0:
            layout.template_list(
                "MODELIBR_UL_version_list",
                "",
                props,
                "versions",
                props,
                "active_version_index",
                rows=6,
            )
            
            # Version details and actions
            if props.active_version_index >= 0 and props.active_version_index < len(props.versions):
                selected_version = props.versions[props.active_version_index]
                
                box = layout.box()
                col = box.column(align=True)
                col.label(text=f"Version #{selected_version.version_number}", icon='SEQUENCE')
                if selected_version.description:
                    col.label(text=selected_version.description)
                if selected_version.created_at:
                    col.label(text=f"Created: {selected_version.created_at}", icon='TIME')
                if selected_version.is_active:
                    col.label(text="Active Version", icon='CHECKMARK')
                
                # Files in this version
                if len(selected_version.files) > 0:
                    col.separator()
                    col.label(text="Files:", icon='FILE')
                    for file_item in selected_version.files:
                        row = col.row()
                        row.label(text=file_item.original_filename, icon='FILE_3D' if file_item.is_renderable else 'FILE_BLANK')
                        row.label(text=f"({file_item.size_bytes // 1024} KB)")
                
                # Import this version
                row = box.row()
                row.operator(
                    "modelibr.import_model",
                    text="Import This Version",
                    icon='IMPORT'
                ).version_id = selected_version.id
        else:
            layout.label(text="No versions found")

    def _draw_upload_tab(self, context, layout):
        """Draw the upload tab"""
        props = context.scene.modelibr
        
        # Upload new version (only if model context exists)
        if props.current_model_id > 0:
            box = layout.box()
            box.label(text=f"Upload to: {props.current_model_name}", icon='EXPORT')
            box.operator("modelibr.upload_version", text="Upload New Version", icon='EXPORT')
        else:
            box = layout.box()
            box.label(text="Import a model first to create versions", icon='INFO')
        
        layout.separator()
        
        # Upload new model
        box = layout.box()
        box.label(text="Create New Model", icon='ADD')
        box.operator("modelibr.upload_new_model", text="Upload as New Model", icon='ADD')


# Operator for opening as a separate window/area
class MODELIBR_OT_open_browser_window(Operator):
    """Open Modelibr Browser in a new window (space)"""
    bl_idname = "modelibr.open_browser_window"
    bl_label = "Modelibr Browser"
    
    def execute(self, context):
        # Create a new window
        bpy.ops.screen.userpref_show('INVOKE_DEFAULT')
        return {'FINISHED'}


classes = [
    MODELIBR_OT_open_browser,
    MODELIBR_OT_open_browser_window,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

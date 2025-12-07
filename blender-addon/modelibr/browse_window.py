"""
Browse Assets window for visual browsing of Modelibr models.
Provides a modal dialog with thumbnail grid, search, and pagination.
"""

import bpy
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty, EnumProperty

from .api_client import ModelibrApiClient, ApiError
from .preferences import get_preferences
from .thumbnail_handler import get_thumbnail_manager
from .operators import get_api_client


class MODELIBR_OT_browse_assets(Operator):
    """Browse and import assets from Modelibr server"""
    bl_idname = "modelibr.browse_assets"
    bl_label = "Browse Modelibr Assets"
    bl_description = "Open window to browse and import models with thumbnails"
    
    search_query: StringProperty(
        name="Search",
        description="Search models by name or tags",
        default="",
    )
    
    page: IntProperty(
        name="Page",
        description="Current page for pagination",
        default=1,
        min=1,
    )
    
    models_per_page: IntProperty(
        name="Models Per Page",
        description="Number of models to display per page",
        default=20,
        min=1,
        max=100,
    )
    
    def invoke(self, context, event):
        """Open dialog and load models"""
        self.models = []
        self.is_loading = False
        self.error_message = ""
        
        # Load initial models
        self.load_models(context)
        
        return context.window_manager.invoke_props_dialog(self, width=800)
    
    def load_models(self, context):
        """Load models from API"""
        self.is_loading = True
        self.error_message = ""
        
        try:
            client = get_api_client()
            models = client.get_models(self.search_query)
            
            # Store models
            self.models = models if models else []
            
            # Load thumbnails in background
            thumbnail_manager = get_thumbnail_manager()
            for model in self.models:
                if model.get('thumbnailUrl'):
                    thumbnail_manager.load_thumbnail(
                        model['id'],
                        model['thumbnailUrl'],
                        client
                    )
            
        except ApiError as e:
            self.error_message = str(e)
            self.models = []
        finally:
            self.is_loading = False
    
    def draw(self, context):
        """Draw the browse window UI"""
        layout = self.layout
        
        # Search bar
        row = layout.row(align=True)
        row.prop(self, "search_query", text="", icon='VIEWZOOM')
        search_op = row.operator("modelibr.refresh_browse", text="Search", icon='FILE_REFRESH')
        
        layout.separator()
        
        # Loading indicator
        if self.is_loading:
            layout.label(text="Loading models...", icon='TIME')
            return
        
        # Error message
        if self.error_message:
            box = layout.box()
            box.alert = True
            box.label(text="Error:", icon='ERROR')
            box.label(text=self.error_message)
            return
        
        # Models grid
        if not self.models:
            layout.label(text="No models found", icon='INFO')
            return
        
        # Display models in grid
        thumbnail_manager = get_thumbnail_manager()
        
        # Calculate grid layout (4 columns)
        cols_per_row = 4
        num_rows = (len(self.models) + cols_per_row - 1) // cols_per_row
        
        for row_idx in range(num_rows):
            row = layout.row(align=True)
            
            for col_idx in range(cols_per_row):
                model_idx = row_idx * cols_per_row + col_idx
                
                if model_idx >= len(self.models):
                    break
                
                model = self.models[model_idx]
                col = row.column(align=True)
                
                # Thumbnail or placeholder icon
                thumbnail = thumbnail_manager.get_thumbnail(model['id'])
                if thumbnail and thumbnail.get_preview_id():
                    preview_id = thumbnail.get_preview_id()
                    preview = thumbnail_manager.preview_collection[preview_id]
                    # Use template_icon with the preview
                    col.template_icon(icon_value=preview.icon_id, scale=5.0)
                else:
                    # Placeholder
                    col.label(text="", icon='MESH_DATA')
                
                # Import button with model name
                import_op = col.operator(
                    "modelibr.import_model",
                    text=model.get('name', 'Unnamed')[:20],
                    icon='IMPORT'
                )
                import_op.model_id = model['id']
                
                # Tags (if available)
                if model.get('tags'):
                    col.label(text=f"[{model['tags'][:15]}]", icon='BOOKMARKS')
        
        layout.separator()
        
        # Footer with pagination and close
        row = layout.row(align=True)
        row.label(text=f"Showing {len(self.models)} models")
        row = layout.row(align=True)
        row.operator("modelibr.close_browse", text="Close", icon='X')
    
    def execute(self, context):
        """Execute (not used, dialog handles interaction)"""
        return {'FINISHED'}


class MODELIBR_OT_refresh_browse(Operator):
    """Refresh models in browse window"""
    bl_idname = "modelibr.refresh_browse"
    bl_label = "Refresh"
    bl_description = "Refresh model list"
    
    def execute(self, context):
        # Note: This would need to be linked to the browse window state
        # For now, just refresh the main model list
        bpy.ops.modelibr.refresh_models()
        return {'FINISHED'}


class MODELIBR_OT_close_browse(Operator):
    """Close browse window"""
    bl_idname = "modelibr.close_browse"
    bl_label = "Close"
    bl_description = "Close browse window"
    
    def execute(self, context):
        return {'FINISHED'}


classes = [
    MODELIBR_OT_browse_assets,
    MODELIBR_OT_refresh_browse,
    MODELIBR_OT_close_browse,
]


def register():
    """Register operators"""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    """Unregister operators"""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

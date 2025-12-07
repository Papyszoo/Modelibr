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
        
        # Use invoke_popup instead of invoke_props_dialog to avoid OK/Cancel buttons
        wm = context.window_manager
        return wm.invoke_popup(self, width=800)
    
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
            print(f"[Modelibr] Loading thumbnails for {len(self.models)} models...")
            print(f"[Modelibr] Thumbnail manager initialized: {thumbnail_manager is not None}")
            print(f"[Modelibr] Preview collection exists: {thumbnail_manager.preview_collection is not None}")
            
            for model in self.models:
                # Prioritize PNG thumbnail if available, fallback to regular thumbnail
                thumbnail_url = model.get('pngThumbnailUrl') or model.get('thumbnailUrl')
                print(f"[Modelibr] Model {model['id']} ({model.get('name')}): pngThumbnailUrl = {model.get('pngThumbnailUrl')}, thumbnailUrl = {model.get('thumbnailUrl')}")
                
                if thumbnail_url:
                    print(f"[Modelibr] Attempting to load thumbnail for model {model['id']}")
                    try:
                        result = thumbnail_manager.load_thumbnail(
                            model['id'],
                            thumbnail_url,
                            client
                        )
                        print(f"[Modelibr] Thumbnail load result for model {model['id']}: {result is not None}")
                        if result:
                            print(f"[Modelibr] Thumbnail preview_id: {result.get_preview_id()}")
                        else:
                            print(f"[Modelibr] Thumbnail loading FAILED for model {model['id']}")
                    except Exception as e:
                        print(f"[Modelibr] Exception loading thumbnail for model {model['id']}: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"[Modelibr] No thumbnail URL for model {model['id']}: {model.get('name')}")
            
            print(f"[Modelibr] Finished loading thumbnails. Total thumbnails in manager: {len(thumbnail_manager.thumbnails)}")
            
        except ApiError as e:
            print(f"[Modelibr] ApiError in load_models: {e}")
            self.error_message = str(e)
            self.models = []
        except Exception as e:
            print(f"[Modelibr] Exception in load_models: {e}")
            import traceback
            traceback.print_exc()
            self.error_message = str(e)
            self.models = []
        finally:
            self.is_loading = False
    
    def draw(self, context):
        """Draw the browse window UI"""
        layout = self.layout
        
        # Header with close button
        header_row = layout.row()
        header_row.label(text="Browse Modelibr Assets", icon='FILEBROWSER')
        header_row.operator("modelibr.close_browse", text="", icon='X', emboss=False)
        
        layout.separator()
        
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
                
                # Thumbnail display
                thumbnail = thumbnail_manager.get_thumbnail(model['id'])
                if thumbnail:
                    preview_id = thumbnail.get_preview_id()
                    if preview_id:
                        try:
                            # Get icon from preview collection
                            preview = thumbnail_manager.preview_collection[preview_id]
                            print(f"[Modelibr UI] Model {model['id']}: preview_id={preview_id}, icon_id={preview.icon_id}")
                            if preview.icon_id > 0:
                                # Use icon_value in a label to display the thumbnail
                                thumb_box = col.box()
                                thumb_box.scale_y = 2.5
                                thumb_box.label(text="", icon_value=preview.icon_id)
                            else:
                                col.label(text="[No icon]", icon='IMAGE_DATA')
                                print(f"[Modelibr UI] Model {model['id']}: icon_id is 0!")
                        except (KeyError, AttributeError) as e:
                            # Debug: show error
                            col.label(text=f"[Error]", icon='ERROR')
                            print(f"[Modelibr UI] Model {model['id']}: Exception getting preview: {e}")
                    else:
                        # No preview_id set
                        col.label(text="[No ID]", icon='QUESTION')
                else:
                    # Thumbnail not loaded yet
                    col.label(text="[Not loaded]", icon='TIME')
                
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
        
        # Footer with model count
        row = layout.row(align=True)
        row.label(text=f"Showing {len(self.models)} models")
    
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

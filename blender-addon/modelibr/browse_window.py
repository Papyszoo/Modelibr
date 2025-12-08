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


# Global registry to track active browse window instance
_active_browse_window = None


def get_active_browse_window():
    """Get the currently active browse window instance"""
    global _active_browse_window
    return _active_browse_window


def set_active_browse_window(window):
    """Set the currently active browse window instance"""
    global _active_browse_window
    _active_browse_window = window


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
        self.model_versions = {}  # Dictionary to store versions per model: {model_id: [versions]}
        self.selected_version_ids = {}  # Dictionary to track selected version per model: {model_id: version_id}
        
        # Register this instance as the active browse window
        set_active_browse_window(self)
        
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
            
            # Load versions for each model and initialize selected version
            for model in self.models:
                model_id = model['id']
                try:
                    versions = client.get_model_versions(model_id)
                    if versions:
                        self.model_versions[model_id] = versions
                        # Default to active version if available, otherwise latest
                        active_version_id = model.get('activeVersionId')
                        if active_version_id and any(v['id'] == active_version_id for v in versions):
                            self.selected_version_ids[model_id] = active_version_id
                        else:
                            # Use latest version
                            self.selected_version_ids[model_id] = versions[-1]['id']
                    else:
                        self.model_versions[model_id] = []
                        self.selected_version_ids[model_id] = None
                except Exception as e:
                    print(f"[Modelibr] Failed to load versions for model {model_id}: {e}")
                    self.model_versions[model_id] = []
                    self.selected_version_ids[model_id] = None
            
            # Load thumbnails for selected versions
            thumbnail_manager = get_thumbnail_manager()
            print(f"[Modelibr] Loading thumbnails for {len(self.models)} models...")
            print(f"[Modelibr] Thumbnail manager initialized: {thumbnail_manager is not None}")
            print(f"[Modelibr] Preview collection exists: {thumbnail_manager.preview_collection is not None}")
            
            for model in self.models:
                model_id = model['id']
                selected_version_id = self.selected_version_ids.get(model_id)
                
                if selected_version_id:
                    # Load thumbnail for the selected version
                    thumbnail_url = f"/model-versions/{selected_version_id}/thumbnail/file"
                    print(f"[Modelibr] Model {model_id} ({model.get('name')}): Loading version {selected_version_id} thumbnail")
                    
                    try:
                        # Use a unique identifier that includes version ID
                        thumbnail_key = f"{model_id}_v{selected_version_id}"
                        result = thumbnail_manager.load_thumbnail(
                            thumbnail_key,
                            thumbnail_url,
                            client
                        )
                        print(f"[Modelibr] Thumbnail load result for model {model_id} version {selected_version_id}: {result is not None}")
                        if result:
                            print(f"[Modelibr] Thumbnail preview_id: {result.get_preview_id()}")
                        else:
                            print(f"[Modelibr] Thumbnail loading FAILED for model {model_id}")
                    except Exception as e:
                        print(f"[Modelibr] Exception loading thumbnail for model {model_id}: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print(f"[Modelibr] No selected version for model {model_id}: {model.get('name')}")
            
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
    
    def change_version(self, context, model_id, version_id):
        """Change the selected version for a model and reload its thumbnail"""
        if model_id not in self.selected_version_ids:
            return
        
        # Update selected version
        self.selected_version_ids[model_id] = version_id
        
        # Load thumbnail for the new version
        thumbnail_manager = get_thumbnail_manager()
        client = get_api_client()
        
        try:
            thumbnail_url = f"/model-versions/{version_id}/thumbnail/file"
            thumbnail_key = f"{model_id}_v{version_id}"
            print(f"[Modelibr] Changing to version {version_id} for model {model_id}")
            
            result = thumbnail_manager.load_thumbnail(
                thumbnail_key,
                thumbnail_url,
                client
            )
            
            if result:
                print(f"[Modelibr] Successfully loaded thumbnail for version {version_id}")
            else:
                print(f"[Modelibr] Failed to load thumbnail for version {version_id}")
        except Exception as e:
            print(f"[Modelibr] Exception loading thumbnail for version {version_id}: {e}")
    
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
                model_id = model['id']
                col = row.column(align=True)
                
                # Thumbnail display - use version-specific thumbnail key
                selected_version_id = self.selected_version_ids.get(model_id)
                if selected_version_id:
                    thumbnail_key = f"{model_id}_v{selected_version_id}"
                    thumbnail = thumbnail_manager.get_thumbnail(thumbnail_key)
                    if thumbnail:
                        preview_id = thumbnail.get_preview_id()
                        if preview_id:
                            try:
                                # Get icon from preview collection
                                preview = thumbnail_manager.preview_collection[preview_id]
                                if preview.icon_id > 0:
                                    # Use template_icon with scale parameter for large display
                                    col.template_icon(preview.icon_id, scale=8.0)
                                else:
                                    col.label(text="[No icon]", icon='IMAGE_DATA')
                            except (KeyError, AttributeError) as e:
                                # Debug: show error
                                col.label(text=f"[Error]", icon='ERROR')
                                print(f"[Modelibr UI] Model {model_id}: Exception getting preview: {e}")
                        else:
                            # No preview_id set
                            col.label(text="[No ID]", icon='QUESTION')
                    else:
                        # Thumbnail not loaded yet
                        col.label(text="[Not loaded]", icon='TIME')
                else:
                    col.label(text="[No version]", icon='QUESTION')
                
                # Version selector - show all versions as buttons in a compact row
                versions = self.model_versions.get(model_id, [])
                if versions and len(versions) > 1:
                    # Sort versions by version number
                    sorted_versions = sorted(versions, key=lambda v: v['versionNumber'], reverse=True)
                    
                    # Create a compact row for version buttons
                    version_box = col.box()
                    version_box.scale_y = 0.6
                    version_row = version_box.row(align=True)
                    version_row.label(text="Ver:", icon='SORTTIME')
                    
                    # Show up to 5 most recent versions as buttons
                    for v in sorted_versions[:5]:
                        version_btn = version_row.operator(
                            "modelibr.change_model_version",
                            text=f"{v['versionNumber']}",
                            depress=(v['id'] == selected_version_id)
                        )
                        version_btn.model_id = model_id
                        version_btn.version_id = v['id']
                        version_btn.model_idx = model_idx
                
                # Import button with model name
                import_op = col.operator(
                    "modelibr.import_model",
                    text=model.get('name', 'Unnamed')[:20],
                    icon='IMPORT'
                )
                import_op.model_id = model_id
                import_op.version_id = selected_version_id if selected_version_id else 0
                
                # Tags (if available)
                if model.get('tags'):
                    col.label(text=f"[{model['tags'][:15]}]", icon='BOOKMARKS')
        
        layout.separator()
        
        # Footer with model count
        row = layout.row(align=True)
        row.label(text=f"Showing {len(self.models)} models")
    
    def execute(self, context):
        """Execute (not used, dialog handles interaction)"""
        # Unregister this instance when done
        set_active_browse_window(None)
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


class MODELIBR_OT_change_model_version(Operator):
    """Change the selected version for a model"""
    bl_idname = "modelibr.change_model_version"
    bl_label = "Change Version"
    bl_description = "Change to a different version of this model"
    
    model_id: IntProperty(name="Model ID")
    version_id: IntProperty(name="Version ID")
    model_idx: IntProperty(name="Model Index")
    
    def execute(self, context):
        # Get the active browse window instance
        browse_window = get_active_browse_window()
        
        if browse_window:
            # Change version and reload thumbnail
            browse_window.change_version(context, self.model_id, self.version_id)
            
            # Force redraw to update UI
            for area in context.screen.areas:
                if area.type == 'VIEW_3D':
                    area.tag_redraw()
        
        return {'FINISHED'}


classes = [
    MODELIBR_OT_browse_assets,
    MODELIBR_OT_refresh_browse,
    MODELIBR_OT_close_browse,
    MODELIBR_OT_change_model_version,
]


def register():
    """Register operators"""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    """Unregister operators"""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

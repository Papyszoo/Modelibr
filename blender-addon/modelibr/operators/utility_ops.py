"""
Utility operators for the Modelibr Blender addon.
Handles utility operations like connection testing and model refresh.
"""
from typing import Set

import bpy
from bpy.types import Operator, Context

from ..exceptions import ApiError
from .common import get_api_client


class MODELIBR_OT_refresh_models(Operator):
    """Refresh the model list from the Modelibr server."""
    
    bl_idname = "modelibr.refresh_models"
    bl_label = "Refresh Models"
    bl_description = "Refresh the model list from Modelibr server"

    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr
        props.is_loading = True
        props.error_message = ""

        try:
            client = get_api_client()
            models = client.get_models(props.search_query)

            props.models.clear()
            for model_data in models:
                item = props.models.add()
                item.id = model_data.get('id', 0)
                item.name = model_data.get('name', '')
                item.thumbnail_url = model_data.get('thumbnailUrl', '')
                item.created_at = model_data.get('createdAt', '')
                item.tags = model_data.get('tags', '')
                item.description = model_data.get('description', '')

            self.report({'INFO'}, f"Loaded {len(models)} models")

        except ApiError as e:
            props.error_message = str(e)
            self.report({'ERROR'}, str(e))

        finally:
            props.is_loading = False

        return {'FINISHED'}


class MODELIBR_OT_test_connection(Operator):
    """Test connection to the Modelibr server."""
    
    bl_idname = "modelibr.test_connection"
    bl_label = "Test Connection"
    bl_description = "Test connection to Modelibr server"

    def execute(self, context: Context) -> Set[str]:
        client = get_api_client()
        
        if client.test_connection():
            self.report({'INFO'}, "Connection successful!")
        else:
            self.report({'ERROR'}, "Connection failed!")
        
        return {'FINISHED'}


# List of classes to register
classes = [
    MODELIBR_OT_refresh_models,
    MODELIBR_OT_test_connection,
]


def register() -> None:
    """Register utility operators."""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    """Unregister utility operators."""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

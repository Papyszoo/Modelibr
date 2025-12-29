"""
Context management operators for the Modelibr Blender addon.
Handles model context operations like setting and clearing current model.
"""
from typing import Set

import bpy
from bpy.types import Operator, Context
from bpy.props import StringProperty, IntProperty


class MODELIBR_OT_clear_model_context(Operator):
    """Clear the current model context."""
    
    bl_idname = "modelibr.clear_model_context"
    bl_label = "Clear Model Context"
    bl_description = "Clear the current model context"

    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr
        props.current_model_id = 0
        props.current_model_name = ""
        props.current_version_id = 0
        self.report({'INFO'}, "Model context cleared")
        return {'FINISHED'}


class MODELIBR_OT_set_current_model(Operator):
    """Set a specific model as the current model context."""
    
    bl_idname = "modelibr.set_current_model"
    bl_label = "Set Current Model"
    bl_description = "Set this model as the current model context"
    
    model_id: IntProperty(name="Model ID")
    model_name: StringProperty(name="Model Name")
    version_id: IntProperty(name="Version ID")

    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr
        props.current_model_id = self.model_id
        props.current_model_name = self.model_name
        props.current_version_id = self.version_id
        self.report({'INFO'}, f"Set model context: {self.model_name}")
        return {'FINISHED'}


class MODELIBR_OT_focus_object(Operator):
    """Select and frame an object in the viewport."""
    
    bl_idname = "modelibr.focus_object"
    bl_label = "Focus Object"
    bl_description = "Select and frame object in viewport"
    
    object_name: StringProperty(name="Object Name")

    def execute(self, context: Context) -> Set[str]:
        obj = bpy.data.objects.get(self.object_name)
        
        if not obj:
            self.report({'ERROR'}, f"Object '{self.object_name}' not found")
            return {'CANCELLED'}
        
        # Deselect all and select target object
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        context.view_layer.objects.active = obj
        
        # Frame the object in view
        for area in context.screen.areas:
            if area.type == 'VIEW_3D':
                override = {'area': area, 'region': area.regions[-1]}
                with context.temp_override(**override):
                    bpy.ops.view3d.view_selected()
                break
        
        return {'FINISHED'}


# List of classes to register
classes = [
    MODELIBR_OT_clear_model_context,
    MODELIBR_OT_set_current_model,
    MODELIBR_OT_focus_object,
]


def register() -> None:
    """Register context operators."""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    """Unregister context operators."""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

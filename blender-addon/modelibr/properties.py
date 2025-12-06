import bpy
from bpy.types import PropertyGroup
from bpy.props import (
    StringProperty,
    IntProperty,
    CollectionProperty,
    BoolProperty,
    EnumProperty,
)


class ModelibrFileItem(PropertyGroup):
    id: IntProperty(name="File ID")
    original_filename: StringProperty(name="Original Filename")
    file_type: StringProperty(name="File Type")
    size_bytes: IntProperty(name="Size (bytes)")
    is_renderable: BoolProperty(name="Is Renderable")


class ModelibrVersionItem(PropertyGroup):
    id: IntProperty(name="Version ID")
    version_number: IntProperty(name="Version Number")
    description: StringProperty(name="Description")
    is_active: BoolProperty(name="Is Active")
    created_at: StringProperty(name="Created At")
    files: CollectionProperty(type=ModelibrFileItem)


class ModelibrModelItem(PropertyGroup):
    id: IntProperty(name="Model ID")
    name: StringProperty(name="Model Name")
    thumbnail_url: StringProperty(name="Thumbnail URL")
    created_at: StringProperty(name="Created At")
    tags: StringProperty(name="Tags")
    description: StringProperty(name="Description")


class ModelibrAssetMetadata(PropertyGroup):
    """Metadata stored on asset datablocks for asset browser integration"""
    model_id: IntProperty(
        name="Model ID",
        description="Modelibr model ID",
        default=0,
    )
    
    version_id: IntProperty(
        name="Version ID", 
        description="Modelibr version ID",
        default=0,
    )
    
    version_number: IntProperty(
        name="Version Number",
        description="Version number",
        default=1,
    )
    
    asset_type: EnumProperty(
        name="Asset Type",
        description="Type of asset",
        items=[
            ('MODEL', 'Model', 'A 3D model asset'),
            ('TEXTURE', 'Texture', 'A texture asset (future)'),
            ('RIG', 'Rig', 'A rigging asset (future)'),
            ('ANIMATION', 'Animation', 'An animation asset (future)'),
            ('SCENE', 'Scene', 'A scene asset with model references (future)'),
        ],
        default='MODEL',
    )
    
    referenced_models: StringProperty(
        name="Referenced Models",
        description="Comma-separated list of referenced model IDs (for SCENE type)",
        default="",
    )


class ModelibrSceneProperties(PropertyGroup):
    current_model_id: IntProperty(
        name="Current Model ID",
        description="ID of the model currently being worked on",
        default=0,
    )

    current_model_name: StringProperty(
        name="Current Model Name",
        description="Name of the model currently being worked on",
        default="",
    )

    current_version_id: IntProperty(
        name="Current Version ID",
        description="ID of the current version",
        default=0,
    )

    search_query: StringProperty(
        name="Search",
        description="Search models by name or tags",
        default="",
    )

    models: CollectionProperty(type=ModelibrModelItem)

    active_model_index: IntProperty(
        name="Active Model Index",
        default=0,
    )

    is_loading: BoolProperty(
        name="Is Loading",
        description="Whether models are being loaded",
        default=False,
    )

    error_message: StringProperty(
        name="Error Message",
        description="Last error message",
        default="",
    )


def register():
    bpy.utils.register_class(ModelibrFileItem)
    bpy.utils.register_class(ModelibrVersionItem)
    bpy.utils.register_class(ModelibrModelItem)
    bpy.utils.register_class(ModelibrAssetMetadata)
    bpy.utils.register_class(ModelibrSceneProperties)
    bpy.types.Scene.modelibr = bpy.props.PointerProperty(type=ModelibrSceneProperties)


def unregister():
    del bpy.types.Scene.modelibr
    bpy.utils.unregister_class(ModelibrSceneProperties)
    bpy.utils.unregister_class(ModelibrAssetMetadata)
    bpy.utils.unregister_class(ModelibrModelItem)
    bpy.utils.unregister_class(ModelibrVersionItem)
    bpy.utils.unregister_class(ModelibrFileItem)

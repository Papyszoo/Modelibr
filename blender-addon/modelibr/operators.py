import bpy
import os
import tempfile
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty, BoolProperty, EnumProperty

from .api_client import ModelibrApiClient, ApiError
from .preferences import get_preferences


def get_api_client() -> ModelibrApiClient:
    prefs = get_preferences()
    return ModelibrApiClient(prefs.server_url, prefs.api_key)


class MODELIBR_OT_refresh_models(Operator):
    bl_idname = "modelibr.refresh_models"
    bl_label = "Refresh Models"
    bl_description = "Refresh the model list from Modelibr server"

    def execute(self, context):
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


class MODELIBR_OT_import_model(Operator):
    bl_idname = "modelibr.import_model"
    bl_label = "Import Model"
    bl_description = "Import selected model from Modelibr"

    model_id: IntProperty(name="Model ID")
    version_id: IntProperty(name="Version ID", default=0)
    file_id: IntProperty(name="File ID", default=0)

    def execute(self, context):
        props = context.scene.modelibr

        if self.model_id <= 0:
            if props.active_model_index >= 0 and props.active_model_index < len(props.models):
                self.model_id = props.models[props.active_model_index].id
            else:
                self.report({'ERROR'}, "No model selected")
                return {'CANCELLED'}

        try:
            client = get_api_client()

            # Get model details
            model = client.get_model(self.model_id)

            # Get version to import
            if self.version_id > 0:
                version = client.get_model_version(self.model_id, self.version_id)
            else:
                versions = client.get_model_versions(self.model_id)
                if not versions:
                    self.report({'ERROR'}, "No versions available for this model")
                    return {'CANCELLED'}
                # Get active version or latest
                active_version_id = model.get('activeVersionId')
                version = next(
                    (v for v in versions if v['id'] == active_version_id),
                    versions[-1]
                )

            # Find file to import
            files = version.get('files', [])
            if not files:
                self.report({'ERROR'}, "No files in this version")
                return {'CANCELLED'}

            # Prefer specific file_id, otherwise find first renderable
            file_to_import = None
            if self.file_id > 0:
                file_to_import = next((f for f in files if f['id'] == self.file_id), None)

            if not file_to_import:
                # Prefer GLB, then FBX, then OBJ, then blend
                priority = ['glb', 'gltf', 'fbx', 'obj', 'blend']
                for ext in priority:
                    for f in files:
                        if f.get('originalFileName', '').lower().endswith(f'.{ext}'):
                            file_to_import = f
                            break
                    if file_to_import:
                        break

            if not file_to_import:
                file_to_import = files[0]

            # Download file
            with tempfile.TemporaryDirectory() as temp_dir:
                filename = file_to_import.get('originalFileName', f"model_{self.model_id}")
                file_path = client.download_file(
                    file_to_import['id'],
                    temp_dir,
                    filename
                )

                # Import based on file extension
                ext = os.path.splitext(filename)[1].lower()
                if ext in ['.glb', '.gltf']:
                    bpy.ops.import_scene.gltf(filepath=file_path)
                elif ext == '.fbx':
                    bpy.ops.import_scene.fbx(filepath=file_path)
                elif ext == '.obj':
                    bpy.ops.wm.obj_import(filepath=file_path)
                elif ext == '.blend':
                    with bpy.data.libraries.load(file_path, link=False) as (data_from, data_to):
                        data_to.objects = data_from.objects
                    for obj in data_to.objects:
                        if obj is not None:
                            context.collection.objects.link(obj)
                else:
                    self.report({'ERROR'}, f"Unsupported file format: {ext}")
                    return {'CANCELLED'}

            # Update scene properties
            props.current_model_id = self.model_id
            props.current_model_name = model.get('name', '')
            props.current_version_id = version.get('id', 0)

            self.report({'INFO'}, f"Imported model: {model.get('name', '')}")
            return {'FINISHED'}

        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}


class MODELIBR_OT_upload_version(Operator):
    bl_idname = "modelibr.upload_version"
    bl_label = "Upload Version"
    bl_description = "Upload current scene as a new version"

    description: StringProperty(
        name="Description",
        description="Version description",
        default="",
    )

    set_as_active: BoolProperty(
        name="Set as Active",
        description="Set this version as the active version",
        default=True,
    )

    export_format: EnumProperty(
        name="Export Format",
        items=[
            ('GLB', "GLB", "GL Transmission Format Binary"),
            ('FBX', "FBX", "Autodesk FBX"),
            ('OBJ', "OBJ", "Wavefront OBJ"),
        ],
        default='GLB',
    )

    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )

    def invoke(self, context, event):
        props = context.scene.modelibr
        prefs = get_preferences()

        if props.current_model_id <= 0:
            self.report({'ERROR'}, "No model context. Import a model first or use 'Open in Blender' from the web app.")
            return {'CANCELLED'}

        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend

        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context):
        layout = self.layout
        props = context.scene.modelibr

        layout.label(text=f"Model: {props.current_model_name}")
        layout.prop(self, "description")
        layout.prop(self, "export_format")
        layout.prop(self, "set_as_active")
        layout.prop(self, "include_blend")

    def execute(self, context):
        props = context.scene.modelibr

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                # Export model
                model_name = props.current_model_name or "model"
                safe_name = "".join(c for c in model_name if c.isalnum() or c in (' ', '-', '_')).strip()

                if self.export_format == 'GLB':
                    export_path = os.path.join(temp_dir, f"{safe_name}.glb")
                    bpy.ops.export_scene.gltf(
                        filepath=export_path,
                        export_format='GLB',
                        use_selection=False,
                    )
                elif self.export_format == 'FBX':
                    export_path = os.path.join(temp_dir, f"{safe_name}.fbx")
                    bpy.ops.export_scene.fbx(filepath=export_path)
                elif self.export_format == 'OBJ':
                    export_path = os.path.join(temp_dir, f"{safe_name}.obj")
                    bpy.ops.wm.obj_export(filepath=export_path)

                # Create version with main file
                result = client.create_version(
                    props.current_model_id,
                    export_path,
                    self.description,
                    self.set_as_active,
                )

                version_id = result.get('id', 0)

                # Upload .blend file if requested
                if self.include_blend and version_id > 0:
                    blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
                    bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
                    client.add_file_to_version(
                        props.current_model_id,
                        version_id,
                        blend_path
                    )

                # Update current version
                if version_id > 0:
                    props.current_version_id = version_id

                self.report({'INFO'}, f"Uploaded new version for '{props.current_model_name}'")
                return {'FINISHED'}

        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}


class MODELIBR_OT_upload_new_model(Operator):
    bl_idname = "modelibr.upload_new_model"
    bl_label = "Upload New Model"
    bl_description = "Upload current scene as a new model"

    model_name: StringProperty(
        name="Model Name",
        description="Name for the new model",
        default="",
    )

    export_format: EnumProperty(
        name="Export Format",
        items=[
            ('GLB', "GLB", "GL Transmission Format Binary"),
            ('FBX', "FBX", "Autodesk FBX"),
            ('OBJ', "OBJ", "Wavefront OBJ"),
        ],
        default='GLB',
    )

    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )

    def invoke(self, context, event):
        prefs = get_preferences()
        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend

        # Default name from blend file
        blend_name = bpy.path.basename(bpy.data.filepath)
        if blend_name:
            self.model_name = os.path.splitext(blend_name)[0]

        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "model_name")
        layout.prop(self, "export_format")
        layout.prop(self, "include_blend")

    def execute(self, context):
        if not self.model_name:
            self.report({'ERROR'}, "Model name is required")
            return {'CANCELLED'}

        props = context.scene.modelibr

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                safe_name = "".join(c for c in self.model_name if c.isalnum() or c in (' ', '-', '_')).strip()

                if self.export_format == 'GLB':
                    export_path = os.path.join(temp_dir, f"{safe_name}.glb")
                    bpy.ops.export_scene.gltf(
                        filepath=export_path,
                        export_format='GLB',
                        use_selection=False,
                    )
                elif self.export_format == 'FBX':
                    export_path = os.path.join(temp_dir, f"{safe_name}.fbx")
                    bpy.ops.export_scene.fbx(filepath=export_path)
                elif self.export_format == 'OBJ':
                    export_path = os.path.join(temp_dir, f"{safe_name}.obj")
                    bpy.ops.wm.obj_export(filepath=export_path)

                # Create new model
                result = client.create_model(export_path)
                model_id = result.get('id', 0)

                # Upload .blend file if requested
                if self.include_blend and model_id > 0:
                    versions = client.get_model_versions(model_id)
                    if versions:
                        version_id = versions[-1].get('id', 0)
                        if version_id > 0:
                            blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
                            bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
                            client.add_file_to_version(model_id, version_id, blend_path)

                # Set as current model
                if model_id > 0:
                    props.current_model_id = model_id
                    props.current_model_name = self.model_name

                self.report({'INFO'}, f"Created new model: '{self.model_name}'")
                return {'FINISHED'}

        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}


class MODELIBR_OT_test_connection(Operator):
    bl_idname = "modelibr.test_connection"
    bl_label = "Test Connection"
    bl_description = "Test connection to Modelibr server"

    def execute(self, context):
        client = get_api_client()
        if client.test_connection():
            self.report({'INFO'}, "Connection successful!")
        else:
            self.report({'ERROR'}, "Connection failed. Check server URL and API key.")
        return {'FINISHED'}


class MODELIBR_OT_clear_model_context(Operator):
    bl_idname = "modelibr.clear_model_context"
    bl_label = "Clear Model Context"
    bl_description = "Clear the current model context"

    def execute(self, context):
        props = context.scene.modelibr
        props.current_model_id = 0
        props.current_model_name = ""
        props.current_version_id = 0
        self.report({'INFO'}, "Model context cleared")
        return {'FINISHED'}


classes = [
    MODELIBR_OT_refresh_models,
    MODELIBR_OT_import_model,
    MODELIBR_OT_upload_version,
    MODELIBR_OT_upload_new_model,
    MODELIBR_OT_test_connection,
    MODELIBR_OT_clear_model_context,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

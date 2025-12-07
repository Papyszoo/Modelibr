import bpy
import os
import tempfile
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty, BoolProperty, EnumProperty

from .api_client import ModelibrApiClient, ApiError
from .preferences import get_preferences
from .tracking import store_object_metadata
import datetime


def get_api_client() -> ModelibrApiClient:
    prefs = get_preferences()
    return ModelibrApiClient(prefs.server_url, prefs.api_key)


def sanitize_filename(name: str) -> str:
    """Sanitize a name for use as a filename."""
    return "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
 

def _debug_log(message: str) -> None:
    """Append debug messages to a file in the OS temp directory so they are available
    even when Blender's console is not visible."""
    try:
        log_path = os.path.join(tempfile.gettempdir(), "modelibr_debug.log")
        timestamp = datetime.datetime.utcnow().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} {message}\n")
    except Exception:
        # Never raise from logging to avoid interfering with the operator
        pass


def _extract_id(d: dict, keys=('id', 'versionId', 'version_id', 'modelId', 'model_id')) -> int:
    """Extract an integer id from a response dict using multiple possible keys."""
    if not isinstance(d, dict):
        return 0
    for k in keys:
        v = d.get(k)
        try:
            if v is None:
                continue
            iv = int(v)
            if iv > 0:
                return iv
        except Exception:
            continue
    return 0

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

                # Track objects before import to identify newly imported objects
                objects_before = set(context.scene.objects)
                
                # Import based on file extension
                ext = os.path.splitext(filename)[1].lower()
                if ext in ['.glb', '.gltf']:
                    bpy.ops.import_scene.gltf(filepath=file_path)
                elif ext == '.fbx':
                    bpy.ops.import_scene.fbx(filepath=file_path)
                elif ext == '.obj':
                    bpy.ops.wm.obj_import(filepath=file_path)
                elif ext == '.blend':
                    # Import from .blend with name conflict resolution
                    with bpy.data.libraries.load(file_path, link=False) as (data_from, data_to):
                        data_to.objects = data_from.objects
                    for obj in data_to.objects:
                        if obj is not None:
                            # Handle name conflicts by letting Blender auto-rename
                            if obj.name in context.collection.objects:
                                obj.name = obj.name + ".imported"
                            context.collection.objects.link(obj)
                else:
                    self.report({'ERROR'}, f"Unsupported file format: {ext}")
                    return {'CANCELLED'}
                
                # Identify newly imported objects and store metadata
                objects_after = set(context.scene.objects)
                new_objects = objects_after - objects_before
                
                for obj in new_objects:
                    store_object_metadata(
                        obj,
                        model_id=self.model_id,
                        model_name=model.get('name', ''),
                        version_id=version.get('id', 0),
                        version_number=version.get('versionNumber', 1),
                        file_id=file_to_import['id']
                    )

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

        # Debug: record preference and initial state
        try:
            _debug_log(f"invoke upload_version: always_include_blend={prefs.always_include_blend}, include_blend={self.include_blend}, current_model_id={props.current_model_id}")
        except Exception:
            pass

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

        # Debug: entry to execute
        try:
            _debug_log(f"execute upload_version start: include_blend={self.include_blend}, current_model_id={props.current_model_id}")
        except Exception:
            pass

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                # Export model
                model_name = props.current_model_name or "model"
                safe_name = sanitize_filename(model_name)

                if self.export_format == 'GLB':
                    export_path = os.path.join(temp_dir, f"{safe_name}.glb")
                    bpy.ops.export_scene.gltf(
                        filepath=export_path,
                        export_format='GLB',
                        use_selection=False,
                    )
                    _debug_log(f"Exported GLB to: {export_path}")
                elif self.export_format == 'FBX':
                    export_path = os.path.join(temp_dir, f"{safe_name}.fbx")
                    bpy.ops.export_scene.fbx(filepath=export_path)
                    _debug_log(f"Exported FBX to: {export_path}")
                elif self.export_format == 'OBJ':
                    export_path = os.path.join(temp_dir, f"{safe_name}.obj")
                    bpy.ops.wm.obj_export(filepath=export_path)
                    _debug_log(f"Exported OBJ to: {export_path}")

                # Create version with main file
                try:
                    _debug_log(f"Calling create_version with file: {export_path}")
                    result = client.create_version(
                        props.current_model_id,
                        export_path,
                        self.description,
                        self.set_as_active,
                    )
                    _debug_log(f"create_version result: {result}")
                except Exception as e:
                    _debug_log(f"create_version raised: {str(e)}")
                    raise

                version_id = _extract_id(result, keys=('id', 'versionId', 'version_id'))
                _debug_log(f"version_id after create_version: {version_id} (raw result keys: {list(result.keys())})")

                # Upload .blend file if requested
                if self.include_blend and version_id > 0:
                    blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
                    try:
                        _debug_log(f"Saving blend file to: {blend_path}")
                        # Save the blend file
                        result = bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
                        _debug_log(f"Blend save result: {result}")

                        # Check if operation succeeded (result is a set containing 'FINISHED')
                        if 'FINISHED' in result:
                            exists = os.path.exists(blend_path)
                            _debug_log(f"Checking file existence: {exists}")
                            # Verify file was created and has content
                            if exists and os.path.getsize(blend_path) > 0:
                                file_size = os.path.getsize(blend_path)
                                _debug_log(f"Blend file created successfully ({file_size} bytes). Uploading...")
                                client.add_file_to_version(
                                    props.current_model_id,
                                    version_id,
                                    blend_path
                                )
                                _debug_log("Blend file uploaded successfully")
                            else:
                                _debug_log(f"Blend file does not exist or is empty at {blend_path}")
                                self.report({'WARNING'}, "Blend file could not be saved")
                        else:
                            _debug_log("Blend save operation failed or was cancelled")
                            self.report({'WARNING'}, "Blend file save operation was cancelled or failed")
                    except Exception as e:
                        _debug_log(f"Exception during blend file upload: {str(e)}")
                        import traceback
                        traceback.print_exc()
                        self.report({'WARNING'}, f"Could not include blend file: {str(e)}")

                # Update current version
                if version_id > 0:
                    props.current_version_id = version_id

                self.report({'INFO'}, f"Uploaded new version for '{props.current_model_name}'")
                return {'FINISHED'}

        except ApiError as e:
            _debug_log(f"ApiError in upload_version: {str(e)}")
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

        # Debug: record preference and initial state for new model upload
        try:
            _debug_log(f"invoke upload_new_model: always_include_blend={prefs.always_include_blend}, include_blend={self.include_blend}, blend_name={blend_name}")
        except Exception:
            pass

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

        # Debug: entry to execute for new model upload
        try:
            _debug_log(f"execute upload_new_model start: include_blend={self.include_blend}, model_name={self.model_name}")
        except Exception:
            pass

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                safe_name = sanitize_filename(self.model_name)

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
                try:
                    _debug_log(f"Calling create_model with file: {export_path}")
                    result = client.create_model(export_path)
                    _debug_log(f"create_model result: {result}")
                except Exception as e:
                    _debug_log(f"create_model raised: {str(e)}")
                    raise

                model_id = _extract_id(result, keys=('id', 'modelId', 'model_id'))
                _debug_log(f"model_id after create_model: {model_id} (raw result keys: {list(result.keys())})")

                # Upload .blend file if requested
                if self.include_blend and model_id > 0:
                    versions = client.get_model_versions(model_id)
                    if versions:
                        version_id = _extract_id(versions[-1], keys=('id', 'versionId', 'version_id'))
                        if version_id > 0:
                            blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
                            try:
                                _debug_log(f"Saving blend file to: {blend_path}")
                                # Save the blend file
                                result = bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
                                _debug_log(f"Blend save result: {result}")
                                
                                # Check if operation succeeded (result is a set containing 'FINISHED')
                                if 'FINISHED' in result:
                                    exists = os.path.exists(blend_path)
                                    _debug_log(f"Checking file existence: {exists}")
                                    # Verify file was created and has content
                                    if exists and os.path.getsize(blend_path) > 0:
                                        file_size = os.path.getsize(blend_path)
                                        _debug_log(f"Blend file created successfully ({file_size} bytes). Uploading...")
                                        client.add_file_to_version(model_id, version_id, blend_path)
                                        _debug_log("Blend file uploaded successfully")
                                    else:
                                        _debug_log(f"Blend file does not exist or is empty at {blend_path}")
                                        self.report({'WARNING'}, "Blend file could not be saved")
                                else:
                                    _debug_log("Blend save operation failed or was cancelled")
                                    self.report({'WARNING'}, "Blend file save operation was cancelled or failed")
                            except Exception as e:
                                _debug_log(f"Exception during blend file upload: {str(e)}")
                                import traceback
                                traceback.print_exc()
                                self.report({'WARNING'}, f"Could not include blend file: {str(e)}")

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


class MODELIBR_OT_focus_object(Operator):
    bl_idname = "modelibr.focus_object"
    bl_label = "Focus Object"
    bl_description = "Select and frame object in viewport"
    
    object_name: StringProperty(name="Object Name")
    
    def execute(self, context):
        obj = bpy.data.objects.get(self.object_name)
        if obj:
            # Deselect all
            bpy.ops.object.select_all(action='DESELECT')
            # Select target
            obj.select_set(True)
            context.view_layer.objects.active = obj
            # Frame in viewport
            bpy.ops.view3d.view_selected()
            return {'FINISHED'}
        
        self.report({'WARNING'}, f"Object '{self.object_name}' not found")
        return {'CANCELLED'}


class MODELIBR_OT_upload_from_imported(Operator):
    bl_idname = "modelibr.upload_from_imported"
    bl_label = "Upload Selected Asset"
    bl_description = "Upload selected asset as new version or new model"
    
    upload_as: EnumProperty(
        name="Upload As",
        items=[
            ('VERSION', "New Version", "Upload as new version of existing model"),
            ('MODEL', "New Model", "Upload as completely new model"),
        ],
        default='VERSION',
    )
    
    description: StringProperty(
        name="Description",
        description="Version or model description",
        default="",
    )
    
    model_name: StringProperty(
        name="Model Name",
        description="Name for new model (only for New Model option)",
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
        obj = context.active_object
        prefs = get_preferences()
        
        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend
        
        # Detect if active object is from Modelibr
        if obj and "modelibr_model_id" in obj:
            self.model_id = obj["modelibr_model_id"]
            self.model_name = obj.get("modelibr_model_name", "")
            # Default to VERSION upload
            self.upload_as = 'VERSION'
        else:
            # Force NEW_MODEL if no Modelibr context
            self.upload_as = 'MODEL'
            self.model_id = 0
            
            # Default name from blend file
            blend_name = bpy.path.basename(bpy.data.filepath)
            if blend_name:
                self.model_name = os.path.splitext(blend_name)[0]
        
        return context.window_manager.invoke_props_dialog(self)
    
    def draw(self, context):
        layout = self.layout
        
        layout.prop(self, "upload_as", expand=True)
        
        if self.upload_as == 'VERSION':
            layout.label(text=f"Model: {self.model_name}")
            layout.prop(self, "description")
        else:
            layout.prop(self, "model_name")
        
        layout.prop(self, "export_format")
        layout.prop(self, "include_blend")
    
    def execute(self, context):
        if self.upload_as == 'VERSION':
            # Upload as new version
            if self.model_id <= 0:
                self.report({'ERROR'}, "No model ID available")
                return {'CANCELLED'}
            
            # Delegate to upload_version operator
            bpy.ops.modelibr.upload_version(
                description=self.description,
                export_format=self.export_format,
                include_blend=self.include_blend,
                set_as_active=True,
            )
        else:
            # Upload as new model
            if not self.model_name:
                self.report({'ERROR'}, "Model name is required")
                return {'CANCELLED'}
            
            # Delegate to upload_new_model operator
            bpy.ops.modelibr.upload_new_model(
                model_name=self.model_name,
                export_format=self.export_format,
                include_blend=self.include_blend,
            )
        
        return {'FINISHED'}


classes = [
    MODELIBR_OT_refresh_models,
    MODELIBR_OT_import_model,
    MODELIBR_OT_upload_version,
    MODELIBR_OT_upload_new_model,
    MODELIBR_OT_test_connection,
    MODELIBR_OT_clear_model_context,
    MODELIBR_OT_focus_object,
    MODELIBR_OT_upload_from_imported,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

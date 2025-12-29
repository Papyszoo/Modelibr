"""
Import operators for the Modelibr Blender addon.
Handles importing models from the Modelibr server.
"""
import os
import tempfile
import shutil
from typing import Set, List, Optional, Any, Dict

import bpy
from bpy.types import Operator, Object, Context, Event
from bpy.props import IntProperty, FloatProperty, StringProperty

from ..api_client import ModelibrApiClient
from ..exceptions import ApiError
from ..tracking import store_object_metadata
from ..config import IMPORT_FORMAT_PRIORITY, METADATA_TEXTURE_SET_ID, METADATA_TEXTURE_HASH
from ..async_handler import (
    BackgroundTask, ProgressTracker, TaskStatus,
    register_task, unregister_task, get_task
)
from .common import get_api_client, debug_log


class MODELIBR_OT_import_model(Operator):
    """Import a model from the Modelibr server."""
    
    bl_idname = "modelibr.import_model"
    bl_label = "Import Model"
    bl_description = "Import selected model from Modelibr"

    model_id: IntProperty(name="Model ID")
    version_id: IntProperty(name="Version ID", default=0)
    file_id: IntProperty(name="File ID", default=0)

    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr

        if self.model_id <= 0:
            if props.active_model_index >= 0 and props.active_model_index < len(props.models):
                self.model_id = props.models[props.active_model_index].id
            else:
                self.report({'ERROR'}, "No model selected")
                return {'CANCELLED'}

        try:
            client = get_api_client()
            
            # Fetch model and version data
            model = client.get_model(self.model_id)
            version = self._get_version(client, model)
            
            if version is None:
                self.report({'ERROR'}, "No versions available for this model")
                return {'CANCELLED'}
            
            # Find file to import
            file_to_import = self._find_import_file(version)
            if file_to_import is None:
                self.report({'ERROR'}, "No files in this version")
                return {'CANCELLED'}
            
            # Get texture set info - use default or fall back to first associated texture set
            default_texture_set_id = version.get('defaultTextureSetId')
            texture_set_ids = version.get('textureSetIds', [])
            
            # Fall back to first associated texture set if no default is set
            if default_texture_set_id is None and texture_set_ids:
                default_texture_set_id = texture_set_ids[0]
                print(f"[Modelibr] No defaultTextureSetId, using first textureSetId: {default_texture_set_id}")
            
            print(f"[Modelibr] Version {version.get('id')} textureSetId = {default_texture_set_id} (textureSetIds={texture_set_ids})")
            textures = self._fetch_textures(client, default_texture_set_id)
            
            # Download and import
            with tempfile.TemporaryDirectory() as temp_dir:
                new_objects, downloaded_textures = self._download_and_import(
                    context, client, file_to_import, textures, temp_dir
                )
                
                if new_objects is None:
                    return {'CANCELLED'}
                
                # Apply textures and store metadata
                texture_hash = self._apply_textures(new_objects, downloaded_textures, temp_dir)
                self._store_metadata(
                    new_objects, model, version, file_to_import,
                    default_texture_set_id, texture_hash
                )

            # Update scene properties
            props.current_model_id = self.model_id
            props.current_model_name = model.get('name', '')
            props.current_version_id = version.get('id', 0)

            texture_msg = f" with {len(downloaded_textures)} textures" if downloaded_textures else ""
            self.report({'INFO'}, f"Imported model: {model.get('name', '')}{texture_msg}")
            return {'FINISHED'}

        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}

    def _get_version(
        self, 
        client: ModelibrApiClient, 
        model: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Get the version to import."""
        if self.version_id > 0:
            version = client.get_model_version(self.model_id, self.version_id)
            print(f"[Modelibr] Got version data (specific): {version}")
            return version
        
        versions = client.get_model_versions(self.model_id)
        if not versions:
            return None
        
        # Get active version or latest
        active_version_id = model.get('activeVersionId')
        version = next(
            (v for v in versions if v['id'] == active_version_id),
            versions[-1]
        )
        print(f"[Modelibr] Got version data (from list): {version}")
        return version

    def _find_import_file(self, version: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find the best file to import from the version."""
        files = version.get('files', [])
        if not files:
            return None

        # Prefer specific file_id
        if self.file_id > 0:
            file_match = next((f for f in files if f['id'] == self.file_id), None)
            if file_match:
                return file_match

        # Find by priority
        for ext in IMPORT_FORMAT_PRIORITY:
            for f in files:
                if f.get('originalFileName', '').lower().endswith(f'.{ext}'):
                    return f

        return files[0]

    def _fetch_textures(
        self, 
        client: ModelibrApiClient, 
        texture_set_id: Optional[int]
    ) -> List[Dict[str, Any]]:
        """Fetch textures from texture set if available."""
        print(f"[Modelibr] _fetch_textures called with texture_set_id={texture_set_id}")
        if not texture_set_id:
            print("[Modelibr] No texture_set_id provided, skipping texture fetch")
            return []
        
        try:
            texture_set = client.get_texture_set(texture_set_id)
            print(f"[Modelibr] Got texture set response: {texture_set}")
            textures = texture_set.get('textures', [])
            debug_log(f"Found texture set {texture_set_id} with {len(textures)} textures")
            print(f"[Modelibr] Found {len(textures)} textures in set {texture_set_id}")
            for tex in textures:
                print(f"[Modelibr]   - Texture: fileId={tex.get('fileId')}, fileName={tex.get('fileName')}, type={tex.get('textureType')}")
            return textures
        except ApiError as e:
            debug_log(f"Failed to fetch texture set {texture_set_id}: {e}")
            print(f"[Modelibr] ERROR fetching texture set {texture_set_id}: {e}")
            return []

    def _download_and_import(
        self,
        context: Context,
        client: ModelibrApiClient,
        file_to_import: Dict[str, Any],
        textures: List[Dict[str, Any]],
        temp_dir: str
    ) -> tuple:
        """Download files and import into Blender."""
        filename = file_to_import.get('originalFileName', f"model_{self.model_id}")
        file_path = client.download_file(file_to_import['id'], temp_dir, filename)

        # Download textures
        downloaded_textures = []
        if textures:
            debug_log(f"Downloading {len(textures)} textures...")
            print(f"[Modelibr] Downloading {len(textures)} textures to {temp_dir}")
            for tex in textures:
                tex_file_id = tex.get('fileId')
                tex_filename = tex.get('fileName', f"texture_{tex_file_id}")
                if tex_file_id:
                    try:
                        tex_path = client.download_file(tex_file_id, temp_dir, tex_filename)
                        # Verify file was actually downloaded
                        if os.path.exists(tex_path):
                            file_size = os.path.getsize(tex_path)
                            print(f"[Modelibr] Downloaded texture: {tex_filename} ({file_size} bytes) at {tex_path}")
                            if file_size > 0:
                                downloaded_textures.append(tex)
                            else:
                                print(f"[Modelibr] WARNING: Texture file is empty!")
                        else:
                            print(f"[Modelibr] ERROR: Texture file not found after download: {tex_path}")
                        debug_log(f"Downloaded texture: {tex_filename}")
                    except ApiError as e:
                        debug_log(f"Failed to download texture {tex_file_id}: {e}")
                        print(f"[Modelibr] ERROR: Failed to download texture {tex_file_id}: {e}")

        # Track objects before import
        objects_before = set(context.scene.objects)
        
        # Import based on file extension
        ext = os.path.splitext(filename)[1].lower()
        if not self._import_file(context, file_path, ext):
            self.report({'ERROR'}, f"Unsupported file format: {ext}")
            return None, []
        
        # Get newly imported objects
        objects_after = set(context.scene.objects)
        new_objects = list(objects_after - objects_before)
        
        return new_objects, downloaded_textures

    def _import_file(self, context: Context, file_path: str, ext: str) -> bool:
        """Import a file based on its extension."""
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
                    if obj.name in context.collection.objects:
                        obj.name = obj.name + ".imported"
                    context.collection.objects.link(obj)
        else:
            return False
        return True

    def _apply_textures(
        self, 
        new_objects: List[Object], 
        downloaded_textures: List[Dict[str, Any]], 
        temp_dir: str
    ) -> str:
        """Apply textures to imported objects and return texture hash."""
        if not downloaded_textures:
            return ""
        
        try:
            from ..texture_utils import apply_textures_to_materials, calculate_material_textures_hash
            success = apply_textures_to_materials(new_objects, downloaded_textures, temp_dir)
            if success:
                debug_log("Successfully applied textures to materials")
                for obj in new_objects:
                    if obj.material_slots:
                        texture_hash = calculate_material_textures_hash(obj)
                        if texture_hash:
                            return texture_hash
            else:
                debug_log("Failed to apply textures to materials")
        except Exception as e:
            debug_log(f"Error applying textures: {e}")
            import traceback
            traceback.print_exc()
        
        return ""

    def _store_metadata(
        self,
        new_objects: List[Object],
        model: Dict[str, Any],
        version: Dict[str, Any],
        file_to_import: Dict[str, Any],
        texture_set_id: Optional[int],
        texture_hash: str
    ) -> None:
        """Store Modelibr metadata on imported objects."""
        for obj in new_objects:
            store_object_metadata(
                obj,
                model_id=self.model_id,
                model_name=model.get('name', ''),
                version_id=version.get('id', 0),
                version_number=version.get('versionNumber', 1),
                file_id=file_to_import['id']
            )
            if texture_set_id:
                obj[METADATA_TEXTURE_SET_ID] = texture_set_id
                if texture_hash:
                    obj[METADATA_TEXTURE_HASH] = texture_hash


class ImportDownloadTask(BackgroundTask):
    """Background task for downloading model files."""
    
    def __init__(
        self,
        client: ModelibrApiClient,
        file_to_import: Dict[str, Any],
        textures: List[Dict[str, Any]],
        temp_dir: str,
        model_id: int
    ):
        super().__init__()
        self.client = client
        self.file_to_import = file_to_import
        self.textures = textures
        self.temp_dir = temp_dir
        self.model_id = model_id
        self.downloaded_textures: List[Dict[str, Any]] = []
        self.model_file_path: str = ""
    
    def run(self) -> None:
        """Download model and texture files in background thread."""
        try:
            total_files = 1 + len(self.textures)
            downloaded = 0
            
            # Download main model file
            filename = self.file_to_import.get('originalFileName', f"model_{self.model_id}")
            self.tracker.update(
                progress=0.0,
                message=f"Downloading {filename}..."
            )
            
            self.model_file_path = self.client.download_file(
                self.file_to_import['id'],
                self.temp_dir,
                filename
            )
            downloaded += 1
            self.tracker.update(progress=downloaded / total_files)
            
            if self.should_cancel:
                self.tracker.set_cancelled()
                return
            
            # Download textures
            for i, tex in enumerate(self.textures):
                if self.should_cancel:
                    self.tracker.set_cancelled()
                    return
                
                tex_file_id = tex.get('fileId')
                tex_filename = tex.get('fileName', f"texture_{tex_file_id}")
                
                self.tracker.update(
                    progress=downloaded / total_files,
                    message=f"Downloading texture {i+1}/{len(self.textures)}..."
                )
                
                if tex_file_id:
                    try:
                        self.client.download_file(tex_file_id, self.temp_dir, tex_filename)
                        self.downloaded_textures.append(tex)
                    except ApiError as e:
                        debug_log(f"Failed to download texture {tex_file_id}: {e}")
                
                downloaded += 1
                self.tracker.update(progress=downloaded / total_files)
            
            self.tracker.set_completed({
                'model_file_path': self.model_file_path,
                'downloaded_textures': self.downloaded_textures,
                'filename': filename
            })
            
        except Exception as e:
            self.tracker.set_failed(str(e))


class MODELIBR_OT_import_model_async(Operator):
    """
    Import a model asynchronously with progress feedback.
    
    This operator downloads files in the background while keeping
    the Blender UI responsive, then imports the model on completion.
    """
    
    bl_idname = "modelibr.import_model_async"
    bl_label = "Import Model (Async)"
    bl_description = "Import model with progress feedback (non-blocking)"

    model_id: IntProperty(name="Model ID")
    version_id: IntProperty(name="Version ID", default=0)
    file_id: IntProperty(name="File ID", default=0)
    
    # Internal state
    _timer = None
    _task: Optional[ImportDownloadTask] = None
    _temp_dir: Optional[str] = None
    _model: Optional[Dict[str, Any]] = None
    _version: Optional[Dict[str, Any]] = None
    _file_to_import: Optional[Dict[str, Any]] = None
    _texture_set_id: Optional[int] = None

    def invoke(self, context: Context, event: Event) -> Set[str]:
        """Start the async import operation."""
        props = context.scene.modelibr

        if self.model_id <= 0:
            if props.active_model_index >= 0 and props.active_model_index < len(props.models):
                self.model_id = props.models[props.active_model_index].id
            else:
                self.report({'ERROR'}, "No model selected")
                return {'CANCELLED'}

        try:
            client = get_api_client()
            
            # Fetch model and version data (quick API calls)
            self._model = client.get_model(self.model_id)
            self._version = self._get_version(client, self._model)
            
            if self._version is None:
                self.report({'ERROR'}, "No versions available for this model")
                return {'CANCELLED'}
            
            # Find file to import
            self._file_to_import = self._find_import_file(self._version)
            if self._file_to_import is None:
                self.report({'ERROR'}, "No files in this version")
                return {'CANCELLED'}
            
            # Get texture set info - use default or fall back to first associated texture set
            self._texture_set_id = self._version.get('defaultTextureSetId')
            texture_set_ids = self._version.get('textureSetIds', [])
            
            # Fall back to first associated texture set if no default is set
            if self._texture_set_id is None and texture_set_ids:
                self._texture_set_id = texture_set_ids[0]
            
            textures = self._fetch_textures(client, self._texture_set_id)
            
            # Create temp directory (will be cleaned up in modal)
            self._temp_dir = tempfile.mkdtemp(prefix="modelibr_import_")
            
            # Create and start background download task
            self._task = ImportDownloadTask(
                client=client,
                file_to_import=self._file_to_import,
                textures=textures,
                temp_dir=self._temp_dir,
                model_id=self.model_id
            )
            register_task(f"import_{self.model_id}", self._task)
            self._task.start()
            
            # Add timer for progress updates
            wm = context.window_manager
            self._timer = wm.event_timer_add(0.1, window=context.window)
            wm.modal_handler_add(self)
            
            debug_log(f"Started async import for model {self.model_id}")
            return {'RUNNING_MODAL'}
            
        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}

    def modal(self, context: Context, event: Event) -> Set[str]:
        """Handle timer events and check task progress."""
        if event.type == 'TIMER':
            if self._task is None:
                return self._finish(context, cancelled=True)
            
            state = self._task.tracker.get_state()
            
            # Update header with progress
            model_name = self._model.get('name', '') if self._model else ''
            context.area.header_text_set(
                f"Importing '{model_name}': {state.progress:.0%} - {state.message}"
            )
            
            if state.status == TaskStatus.COMPLETED:
                return self._complete_import(context, state.result)
            elif state.status == TaskStatus.FAILED:
                self.report({'ERROR'}, f"Import failed: {state.error}")
                return self._finish(context)
            elif state.status == TaskStatus.CANCELLED:
                self.report({'WARNING'}, "Import cancelled")
                return self._finish(context, cancelled=True)
        
        elif event.type == 'ESC':
            # Cancel on escape key
            if self._task:
                self._task.cancel()
            self.report({'WARNING'}, "Import cancelled")
            return self._finish(context, cancelled=True)
        
        return {'PASS_THROUGH'}

    def _complete_import(self, context: Context, result: Dict[str, Any]) -> Set[str]:
        """Complete the import on the main thread."""
        if not result or not self._temp_dir:
            return self._finish(context, cancelled=True)
        
        try:
            model_file_path = result.get('model_file_path', '')
            downloaded_textures = result.get('downloaded_textures', [])
            filename = result.get('filename', '')
            
            # Track objects before import
            objects_before = set(context.scene.objects)
            
            # Import based on file extension (must be on main thread)
            ext = os.path.splitext(filename)[1].lower()
            if not self._import_file(context, model_file_path, ext):
                self.report({'ERROR'}, f"Unsupported file format: {ext}")
                return self._finish(context)
            
            # Get newly imported objects
            objects_after = set(context.scene.objects)
            new_objects = list(objects_after - objects_before)
            
            # Apply textures
            texture_hash = ""
            if downloaded_textures:
                texture_hash = self._apply_textures(
                    new_objects, downloaded_textures, self._temp_dir
                )
            
            # Store metadata
            self._store_metadata(new_objects, texture_hash)
            
            # Update scene properties
            props = context.scene.modelibr
            props.current_model_id = self.model_id
            props.current_model_name = self._model.get('name', '') if self._model else ''
            props.current_version_id = self._version.get('id', 0) if self._version else 0
            
            texture_msg = f" with {len(downloaded_textures)} textures" if downloaded_textures else ""
            model_name = self._model.get('name', '') if self._model else ''
            self.report({'INFO'}, f"Imported model: {model_name}{texture_msg}")
            
        except Exception as e:
            debug_log(f"Error completing import: {e}")
            self.report({'ERROR'}, f"Import failed: {e}")
        
        return self._finish(context)

    def _finish(self, context: Context, cancelled: bool = False) -> Set[str]:
        """Clean up and finish the operator."""
        # Remove timer
        if self._timer:
            wm = context.window_manager
            wm.event_timer_remove(self._timer)
            self._timer = None
        
        # Clear header text
        context.area.header_text_set(None)
        
        # Unregister task
        unregister_task(f"import_{self.model_id}")
        
        # Clean up temp directory
        if self._temp_dir and os.path.exists(self._temp_dir):
            try:
                shutil.rmtree(self._temp_dir)
            except Exception:
                pass
            self._temp_dir = None
        
        self._task = None
        
        return {'CANCELLED'} if cancelled else {'FINISHED'}

    # Helper methods (shared with sync version)
    def _get_version(
        self, 
        client: ModelibrApiClient, 
        model: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.version_id > 0:
            return client.get_model_version(self.model_id, self.version_id)
        versions = client.get_model_versions(self.model_id)
        if not versions:
            return None
        active_version_id = model.get('activeVersionId')
        return next(
            (v for v in versions if v['id'] == active_version_id),
            versions[-1]
        )

    def _find_import_file(self, version: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        files = version.get('files', [])
        if not files:
            return None
        if self.file_id > 0:
            file_match = next((f for f in files if f['id'] == self.file_id), None)
            if file_match:
                return file_match
        for ext in IMPORT_FORMAT_PRIORITY:
            for f in files:
                if f.get('originalFileName', '').lower().endswith(f'.{ext}'):
                    return f
        return files[0]

    def _fetch_textures(
        self, 
        client: ModelibrApiClient, 
        texture_set_id: Optional[int]
    ) -> List[Dict[str, Any]]:
        if not texture_set_id:
            return []
        try:
            texture_set = client.get_texture_set(texture_set_id)
            return texture_set.get('textures', [])
        except ApiError:
            return []

    def _import_file(self, context: Context, file_path: str, ext: str) -> bool:
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
                    if obj.name in context.collection.objects:
                        obj.name = obj.name + ".imported"
                    context.collection.objects.link(obj)
        else:
            return False
        return True

    def _apply_textures(
        self, 
        new_objects: List[Object], 
        downloaded_textures: List[Dict[str, Any]], 
        temp_dir: str
    ) -> str:
        if not downloaded_textures:
            return ""
        try:
            from ..texture_utils import apply_textures_to_materials, calculate_material_textures_hash
            success = apply_textures_to_materials(new_objects, downloaded_textures, temp_dir)
            if success:
                for obj in new_objects:
                    if obj.material_slots:
                        texture_hash = calculate_material_textures_hash(obj)
                        if texture_hash:
                            return texture_hash
        except Exception as e:
            debug_log(f"Error applying textures: {e}")
        return ""

    def _store_metadata(self, new_objects: List[Object], texture_hash: str) -> None:
        if not self._model or not self._version or not self._file_to_import:
            return
        for obj in new_objects:
            store_object_metadata(
                obj,
                model_id=self.model_id,
                model_name=self._model.get('name', ''),
                version_id=self._version.get('id', 0),
                version_number=self._version.get('versionNumber', 1),
                file_id=self._file_to_import['id']
            )
            if self._texture_set_id:
                obj[METADATA_TEXTURE_SET_ID] = self._texture_set_id
                if texture_hash:
                    obj[METADATA_TEXTURE_HASH] = texture_hash


# List of classes to register
classes = [
    MODELIBR_OT_import_model,
    MODELIBR_OT_import_model_async,
]


def register() -> None:
    """Register import operators."""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    """Unregister import operators."""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


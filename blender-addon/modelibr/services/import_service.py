"""
Import service for the Modelibr Blender addon.
Provides business logic for importing models from the Modelibr server.
"""
import os
import tempfile
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

import bpy

from ..api_client import ModelibrApiClient
from ..exceptions import ApiError, ImportError
from ..config import IMPORT_FORMAT_PRIORITY, METADATA_TEXTURE_SET_ID, METADATA_TEXTURE_HASH
from ..tracking import store_object_metadata


@dataclass
class ImportResult:
    """Result of a model import operation."""
    success: bool
    model_id: int
    model_name: str
    version_id: int
    imported_objects: List[Any] = field(default_factory=list)
    texture_count: int = 0
    error_message: str = ""


class ImportService:
    """
    Service for importing models from Modelibr.
    
    This class encapsulates the business logic for model import,
    making it reusable and testable.
    """
    
    def __init__(self, api_client: ModelibrApiClient):
        """
        Initialize the import service.
        
        Args:
            api_client: Configured API client for server communication
        """
        self.client = api_client
    
    def import_model(
        self,
        model_id: int,
        version_id: Optional[int] = None,
        file_id: Optional[int] = None,
        context: Optional[Any] = None
    ) -> ImportResult:
        """
        Import a model from the Modelibr server.
        
        Args:
            model_id: ID of the model to import
            version_id: Optional specific version to import
            file_id: Optional specific file to import
            context: Blender context for scene access
        
        Returns:
            ImportResult with details of the import
        """
        try:
            # Fetch model data
            model = self.client.get_model(model_id)
            version = self._get_version(model_id, model, version_id)
            
            if version is None:
                return ImportResult(
                    success=False,
                    model_id=model_id,
                    model_name=model.get('name', ''),
                    version_id=0,
                    error_message="No versions available for this model"
                )
            
            # Find file to import
            file_to_import = self._find_import_file(version, file_id)
            if file_to_import is None:
                return ImportResult(
                    success=False,
                    model_id=model_id,
                    model_name=model.get('name', ''),
                    version_id=version.get('id', 0),
                    error_message="No files in this version"
                )
            
            # Get texture set info
            default_texture_set_id = version.get('defaultTextureSetId')
            textures = self._fetch_textures(default_texture_set_id)
            
            # Download and import
            with tempfile.TemporaryDirectory() as temp_dir:
                new_objects, downloaded_textures = self._download_and_import(
                    context, file_to_import, textures, temp_dir, model_id
                )
                
                if new_objects is None:
                    return ImportResult(
                        success=False,
                        model_id=model_id,
                        model_name=model.get('name', ''),
                        version_id=version.get('id', 0),
                        error_message="Failed to import file"
                    )
                
                # Apply textures and store metadata
                texture_hash = self._apply_textures(
                    new_objects, downloaded_textures, temp_dir, default_texture_set_id
                )
                self._store_metadata(
                    new_objects, model, version, file_to_import,
                    default_texture_set_id, texture_hash
                )
                
                return ImportResult(
                    success=True,
                    model_id=model_id,
                    model_name=model.get('name', ''),
                    version_id=version.get('id', 0),
                    imported_objects=new_objects,
                    texture_count=len(downloaded_textures)
                )
                
        except ApiError as e:
            return ImportResult(
                success=False,
                model_id=model_id,
                model_name="",
                version_id=0,
                error_message=str(e)
            )

    def _get_version(
        self, 
        model_id: int,
        model: Dict[str, Any],
        version_id: Optional[int]
    ) -> Optional[Dict[str, Any]]:
        """Get the version to import."""
        if version_id and version_id > 0:
            return self.client.get_model_version(model_id, version_id)
        
        versions = self.client.get_model_versions(model_id)
        if not versions:
            return None
        
        active_version_id = model.get('activeVersionId')
        return next(
            (v for v in versions if v['id'] == active_version_id),
            versions[-1]
        )

    def _find_import_file(
        self, 
        version: Dict[str, Any],
        file_id: Optional[int]
    ) -> Optional[Dict[str, Any]]:
        """Find the best file to import from the version."""
        files = version.get('files', [])
        if not files:
            return None

        if file_id and file_id > 0:
            file_match = next((f for f in files if f['id'] == file_id), None)
            if file_match:
                return file_match

        for ext in IMPORT_FORMAT_PRIORITY:
            for f in files:
                if f.get('originalFileName', '').lower().endswith(f'.{ext}'):
                    return f

        return files[0]

    def _fetch_textures(
        self, 
        texture_set_id: Optional[int]
    ) -> List[Dict[str, Any]]:
        """Fetch textures from texture set if available."""
        if not texture_set_id:
            return []
        
        try:
            texture_set = self.client.get_texture_set(texture_set_id)
            return texture_set.get('textures', [])
        except ApiError:
            return []

    def _download_and_import(
        self,
        context: Any,
        file_to_import: Dict[str, Any],
        textures: List[Dict[str, Any]],
        temp_dir: str,
        model_id: int
    ) -> tuple:
        """Download files and import into Blender."""
        filename = file_to_import.get('originalFileName', f"model_{model_id}")
        file_path = self.client.download_file(file_to_import['id'], temp_dir, filename)

        # Download textures
        downloaded_textures = []
        for tex in textures:
            tex_file_id = tex.get('fileId')
            tex_filename = tex.get('fileName', f"texture_{tex_file_id}")
            if tex_file_id:
                try:
                    self.client.download_file(tex_file_id, temp_dir, tex_filename)
                    downloaded_textures.append(tex)
                except ApiError:
                    pass

        # Track objects before import
        objects_before = set(context.scene.objects) if context else set()
        
        # Import based on file extension
        ext = os.path.splitext(filename)[1].lower()
        if not self._import_file(context, file_path, ext):
            return None, []
        
        # Get newly imported objects
        objects_after = set(context.scene.objects) if context else set()
        new_objects = list(objects_after - objects_before)
        
        return new_objects, downloaded_textures

    def _import_file(self, context: Any, file_path: str, ext: str) -> bool:
        """Import a file based on its extension."""
        try:
            if ext in ['.glb', '.gltf']:
                bpy.ops.import_scene.gltf(filepath=file_path)
            elif ext == '.fbx':
                bpy.ops.import_scene.fbx(filepath=file_path)
            elif ext == '.obj':
                bpy.ops.wm.obj_import(filepath=file_path)
            elif ext == '.blend':
                with bpy.data.libraries.load(file_path, link=False) as (data_from, data_to):
                    data_to.objects = data_from.objects
                if context:
                    for obj in data_to.objects:
                        if obj is not None:
                            if obj.name in context.collection.objects:
                                obj.name = obj.name + ".imported"
                            context.collection.objects.link(obj)
            else:
                return False
            return True
        except Exception:
            return False

    def _apply_textures(
        self, 
        new_objects: List[Any], 
        downloaded_textures: List[Dict[str, Any]], 
        temp_dir: str,
        texture_set_id: Optional[int] = None
    ) -> str:
        """Apply textures to imported objects and return texture hash."""
        if not downloaded_textures:
            return ""
        
        try:
            from ..texture_utils import apply_textures_to_materials, calculate_material_textures_hash
            success = apply_textures_to_materials(
                new_objects, downloaded_textures, temp_dir, texture_set_id
            )
            if success:
                for obj in new_objects:
                    if obj.material_slots:
                        texture_hash = calculate_material_textures_hash(obj)
                        if texture_hash:
                            return texture_hash
        except Exception:
            pass
        
        return ""

    def _store_metadata(
        self,
        new_objects: List[Any],
        model: Dict[str, Any],
        version: Dict[str, Any],
        file_to_import: Dict[str, Any],
        texture_set_id: Optional[int],
        texture_hash: str
    ) -> None:
        """Store Modelibr metadata on imported objects."""
        model_id = model.get('id', 0)
        
        for obj in new_objects:
            store_object_metadata(
                obj,
                model_id=model_id,
                model_name=model.get('name', ''),
                version_id=version.get('id', 0),
                version_number=version.get('versionNumber', 1),
                file_id=file_to_import['id']
            )
            if texture_set_id:
                obj[METADATA_TEXTURE_SET_ID] = texture_set_id
                if texture_hash:
                    obj[METADATA_TEXTURE_HASH] = texture_hash

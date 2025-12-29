"""
Upload service for the Modelibr Blender addon.
Provides business logic for uploading models to the Modelibr server.
"""
import os
import tempfile
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

import bpy

from ..api_client import ModelibrApiClient
from ..exceptions import ApiError, UploadError
from ..config import METADATA_TEXTURE_SET_ID, METADATA_TEXTURE_HASH
from ..tracking import update_hashes_after_upload, get_modelibr_objects


@dataclass
class UploadResult:
    """Result of a model upload operation."""
    success: bool
    model_id: int
    version_id: int
    texture_set_id: Optional[int] = None
    is_new_texture_set: bool = False
    error_message: str = ""


class UploadService:
    """
    Service for uploading models to Modelibr.
    
    This class encapsulates the business logic for model upload,
    making it reusable and testable.
    """
    
    def __init__(self, api_client: ModelibrApiClient):
        """
        Initialize the upload service.
        
        Args:
            api_client: Configured API client for server communication
        """
        self.client = api_client
    
    def export_scene(
        self,
        export_format: str,
        filepath: str,
        use_selection: bool = False
    ) -> bool:
        """
        Export the Blender scene to a file.
        
        Args:
            export_format: One of 'GLB', 'FBX', 'OBJ'
            filepath: Output file path
            use_selection: If True, export only selected objects
        
        Returns:
            True if export succeeded
        """
        try:
            if export_format == 'GLB':
                bpy.ops.export_scene.gltf(
                    filepath=filepath,
                    export_format='GLB',
                    use_selection=use_selection,
                )
            elif export_format == 'FBX':
                bpy.ops.export_scene.fbx(
                    filepath=filepath,
                    use_selection=use_selection,
                )
            elif export_format == 'OBJ':
                bpy.ops.wm.obj_export(
                    filepath=filepath,
                    export_selected_objects=use_selection,
                )
            else:
                return False
            return True
        except Exception:
            return False
    
    def save_blend_file(self, filepath: str) -> bool:
        """
        Save the current Blender file as a copy.
        
        Args:
            filepath: Destination path for the blend file
        
        Returns:
            True if save succeeded and file has content
        """
        try:
            result = bpy.ops.wm.save_as_mainfile(filepath=filepath, copy=True)
            return (
                'FINISHED' in result and 
                os.path.exists(filepath) and 
                os.path.getsize(filepath) > 0
            )
        except Exception:
            return False
    
    def create_texture_set(
        self,
        model_id: int,
        version_id: int,
        model_objects: List[Any],
        temp_dir: str,
        set_name: str
    ) -> Optional[int]:
        """
        Create a new texture set from model materials.
        
        Args:
            model_id: Model ID
            version_id: Version ID
            model_objects: List of Blender objects with materials
            temp_dir: Temporary directory for exported textures
            set_name: Name for the texture set
        
        Returns:
            Texture set ID if created, None otherwise
        """
        try:
            from ..texture_utils import export_textures, calculate_material_textures_hash
            
            exported_textures = export_textures(model_objects, temp_dir)
            if not exported_textures:
                return None
            
            # Create texture set with first texture
            first_tex = exported_textures[0]
            ts_result = self.client.create_texture_set_with_file(
                first_tex["filepath"],
                set_name,
                first_tex["texture_type"]
            )
            texture_set_id = ts_result.get("textureSetId", 0)
            
            if not texture_set_id:
                return None
            
            # Add remaining textures
            for tex in exported_textures[1:]:
                try:
                    file_result = self.client.add_file_to_version(
                        model_id, version_id, tex["filepath"]
                    )
                    file_id = file_result.get("id", 0)
                    if file_id > 0:
                        self.client.add_texture_to_set(
                            texture_set_id, file_id, tex["texture_type"]
                        )
                except ApiError:
                    pass
            
            # Associate and set as default
            self.client.associate_texture_set_with_version(texture_set_id, version_id)
            self.client.set_default_texture_set(model_id, texture_set_id, version_id)
            
            # Update metadata on objects
            new_hash = ""
            if model_objects:
                new_hash = calculate_material_textures_hash(model_objects[0])
            
            for obj in model_objects:
                obj[METADATA_TEXTURE_SET_ID] = texture_set_id
                if new_hash:
                    obj[METADATA_TEXTURE_HASH] = new_hash
            
            return texture_set_id
            
        except Exception:
            return None
    
    def link_texture_set(
        self,
        model_id: int,
        version_id: int,
        texture_set_id: int
    ) -> bool:
        """
        Link an existing texture set to a new version.
        
        Args:
            model_id: Model ID
            version_id: Version ID
            texture_set_id: Texture set ID to link
        
        Returns:
            True if linking succeeded
        """
        try:
            self.client.associate_texture_set_with_version(texture_set_id, version_id)
            self.client.set_default_texture_set(model_id, texture_set_id, version_id)
            return True
        except ApiError:
            return False
    
    def check_textures_modified(
        self,
        model_objects: List[Any]
    ) -> tuple:
        """
        Check if textures have been modified in model materials.
        
        Args:
            model_objects: List of Blender objects to check
        
        Returns:
            Tuple of (any_modified, original_texture_set_id)
        """
        try:
            from ..texture_utils import is_texture_modified, get_objects_texture_set_id
            
            any_modified = any(is_texture_modified(obj) for obj in model_objects)
            original_set_id = get_objects_texture_set_id(model_objects)
            
            return any_modified, original_set_id
        except Exception:
            return False, None
    
    def has_textures(self, model_objects: List[Any]) -> bool:
        """
        Check if model objects have textures in their materials.
        
        Args:
            model_objects: List of Blender objects to check
        
        Returns:
            True if any textures are found
        """
        try:
            from ..texture_utils import extract_textures_from_materials
            textures_info = extract_textures_from_materials(model_objects)
            return len(textures_info) > 0
        except Exception:
            return False

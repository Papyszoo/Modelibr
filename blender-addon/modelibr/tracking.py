"""
Tracking module for imported Modelibr assets.
Handles modification detection and object metadata management.
"""

import bpy
import hashlib
from typing import List, Optional, Dict, Any

from .config import (
    METADATA_MODEL_ID,
    METADATA_MODEL_NAME,
    METADATA_VERSION_ID,
    METADATA_VERSION_NUMBER,
    METADATA_FILE_ID,
    METADATA_ORIGINAL_HASH,
)


def calculate_object_hash(obj: bpy.types.Object) -> str:
    """
    Generate hash of object state to detect modifications.
    
    Args:
        obj: Blender object to hash
        
    Returns:
        MD5 hash string representing the object state
    """
    if not obj or not obj.data:
        return ""
    
    try:
        # Collect state information
        data_parts = []
        
        # Geometry data (if mesh)
        if hasattr(obj.data, 'vertices') and hasattr(obj.data, 'polygons'):
            data_parts.append(str(len(obj.data.vertices)))
            data_parts.append(str(len(obj.data.polygons)))
        
        # Transform matrix
        matrix_str = str(obj.matrix_world)
        data_parts.append(matrix_str)
        
        # Material slots
        data_parts.append(str(len(obj.material_slots)))
        
        # Combine all parts
        data_string = "|".join(data_parts)
        
        # Generate hash
        return hashlib.md5(data_string.encode()).hexdigest()
    except Exception:
        return ""


def is_modified(obj: bpy.types.Object) -> bool:
    """
    Check if object has been modified since import.
    
    Args:
        obj: Blender object to check
        
    Returns:
        True if object has been modified, False otherwise
    """
    if not obj:
        return False
    
    # Check if object has Modelibr metadata
    if "modelibr_model_id" not in obj:
        return False
    
    # Get original hash
    original_hash = obj.get("modelibr_original_hash", "")
    if not original_hash:
        # If no hash was stored, consider it unmodified
        return False
    
    # Calculate current hash
    current_hash = calculate_object_hash(obj)
    
    # Compare hashes
    return original_hash != current_hash


def get_modelibr_objects(scene: bpy.types.Scene) -> List[bpy.types.Object]:
    """
    Find all objects in scene that originated from Modelibr.
    
    Args:
        scene: Blender scene to search
        
    Returns:
        List of objects with Modelibr metadata
    """
    imported_objects = []
    
    for obj in scene.objects:
        if "modelibr_model_id" in obj:
            imported_objects.append(obj)
    
    return imported_objects


def get_modelibr_models(scene: bpy.types.Scene) -> List[dict]:
    """
    Get a list of unique imported models (not individual objects).
    Groups objects by model_id and returns one entry per model.
    
    Args:
        scene: Blender scene to search
        
    Returns:
        List of dicts with model info and representative object
    """
    models_dict = {}
    
    for obj in scene.objects:
        if "modelibr_model_id" in obj:
            model_id = obj.get("modelibr_model_id", 0)
            
            # Keep track of unique models
            if model_id not in models_dict:
                models_dict[model_id] = {
                    "model_id": model_id,
                    "model_name": obj.get("modelibr_model_name", ""),
                    "version_id": obj.get("modelibr_version_id", 0),
                    "version_number": obj.get("modelibr_version_number", 1),
                    "objects": [],
                    "is_modified": False,
                }
            
            # Add object to this model's list
            models_dict[model_id]["objects"].append(obj)
            
            # Check if any object in this model is modified
            if is_modified(obj):
                models_dict[model_id]["is_modified"] = True
    
    return list(models_dict.values())


def store_object_metadata(obj: bpy.types.Object, model_id: int, model_name: str, 
                         version_id: int, version_number: int, file_id: int) -> None:
    """
    Store Modelibr metadata on an imported object.
    
    Args:
        obj: Blender object to tag with metadata
        model_id: Model ID from Modelibr
        model_name: Model name from Modelibr
        version_id: Version ID from Modelibr
        version_number: Version number from Modelibr
        file_id: File ID from Modelibr
    """
    from datetime import datetime
    
    obj["modelibr_model_id"] = model_id
    obj["modelibr_model_name"] = model_name
    obj["modelibr_version_id"] = version_id
    obj["modelibr_version_number"] = version_number
    obj["modelibr_file_id"] = file_id
    obj["modelibr_imported_at"] = datetime.now().isoformat()
    obj["modelibr_original_hash"] = calculate_object_hash(obj)


def get_object_metadata(obj: bpy.types.Object) -> Optional[dict]:
    """
    Retrieve Modelibr metadata from an object.
    
    Args:
        obj: Blender object to retrieve metadata from
        
    Returns:
        Dictionary with metadata or None if object has no metadata
    """
    if not obj or "modelibr_model_id" not in obj:
        return None
    
    return {
        "model_id": obj.get("modelibr_model_id", 0),
        "model_name": obj.get("modelibr_model_name", ""),
        "version_id": obj.get("modelibr_version_id", 0),
        "version_number": obj.get("modelibr_version_number", 1),
        "file_id": obj.get("modelibr_file_id", 0),
        "imported_at": obj.get("modelibr_imported_at", ""),
        "is_modified": is_modified(obj),
    }


def update_hashes_after_upload(scene: bpy.types.Scene, model_id: int) -> None:
    """
    Update the original hashes for all objects belonging to a model after upload.
    This marks them as "unmodified" relative to the new version.
    
    Args:
        scene: Blender scene
        model_id: Model ID to update hashes for
    """
    for obj in scene.objects:
        if obj.get("modelibr_model_id") == model_id:
            # Recalculate and store the current hash as the new baseline
            obj["modelibr_original_hash"] = calculate_object_hash(obj)

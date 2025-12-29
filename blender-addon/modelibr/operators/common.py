"""
Common utilities shared across operator modules.
"""
import os
import tempfile
import datetime
from typing import Dict, Any, Tuple, Optional

import bpy

from ..api_client import ModelibrApiClient
from ..preferences import get_preferences
from ..config import DEBUG_LOG_FILENAME


def get_api_client() -> ModelibrApiClient:
    """Get an API client instance configured from addon preferences."""
    prefs = get_preferences()
    return ModelibrApiClient(prefs.server_url, prefs.api_key)


def sanitize_filename(name: str) -> str:
    """
    Sanitize a name for use as a filename.
    
    Args:
        name: Original name to sanitize
    
    Returns:
        Sanitized filename safe for all operating systems
    """
    return "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()


def debug_log(message: str) -> None:
    """
    Append debug messages to a file in the OS temp directory.
    
    Messages are logged even when Blender's console is not visible.
    
    Args:
        message: Debug message to log
    """
    try:
        log_path = os.path.join(tempfile.gettempdir(), DEBUG_LOG_FILENAME)
        timestamp = datetime.datetime.utcnow().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} {message}\n")
    except Exception:
        # Never raise from logging to avoid interfering with the operator
        pass


def extract_id(
    data: Dict[str, Any], 
    keys: Tuple[str, ...] = ('id', 'versionId', 'version_id', 'modelId', 'model_id')
) -> int:
    """
    Extract an integer ID from a response dict using multiple possible keys.
    
    Args:
        data: Dictionary to extract ID from
        keys: Tuple of possible key names to try
    
    Returns:
        Extracted ID or 0 if not found
    """
    if not isinstance(data, dict):
        return 0
    for key in keys:
        value = data.get(key)
        try:
            if value is None:
                continue
            int_value = int(value)
            if int_value > 0:
                return int_value
        except (ValueError, TypeError):
            continue
    return 0


def get_export_extension(export_format: str) -> str:
    """
    Get file extension for an export format.
    
    Args:
        export_format: One of 'GLB', 'FBX', 'OBJ'
    
    Returns:
        File extension including the dot (e.g., '.glb')
    """
    extensions = {
        'GLB': '.glb',
        'FBX': '.fbx',
        'OBJ': '.obj',
    }
    return extensions.get(export_format, '.glb')


def export_scene(
    export_format: str, 
    filepath: str, 
    use_selection: bool = False
) -> bool:
    """
    Export the scene or selection to a file.
    
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
    except Exception as e:
        debug_log(f"Export failed: {e}")
        return False

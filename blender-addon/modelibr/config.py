"""
Configuration constants for the Modelibr Blender addon.
Centralizes hardcoded values for maintainability.
"""
from typing import List, Tuple

# =============================================================================
# File Format Configuration
# =============================================================================

# Supported import formats in priority order (first match wins)
IMPORT_FORMAT_PRIORITY: List[str] = ['glb', 'gltf', 'fbx', 'obj', 'blend']

# Supported renderable file extensions
SUPPORTED_IMPORT_EXTENSIONS: List[str] = ['.glb', '.gltf', '.fbx', '.obj', '.blend']

# Export format enum items for Blender UI
EXPORT_FORMAT_ITEMS: List[Tuple[str, str, str]] = [
    ('GLB', "GLB", "GL Transmission Format Binary"),
    ('FBX', "FBX", "Autodesk FBX"),
    ('OBJ', "OBJ", "Wavefront OBJ"),
]

# Default export format
DEFAULT_EXPORT_FORMAT: str = 'GLB'


# =============================================================================
# API Configuration
# =============================================================================

# Default server URL
DEFAULT_SERVER_URL: str = "http://localhost:8080"

# Timeout for read operations (seconds)
API_READ_TIMEOUT: int = 10

# Timeout for upload operations (seconds)
API_UPLOAD_TIMEOUT: int = 300

# Timeout for file downloads (seconds)
API_DOWNLOAD_TIMEOUT: int = 120


# =============================================================================
# Texture Configuration
# =============================================================================

# Mapping from texture type names (from API) to Blender shader node inputs
TEXTURE_TYPE_TO_NODE_INPUT: dict = {
    "Albedo": "Base Color",
    "Normal": "Normal",
    "Roughness": "Roughness",
    "Metallic": "Metallic",
    "AmbientOcclusion": "AO",
    "Height": "Height",
    "Emissive": "Emission Color",
    "Opacity": "Alpha",
}

# Reverse mapping for node input to texture type
NODE_INPUT_TO_TEXTURE_TYPE: dict = {v: k for k, v in TEXTURE_TYPE_TO_NODE_INPUT.items()}

# Patterns in filenames that indicate texture type
TEXTURE_FILENAME_PATTERNS: dict = {
    "Albedo": ["albedo", "diffuse", "color", "basecolor", "base_color", "col", "diff"],
    "Normal": ["normal", "nrm", "nor", "norm", "normalgl", "normaldx"],
    "Roughness": ["roughness", "rough", "rgh"],
    "Metallic": ["metallic", "metal", "metalness", "met"],
    "AmbientOcclusion": ["ao", "ambient", "occlusion", "ambientocclusion"],
    "Height": ["height", "disp", "displacement", "bump"],
    "Emissive": ["emissive", "emission", "emit", "glow"],
    "Opacity": ["opacity", "alpha", "transparency", "mask"],
}


# =============================================================================
# Object Tracking Metadata Keys
# =============================================================================

# Custom property keys stored on Blender objects
METADATA_MODEL_ID: str = "modelibr_model_id"
METADATA_MODEL_NAME: str = "modelibr_model_name"
METADATA_VERSION_ID: str = "modelibr_version_id"
METADATA_VERSION_NUMBER: str = "modelibr_version_number"
METADATA_FILE_ID: str = "modelibr_file_id"
METADATA_ORIGINAL_HASH: str = "modelibr_original_hash"
METADATA_TEXTURE_SET_ID: str = "modelibr_texture_set_id"
METADATA_TEXTURE_HASH: str = "modelibr_texture_hash"


# =============================================================================
# UI Configuration
# =============================================================================

# Browse window configuration
BROWSE_WINDOW_WIDTH: int = 800
BROWSE_WINDOW_HEIGHT: int = 600
THUMBNAIL_SIZE: int = 128
MODELS_PER_PAGE: int = 20


# =============================================================================
# Debug Configuration
# =============================================================================

# Debug log filename (stored in temp directory)
DEBUG_LOG_FILENAME: str = "modelibr_debug.log"

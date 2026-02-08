"""
Texture utilities for handling textures in Blender materials.
Provides functions for extracting, applying, and exporting textures.
"""

import bpy
import os
import hashlib
import shutil
from typing import List, Dict, Optional, Tuple


# Mapping from texture type IDs (from API) to names
# Based on Domain.ValueObjects.TextureType enum
TEXTURE_TYPE_ID_TO_NAME = {
    1: "Albedo",
    2: "Normal",
    3: "Height",
    4: "AmbientOcclusion",  # AO in API
    5: "Roughness",
    6: "Metallic",
    7: "Albedo",  # Diffuse is treated as Albedo
    8: "Specular",
    9: "Emissive",
    10: "Normal",  # Bump is treated as Normal
    11: "Opacity",  # Alpha
    12: "Height",  # Displacement is treated as Height
}

# Source channel mapping (from API)
# Matches API: 0=RGB (full texture), 1=R, 2=G, 3=B, 4=A
SOURCE_CHANNEL_RGB = 0
SOURCE_CHANNEL_R = 1
SOURCE_CHANNEL_G = 2
SOURCE_CHANNEL_B = 3
SOURCE_CHANNEL_A = 4

CHANNEL_INDEX_TO_NAME = {
    SOURCE_CHANNEL_RGB: "RGB",
    SOURCE_CHANNEL_R: "R",
    SOURCE_CHANNEL_G: "G",
    SOURCE_CHANNEL_B: "B",
    SOURCE_CHANNEL_A: "A",
}

# Import shared texture constants from config (single source of truth)
from .config import (
    TEXTURE_TYPE_TO_NODE_INPUT,
    NODE_INPUT_TO_TEXTURE_TYPE,
    TEXTURE_FILENAME_PATTERNS as FILENAME_PATTERNS,
)


def detect_texture_type_from_filename(filepath: str) -> str:
    """
    Guess texture type from filename using common naming conventions.
    
    Args:
        filepath: Path to the texture file
    
    Returns:
        Texture type name (defaults to "Albedo" if unknown)
    """
    basename = os.path.basename(filepath).lower()
    name_without_ext = os.path.splitext(basename)[0]
    
    # Check each pattern
    for texture_type, patterns in FILENAME_PATTERNS.items():
        for pattern in patterns:
            if pattern in name_without_ext:
                return texture_type
    
    return "Albedo"  # Default to Albedo


def calculate_texture_hash(image: bpy.types.Image) -> str:
    """
    Calculate hash of a texture image for change detection.
    
    Args:
        image: Blender image to hash
    
    Returns:
        MD5 hash string, or empty string if failed
    """
    if not image:
        return ""
    
    try:
        # If image is packed, use packed data
        if image.packed_file:
            return hashlib.md5(image.packed_file.data).hexdigest()
        
        # If image is from file, hash the file path and modification time
        if image.filepath:
            abs_path = bpy.path.abspath(image.filepath)
            if os.path.exists(abs_path):
                stat = os.stat(abs_path)
                data = f"{abs_path}|{stat.st_size}|{stat.st_mtime}"
                return hashlib.md5(data.encode()).hexdigest()
        
        return ""
    except Exception:
        return ""


def calculate_material_textures_hash(obj: bpy.types.Object) -> str:
    """
    Calculate a combined hash of all textures used in an object's materials.
    
    Args:
        obj: Blender object
    
    Returns:
        MD5 hash of all texture hashes combined
    """
    if not obj or not obj.material_slots:
        return ""
    
    texture_hashes = []
    
    for slot in obj.material_slots:
        if not slot.material or not slot.material.use_nodes:
            continue
        
        for node in slot.material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                tex_hash = calculate_texture_hash(node.image)
                if tex_hash:
                    texture_hashes.append(tex_hash)
    
    if not texture_hashes:
        return ""
    
    texture_hashes.sort()  # Consistent ordering
    combined = "|".join(texture_hashes)
    return hashlib.md5(combined.encode()).hexdigest()


# Texture types that can be packed into ORM (Occlusion/Roughness/Metallic)
PACKABLE_TEXTURE_TYPES = {"AmbientOcclusion", "Roughness", "Metallic"}

# ORM channel mapping: R=AO, G=Roughness, B=Metallic
ORM_CHANNEL_MAPPING = {
    "AmbientOcclusion": 0,  # R channel
    "Roughness": 1,         # G channel
    "Metallic": 2,          # B channel
}


def pack_textures_to_orm(
    packable_textures: List[Dict],
    output_name: str = "packed_orm"
) -> Optional[bpy.types.Image]:
    """
    Pack separate AO, Roughness, and Metallic textures into a single ORM image.
    
    ORM format: R=AO, G=Roughness, B=Metallic, A=1.0
    
    Args:
        packable_textures: List of texture dicts with 'texture_type' and 'image' keys
        output_name: Name for the output packed image
    
    Returns:
        Packed ORM image, or None if packing failed
    """
    import numpy as np
    
    # Get textures by type
    textures_by_type = {}
    for tex in packable_textures:
        tex_type = tex.get("texture_type")
        image = tex.get("image")
        if tex_type and image and tex_type in ORM_CHANNEL_MAPPING:
            textures_by_type[tex_type] = image
    
    if not textures_by_type:
        print("[Modelibr] No packable textures found")
        return None
    
    # Determine output size from first texture
    first_image = list(textures_by_type.values())[0]
    width, height = first_image.size[0], first_image.size[1]
    
    print(f"[Modelibr] Packing {len(textures_by_type)} textures into ORM ({width}x{height})")
    
    # Create output array (RGBA)
    output = np.ones((height, width, 4), dtype=np.float32)
    
    # Fill each channel
    for tex_type, image in textures_by_type.items():
        channel_idx = ORM_CHANNEL_MAPPING[tex_type]
        
        # Resize if needed
        if image.size[0] != width or image.size[1] != height:
            print(f"[Modelibr] Warning: {tex_type} texture size mismatch, skipping")
            continue
        
        # Extract image data
        pixels = np.array(image.pixels[:], dtype=np.float32)
        pixels = pixels.reshape((height, width, 4))
        
        # Use R channel (or average for grayscale source)
        # For grayscale, R=G=B so just take R
        channel_data = pixels[:, :, 0]
        
        # Flip vertically (Blender stores bottom-up)
        channel_data = np.flipud(channel_data)
        output[:, :, channel_idx] = np.flipud(channel_data)  # Flip back for output
        
        print(f"[Modelibr] Packed {tex_type} into channel {channel_idx}")
    
    # Create new image
    packed_image = bpy.data.images.new(
        name=output_name,
        width=width,
        height=height,
        alpha=False
    )
    
    # Set pixels
    packed_image.pixels[:] = output.flatten().tolist()
    packed_image.pack()
    
    print(f"[Modelibr] Created packed ORM image: {packed_image.name}")
    return packed_image

def analyze_material_textures(objects: List[bpy.types.Object]) -> Dict:
    """
    Analyze shader connections to detect texture usage and packing opportunities.
    
    This function traces all Image Texture node connections through the shader graph
    to determine:
    - Direct connections (grayscale → Roughness, etc.)
    - Already packed textures (via Separate RGB → multiple inputs)
    - Packing opportunities (separate grayscale textures that could be combined)
    
    Args:
        objects: List of Blender objects to analyze
    
    Returns:
        Dict with:
        - "textures": List of texture info dicts
        - "packable": List of separate textures that could be packed into ORM
        - "packed": List of already-packed textures (via Separate RGB)
    """
    result = {
        "textures": [],      # All textures with connection info
        "packable": [],      # Separate grayscale that could be packed
        "packed": [],        # Already packed via Separate RGB
    }
    
    seen_images = set()
    packable_candidates = {}  # texture_type -> texture_info
    
    for obj in objects:
        if not obj.material_slots:
            continue
        
        for slot in obj.material_slots:
            if not slot.material or not slot.material.use_nodes:
                continue
            
            nodes = slot.material.node_tree.nodes
            links = slot.material.node_tree.links
            
            # Find Principled BSDF
            principled = None
            for node in nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    principled = node
                    break
            
            if not principled:
                continue
            
            # Analyze each Image Texture node
            for node in nodes:
                if node.type != 'TEX_IMAGE' or not node.image:
                    continue
                
                image = node.image
                if image.name in seen_images:
                    continue
                seen_images.add(image.name)
                
                # Track connections from this image
                image_connections = []  # List of {channel, texture_type, via_separate}
                
                for output in node.outputs:
                    for link in output.links:
                        to_node = link.to_node
                        to_socket = link.to_socket
                        
                        # Case 1: Direct connection to Principled BSDF
                        if to_node.type == 'BSDF_PRINCIPLED':
                            socket_name = to_socket.name
                            texture_type = NODE_INPUT_TO_TEXTURE_TYPE.get(socket_name, "Albedo")
                            image_connections.append({
                                "channel": "RGB",
                                "texture_type": texture_type,
                                "via_separate": False,
                            })
                        
                        # Case 2: Connection through Normal Map node
                        elif to_node.type == 'NORMAL_MAP':
                            image_connections.append({
                                "channel": "RGB",
                                "texture_type": "Normal",
                                "via_separate": False,
                            })
                        
                        # Case 3: Connection through MixRGB (for AO)
                        elif to_node.type == 'MIX_RGB':
                            # Check if MixRGB connects to Base Color
                            for mix_out in to_node.outputs:
                                for mix_link in mix_out.links:
                                    if (mix_link.to_node.type == 'BSDF_PRINCIPLED' and 
                                        mix_link.to_socket.name == 'Base Color'):
                                        image_connections.append({
                                            "channel": "RGB",
                                            "texture_type": "AmbientOcclusion",
                                            "via_separate": False,
                                        })
                        
                        # Case 4: Connection through Separate RGB/XYZ
                        elif to_node.type in ('SEPRGB', 'SEPARATE_COLOR', 'SEPXYZ'):
                            # Trace each channel output
                            channel_map = {'R': 'R', 'G': 'G', 'B': 'B', 
                                          'Red': 'R', 'Green': 'G', 'Blue': 'B',
                                          'X': 'R', 'Y': 'G', 'Z': 'B'}
                            
                            for sep_output in to_node.outputs:
                                channel = channel_map.get(sep_output.name)
                                if not channel:
                                    continue
                                
                                for sep_link in sep_output.links:
                                    if sep_link.to_node.type == 'BSDF_PRINCIPLED':
                                        socket_name = sep_link.to_socket.name
                                        texture_type = NODE_INPUT_TO_TEXTURE_TYPE.get(socket_name)
                                        if texture_type:
                                            image_connections.append({
                                                "channel": channel,
                                                "texture_type": texture_type,
                                                "via_separate": True,
                                            })
                                    # Check MixRGB for AO
                                    elif sep_link.to_node.type == 'MIX_RGB':
                                        for mix_out in sep_link.to_node.outputs:
                                            for mix_link in mix_out.links:
                                                if (mix_link.to_node.type == 'BSDF_PRINCIPLED' and 
                                                    mix_link.to_socket.name == 'Base Color'):
                                                    image_connections.append({
                                                        "channel": channel,
                                                        "texture_type": "AmbientOcclusion",
                                                        "via_separate": True,
                                                    })
                
                # Determine if this is a packed texture
                via_separate = [c for c in image_connections if c["via_separate"]]
                direct = [c for c in image_connections if not c["via_separate"]]
                
                # Get filepath
                filepath = ""
                if image.filepath:
                    filepath = bpy.path.abspath(image.filepath)
                
                texture_info = {
                    "image": image,
                    "image_name": image.name,
                    "filepath": filepath,
                    "connections": image_connections,
                    "file_id": image.get("modelibr_file_id"),
                }
                
                if len(via_separate) >= 2:
                    # This is an already-packed texture
                    channel_map = {c["channel"]: c["texture_type"] for c in via_separate}
                    texture_info["channels"] = channel_map
                    result["packed"].append(texture_info)
                elif len(direct) == 1:
                    texture_type = direct[0]["texture_type"]
                    texture_info["texture_type"] = texture_type
                    texture_info["source_channel"] = SOURCE_CHANNEL_RGB
                    result["textures"].append(texture_info)
                    
                    # Track as packable candidate if it's a grayscale type
                    if texture_type in PACKABLE_TEXTURE_TYPES:
                        packable_candidates[texture_type] = texture_info
                elif image_connections:
                    # Fallback: use first connection
                    texture_info["texture_type"] = image_connections[0]["texture_type"]
                    texture_info["source_channel"] = SOURCE_CHANNEL_RGB
                    result["textures"].append(texture_info)
    
    # Determine if packing is possible (2+ separate grayscale textures)
    if len(packable_candidates) >= 2:
        result["packable"] = list(packable_candidates.values())
    
    return result


def classify_textures_for_export(analysis: Dict, original_texture_types: set = None) -> Dict:
    """
    Classify textures for export based on modification status.
    
    Compares current textures against Modelibr file IDs and hashes to determine:
    - unchanged: Has file_id and hash matches → can reference by ID
    - modified: Has file_id but hash changed → must re-upload
    - new: No file_id → must upload
    - removed: Types in original but not in current → exclude from new set
    
    Args:
        analysis: Result from analyze_material_textures()
        original_texture_types: Set of texture types from original Modelibr texture set
    
    Returns:
        Dict with:
        - "unchanged": List of textures with file_id that can be referenced
        - "modified": List of textures with file_id that need re-upload
        - "new": List of textures without file_id that need upload
        - "removed": Set of texture types that were removed
        - "any_from_modelibr": True if any texture has file_id
        - "any_changed": True if any texture modified/added/removed
    """
    result = {
        "unchanged": [],
        "modified": [],
        "new": [],
        "removed": set(),
        "any_from_modelibr": False,
        "any_changed": False,
    }
    
    current_types = set()
    
    # Process regular textures
    for tex in analysis.get("textures", []):
        image = tex.get("image")
        file_id = tex.get("file_id")
        texture_type = tex.get("texture_type")
        
        if texture_type:
            current_types.add(texture_type)
        
        if file_id:
            result["any_from_modelibr"] = True
            
            # Check if modified by comparing hash
            original_hash = image.get("modelibr_original_hash", "") if image else ""
            current_hash = calculate_texture_hash(image) if image else ""
            
            if original_hash and current_hash and original_hash == current_hash:
                # Unchanged - can reference by file_id
                result["unchanged"].append(tex)
            else:
                # Modified - need to re-upload
                result["modified"].append(tex)
                result["any_changed"] = True
        else:
            # New texture - need to upload
            result["new"].append(tex)
            result["any_changed"] = True
    
    # Process packed textures (treated as single unit)
    for tex in analysis.get("packed", []):
        file_id = tex.get("file_id")
        image = tex.get("image")
        
        # Add all channel types to current_types
        for texture_type in tex.get("channels", {}).values():
            current_types.add(texture_type)
        
        if file_id:
            result["any_from_modelibr"] = True
            original_hash = image.get("modelibr_original_hash", "") if image else ""
            current_hash = calculate_texture_hash(image) if image else ""
            
            if original_hash and current_hash and original_hash == current_hash:
                result["unchanged"].append(tex)
            else:
                result["modified"].append(tex)
                result["any_changed"] = True
        else:
            result["new"].append(tex)
            result["any_changed"] = True
    
    # Determine removed types
    if original_texture_types:
        result["removed"] = original_texture_types - current_types
        if result["removed"]:
            result["any_changed"] = True
    
    return result


def extract_textures_from_materials(objects: List[bpy.types.Object]) -> List[Dict]:
    """
    Get all unique textures from the materials of given objects.
    
    Args:
        objects: List of Blender objects
    
    Returns:
        List of dicts with: filepath, image_name, texture_type, image (bpy.types.Image)
    """
    textures = []
    seen_images = set()
    
    for obj in objects:
        if not obj.material_slots:
            continue
        
        for slot in obj.material_slots:
            if not slot.material or not slot.material.use_nodes:
                continue
            
            # Find the Principled BSDF node
            principled = None
            for node in slot.material.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    principled = node
                    break
            
            for node in slot.material.node_tree.nodes:
                if node.type != 'TEX_IMAGE' or not node.image:
                    continue
                
                image = node.image
                if image.name in seen_images:
                    continue
                seen_images.add(image.name)
                
                # Determine texture type from node connections
                texture_type = "Albedo"
                
                # Check what the image texture is connected to
                for output in node.outputs:
                    for link in output.links:
                        to_node = link.to_node
                        to_socket = link.to_socket
                        
                        # Direct connection to Principled BSDF
                        if to_node.type == 'BSDF_PRINCIPLED':
                            socket_name = to_socket.name
                            texture_type = NODE_INPUT_TO_TEXTURE_TYPE.get(socket_name, "Albedo")
                            break
                        
                        # Connection through Normal Map node
                        elif to_node.type == 'NORMAL_MAP':
                            texture_type = "Normal"
                            break
                
                # Fallback: try to detect from filename
                if texture_type == "Albedo" and image.filepath:
                    detected = detect_texture_type_from_filename(image.filepath)
                    if detected != "Albedo":
                        texture_type = detected
                
                # Get filepath
                filepath = ""
                if image.filepath:
                    filepath = bpy.path.abspath(image.filepath)
                
                textures.append({
                    "filepath": filepath,
                    "image_name": image.name,
                    "texture_type": texture_type,
                    "image": image,
                })
    
    return textures


def flip_image_vertical(filepath: str) -> bool:
    """
    Flip an image file vertically to convert between Blender and web UV conventions.
    
    Blender uses V=0 at bottom, web/Three.js uses Y=0 at top.
    Flipping the image allows textures to work correctly in both environments.
    
    Args:
        filepath: Path to the image file to flip
        
    Returns:
        True if flip succeeded
    """
    try:
        import numpy as np
        from PIL import Image
        
        # Open image with PIL
        img = Image.open(filepath)
        # Flip vertically
        flipped = img.transpose(Image.FLIP_TOP_BOTTOM)
        # Save back
        flipped.save(filepath)
        return True
    except ImportError:
        # PIL not available, try using Blender's internal image flip
        try:
            # Load image in Blender and flip using numpy
            img = bpy.data.images.load(filepath, check_existing=False)
            if img.pixels:
                import numpy as np
                
                # Get pixels as numpy array
                pixels = np.array(img.pixels[:])
                width = img.size[0]
                height = img.size[1]
                channels = 4  # RGBA
                
                # Reshape to (height, width, channels)
                pixels = pixels.reshape((height, width, channels))
                
                # Flip vertically
                pixels = np.flipud(pixels)
                
                # Flatten and set back
                img.pixels[:] = pixels.flatten()
                img.save()
            
            # Clean up
            bpy.data.images.remove(img)
            return True
        except Exception as e:
            print(f"[Modelibr] Failed to flip image {filepath}: {e}")
            return False
    except Exception as e:
        print(f"[Modelibr] Failed to flip image {filepath}: {e}")
        return False


def extract_channel_from_image(source_image: bpy.types.Image, 
                                channel_index: int,
                                extracted_name: str) -> Optional[bpy.types.Image]:
    """
    Extract a single channel from an image and create a new grayscale image.
    
    This is used for channel-packed textures like ORM where:
    - R channel = Ambient Occlusion
    - G channel = Roughness
    - B channel = Metallic
    
    Args:
        source_image: The source Blender image to extract from
        channel_index: Which channel to extract (1=R, 2=G, 3=B, 4=A)
        extracted_name: Name for the new extracted image
    
    Returns:
        New Blender image with the extracted channel as grayscale, or None if failed
    """
    if not source_image:
        return None
    
    # Convert API channel index to numpy array index
    # API: 1=R, 2=G, 3=B, 4=A -> numpy RGBA: 0=R, 1=G, 2=B, 3=A
    if channel_index < 1 or channel_index > 4:
        print(f"[Modelibr] Invalid channel index {channel_index}, must be 1-4")
        return None
    
    numpy_channel_idx = channel_index - 1  # Convert to 0-indexed
    channel_names = {1: "R", 2: "G", 3: "B", 4: "A"}
    
    try:
        import numpy as np
        
        width = source_image.size[0]
        height = source_image.size[1]
        
        if width == 0 or height == 0:
            print(f"[Modelibr] Invalid image size: {width}x{height}")
            return None
        
        # Get pixels as numpy array (RGBA, flattened)
        pixels = np.array(source_image.pixels[:])
        
        # Reshape to (height * width, 4) for RGBA
        pixels = pixels.reshape(-1, 4)
        
        # Extract the specific channel
        channel_data = pixels[:, numpy_channel_idx]
        
        # Create grayscale image (RGB same value, A=1.0)
        gray_pixels = np.zeros((len(channel_data), 4), dtype=np.float32)
        gray_pixels[:, 0] = channel_data  # R
        gray_pixels[:, 1] = channel_data  # G
        gray_pixels[:, 2] = channel_data  # B
        gray_pixels[:, 3] = 1.0           # A
        
        # Check if image already exists
        if extracted_name in bpy.data.images:
            existing = bpy.data.images[extracted_name]
            bpy.data.images.remove(existing)
        
        # Create new Blender image
        extracted_image = bpy.data.images.new(
            name=extracted_name,
            width=width,
            height=height,
            alpha=False,
            float_buffer=False
        )
        
        # Set the pixels
        extracted_image.pixels[:] = gray_pixels.flatten()
        
        # Pack into .blend file so it persists
        extracted_image.pack()
        
        print(f"[Modelibr] Extracted channel {channel_names[channel_index]} from "
              f"'{source_image.name}' -> '{extracted_name}'")
        
        return extracted_image
        
    except ImportError:
        print("[Modelibr] numpy not available for channel extraction")
        return None
    except Exception as e:
        print(f"[Modelibr] Failed to extract channel: {e}")
        return None


def export_textures(objects: List[bpy.types.Object], temp_dir: str) -> List[Dict]:
    """
    Export all textures from objects' materials to a temporary directory.
    Textures are flipped vertically for web compatibility (Blender V=0 at bottom -> Web Y=0 at top).
    
    Args:
        objects: List of Blender objects
        temp_dir: Directory to export textures to
    
    Returns:
        List of dicts with: filepath (exported), texture_type, original_name
    """
    textures = extract_textures_from_materials(objects)
    exported = []
    
    for tex_info in textures:
        image = tex_info["image"]
        texture_type = tex_info["texture_type"]
        
        # Determine export path
        # Use original filename if available, otherwise generate one
        if image.filepath:
            basename = os.path.basename(bpy.path.abspath(image.filepath))
        else:
            basename = f"{image.name}.png"
        
        # Ensure unique filename
        export_path = os.path.join(temp_dir, basename)
        counter = 1
        while os.path.exists(export_path):
            name, ext = os.path.splitext(basename)
            export_path = os.path.join(temp_dir, f"{name}_{counter}{ext}")
            counter += 1
        
        try:
            # If image is from a file and exists, copy it
            if image.filepath:
                abs_path = bpy.path.abspath(image.filepath)
                if os.path.exists(abs_path):
                    shutil.copy2(abs_path, export_path)
                    # Flip for web compatibility
                    flip_image_vertical(export_path)
                    exported.append({
                        "filepath": export_path,
                        "texture_type": texture_type,
                        "original_name": basename,
                    })
                    continue
            
            # Otherwise, save from Blender's image data
            # Need to save it temporarily
            original_filepath = image.filepath
            image.filepath_raw = export_path
            image.save()
            image.filepath_raw = original_filepath
            
            # Flip for web compatibility
            flip_image_vertical(export_path)
            
            exported.append({
                "filepath": export_path,
                "texture_type": texture_type,
                "original_name": basename,
            })
        except Exception as e:
            print(f"[Modelibr] Failed to export texture {image.name}: {e}")
            continue
    
    return exported


def apply_textures_to_materials(objects: List[bpy.types.Object], 
                                 textures: List[Dict], 
                                 temp_dir: str,
                                 texture_set_id: Optional[int] = None) -> bool:
    """
    Apply downloaded textures to objects' materials.
    
    If texture_set_id is provided, images will be named with the texture set ID
    prefix (e.g., 'modelibr_ts5_albedo.png') and reused if already loaded.
    This allows multiple models sharing the same texture set to use the same
    image datablocks, showing user count in Blender's UI.
    
    Args:
        objects: List of Blender objects to apply textures to
        textures: List of texture info dicts from API (fileId, fileName, textureType)
        temp_dir: Directory where texture files were downloaded
        texture_set_id: Optional texture set ID for naming and reuse
    
    Returns:
        True if textures were applied successfully
    """
    if not textures:
        return False
    
    # Load all textures into Blender
    loaded_images = {}  # texture_type_name -> bpy.types.Image
    for tex in textures:
        texture_type_raw = tex.get("textureType", "Albedo")
        filename = tex.get("fileName", "")
        source_channel = tex.get("sourceChannel", SOURCE_CHANNEL_RGB)
        file_id = tex.get("fileId")  # For tracking during export
        
        # Convert texture type ID (int) to name (str)
        if isinstance(texture_type_raw, int):
            texture_type = TEXTURE_TYPE_ID_TO_NAME.get(texture_type_raw, "Albedo")
        else:
            texture_type = texture_type_raw
        
        channel_name = CHANNEL_INDEX_TO_NAME.get(source_channel, "RGB")
        print(f"[Modelibr] Loading texture: {filename} as type={texture_type} "
              f"(raw={texture_type_raw}, channel={channel_name})")
        
        if not filename:
            continue
        
        # Create a unique, identifiable image name based on texture set ID
        # Include channel info in name for extracted channels
        if source_channel != SOURCE_CHANNEL_RGB:
            channel_suffix = f"_{channel_name}"
        else:
            channel_suffix = ""
            
        if texture_set_id:
            image_name = f"modelibr_ts{texture_set_id}_{filename}{channel_suffix}"
        else:
            image_name = f"modelibr_{filename}{channel_suffix}"
        
        # Check if this image already exists in Blender (reuse for shared texture sets)
        if image_name in bpy.data.images:
            image = bpy.data.images[image_name]
            print(f"[Modelibr] Reusing existing image: {image_name} (users: {image.users})")
            loaded_images[texture_type] = image
            continue
        
        # Image doesn't exist, need to load it from file
        filepath = os.path.join(temp_dir, filename)
        if not os.path.exists(filepath):
            print(f"[Modelibr] Texture file not found at: {filepath}")
            continue
        
        try:
            # Flip texture from web convention (Y=0 at top) to Blender convention (V=0 at bottom)
            flip_image_vertical(filepath)
            
            image = bpy.data.images.load(filepath, check_existing=False)
            # Rename to base name (without channel suffix) for source image
            base_name = f"modelibr_ts{texture_set_id}_{filename}" if texture_set_id else f"modelibr_{filename}"
            image.name = base_name
            # Pack the image into .blend file so it persists after temp dir cleanup
            image.pack()
            
            # Store Modelibr metadata for export tracking
            if file_id:
                image["modelibr_file_id"] = file_id
            image["modelibr_source_channel"] = source_channel
            # Store original hash for modification detection
            original_hash = calculate_texture_hash(image)
            if original_hash:
                image["modelibr_original_hash"] = original_hash
            
            # If source channel is not RGB, extract the specific channel
            if source_channel != SOURCE_CHANNEL_RGB:
                extracted = extract_channel_from_image(image, source_channel, image_name)
                if extracted:
                    # Copy metadata to extracted image (inherits from source file)
                    if file_id:
                        extracted["modelibr_file_id"] = file_id
                    extracted["modelibr_source_channel"] = source_channel
                    extracted_hash = calculate_texture_hash(extracted)
                    if extracted_hash:
                        extracted["modelibr_original_hash"] = extracted_hash
                    loaded_images[texture_type] = extracted
                    print(f"[Modelibr] Extracted {channel_name} channel for {texture_type}")
                else:
                    # Fallback to original if extraction fails
                    loaded_images[texture_type] = image
                    print(f"[Modelibr] Channel extraction failed, using original RGB")
            else:
                loaded_images[texture_type] = image
                print(f"[Modelibr] Loaded, flipped, and packed texture as: {image_name}")
        except Exception as e:
            print(f"[Modelibr] Failed to load texture {filepath}: {e}")
            continue
    
    if not loaded_images:
        print(f"[Modelibr] No images were loaded, skipping texture application")
        return False
    
    print(f"[Modelibr] Applying {len(loaded_images)} textures to {len(objects)} objects")
    
    # Apply textures to materials
    for obj in objects:
        if not obj.material_slots:
            print(f"[Modelibr]   Object '{obj.name}' has no material slots")
            continue
        
        print(f"[Modelibr]   Object '{obj.name}' has {len(obj.material_slots)} material slots")
        
        for slot in obj.material_slots:
            if not slot.material:
                print(f"[Modelibr]     Slot has no material")
                continue
            
            mat = slot.material
            print(f"[Modelibr]     Processing material: {mat.name}")
            
            # Ensure material uses nodes
            if not mat.use_nodes:
                mat.use_nodes = True
            
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            
            # Find Principled BSDF
            principled = None
            for node in nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    principled = node
                    break
            
            if not principled:
                print(f"[Modelibr]     No Principled BSDF found in material, available nodes: {[n.type for n in nodes]}")
                continue
            
            # Remove existing texture nodes (e.g., blank embedded textures from FBX)
            # This ensures clean texture application from Modelibr texture sets
            nodes_to_remove = []
            for node in nodes:
                if node.type == 'TEX_IMAGE':
                    nodes_to_remove.append(node)
                    print(f"[Modelibr]       Removing existing texture node: {node.name}")
                elif node.type == 'NORMAL_MAP':
                    # Also remove normal map nodes that were connected to embedded textures
                    nodes_to_remove.append(node)
                    print(f"[Modelibr]       Removing existing normal map node: {node.name}")
            
            for node in nodes_to_remove:
                nodes.remove(node)
            
            if nodes_to_remove:
                print(f"[Modelibr]     Removed {len(nodes_to_remove)} existing texture/normal nodes")
            
            print(f"[Modelibr]     Found Principled BSDF, applying textures...")
            
            # Apply each texture type
            for texture_type, image in loaded_images.items():
                input_name = TEXTURE_TYPE_TO_NODE_INPUT.get(texture_type)
                if not input_name:
                    print(f"[Modelibr]       No input mapping for texture type: {texture_type}")
                    continue
                # Skip input check for AO - handled specially with Multiply node (Blender 4.0+ removed AO input)
                if texture_type != "AmbientOcclusion" and input_name not in principled.inputs:
                    print(f"[Modelibr]       Input '{input_name}' not found in Principled BSDF")
                    continue
                
                print(f"[Modelibr]       Connecting {texture_type} -> {input_name}")
                
                # Create image texture node
                tex_node = nodes.new('ShaderNodeTexImage')
                tex_node.image = image
                tex_node.location = (principled.location.x - 300, 
                                     principled.location.y - len(nodes) * 50)
                
                # Handle AO specially - Blender 4.0+ removed AO input from Principled BSDF
                # We need to multiply AO with Base Color using a MixRGB node
                if texture_type == "AmbientOcclusion":
                    image.colorspace_settings.name = 'Non-Color'
                    
                    # Create a MixRGB node in Multiply mode
                    mix_node = nodes.new('ShaderNodeMixRGB')
                    mix_node.blend_type = 'MULTIPLY'
                    mix_node.inputs['Fac'].default_value = 1.0
                    mix_node.location = (principled.location.x - 150, 
                                         tex_node.location.y)
                    
                    # Check if there's already something connected to Base Color
                    base_color_input = principled.inputs.get('Base Color')
                    if base_color_input and base_color_input.links:
                        # Get the existing connection
                        existing_link = base_color_input.links[0]
                        existing_output = existing_link.from_socket
                        # Reconnect: existing -> Color1, AO -> Color2, Mix -> Base Color
                        links.remove(existing_link)
                        links.new(existing_output, mix_node.inputs['Color1'])
                    else:
                        # No albedo connected, use white as base
                        mix_node.inputs['Color1'].default_value = (1.0, 1.0, 1.0, 1.0)
                    
                    links.new(tex_node.outputs['Color'], mix_node.inputs['Color2'])
                    links.new(mix_node.outputs['Color'], principled.inputs['Base Color'])
                    print(f"[Modelibr]       AO connected via Multiply node to Base Color")
                
                # Handle Normal maps specially
                elif texture_type == "Normal":
                    image.colorspace_settings.name = 'Non-Color'
                    
                    # Create Normal Map node
                    normal_map = nodes.new('ShaderNodeNormalMap')
                    normal_map.location = (principled.location.x - 150, 
                                           tex_node.location.y)
                    
                    links.new(tex_node.outputs['Color'], normal_map.inputs['Color'])
                    links.new(normal_map.outputs['Normal'], principled.inputs['Normal'])
                
                elif texture_type in ["Roughness", "Metallic", "AmbientOcclusion", "Height"]:
                    image.colorspace_settings.name = 'Non-Color'
                    links.new(tex_node.outputs['Color'], principled.inputs[input_name])
                
                else:
                    links.new(tex_node.outputs['Color'], principled.inputs[input_name])
                
                print(f"[Modelibr]       Successfully connected texture node!")
    
    # Clean up orphan images that were created from FBX embedded textures
    # These are images with 0 users that aren't Modelibr textures
    orphan_images = []
    for img in bpy.data.images:
        # Skip our Modelibr images (they have the modelibr_ prefix)
        if img.name.startswith('modelibr_'):
            continue
        # Skip built-in images
        if img.name in ['Render Result', 'Viewer Node']:
            continue
        # Check if image has no users (orphan)
        if img.users == 0:
            orphan_images.append(img)
            print(f"[Modelibr] Found orphan image to remove: {img.name}")
    
    for img in orphan_images:
        bpy.data.images.remove(img)
    
    if orphan_images:
        print(f"[Modelibr] Cleaned up {len(orphan_images)} orphan images from FBX import")
    
    return True


def get_objects_texture_set_id(objects: List[bpy.types.Object]) -> Optional[int]:
    """
    Get the texture set ID stored on objects (if any).
    
    Args:
        objects: List of Blender objects
    
    Returns:
        Texture set ID or None
    """
    for obj in objects:
        if "modelibr_texture_set_id" in obj:
            return obj.get("modelibr_texture_set_id")
    return None


def store_texture_metadata(obj: bpy.types.Object, texture_set_id: int, 
                           texture_hash: str) -> None:
    """
    Store texture metadata on an object.
    
    Args:
        obj: Blender object
        texture_set_id: ID of the texture set
        texture_hash: Hash of the textures for change detection
    """
    obj["modelibr_texture_set_id"] = texture_set_id
    obj["modelibr_texture_hash"] = texture_hash


def is_texture_modified(obj: bpy.types.Object) -> bool:
    """
    Check if object's textures have been modified since import.
    
    Args:
        obj: Blender object
    
    Returns:
        True if textures have changed
    """
    if "modelibr_texture_hash" not in obj:
        return False
    
    original_hash = obj.get("modelibr_texture_hash", "")
    current_hash = calculate_material_textures_hash(obj)
    
    return original_hash != current_hash

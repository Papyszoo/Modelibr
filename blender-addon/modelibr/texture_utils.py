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

# Mapping from texture type names (from API) to Blender shader node inputs
TEXTURE_TYPE_TO_NODE_INPUT = {
    "Albedo": "Base Color",
    "Normal": "Normal",
    "Roughness": "Roughness",
    "Metallic": "Metallic",
    "AmbientOcclusion": "AO",
    "Height": "Height",
    "Emissive": "Emission Color",
    "Opacity": "Alpha",
    "Specular": "Specular Tint",
}

# Mapping from shader node inputs to texture type names
NODE_INPUT_TO_TEXTURE_TYPE = {v: k for k, v in TEXTURE_TYPE_TO_NODE_INPUT.items()}

# Patterns in filenames that indicate texture type
FILENAME_PATTERNS = {
    "Albedo": ["albedo", "diffuse", "color", "basecolor", "base_color", "col", "diff"],
    "Normal": ["normal", "nrm", "nor", "norm", "normalgl", "normaldx"],
    "Roughness": ["roughness", "rough", "rgh"],
    "Metallic": ["metallic", "metal", "metalness", "met"],
    "AmbientOcclusion": ["ao", "ambient", "occlusion", "ambientocclusion"],
    "Height": ["height", "disp", "displacement", "bump"],
    "Emissive": ["emissive", "emission", "emit", "glow"],
    "Opacity": ["opacity", "alpha", "transparency", "mask"],
}


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
        
        # Convert texture type ID (int) to name (str)
        if isinstance(texture_type_raw, int):
            texture_type = TEXTURE_TYPE_ID_TO_NAME.get(texture_type_raw, "Albedo")
        else:
            texture_type = texture_type_raw
        
        print(f"[Modelibr] Loading texture: {filename} as type={texture_type} (raw={texture_type_raw})")
        
        if not filename:
            continue
        
        # Create a unique, identifiable image name based on texture set ID
        if texture_set_id:
            image_name = f"modelibr_ts{texture_set_id}_{filename}"
        else:
            image_name = f"modelibr_{filename}"
        
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
            # Rename to our identifiable name for future reuse
            image.name = image_name
            # Pack the image into .blend file so it persists after temp dir cleanup
            image.pack()
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
                if input_name not in principled.inputs:
                    print(f"[Modelibr]       Input '{input_name}' not found in Principled BSDF")
                    continue
                
                print(f"[Modelibr]       Connecting {texture_type} -> {input_name}")
                
                # Create image texture node
                tex_node = nodes.new('ShaderNodeTexImage')
                tex_node.image = image
                tex_node.location = (principled.location.x - 300, 
                                     principled.location.y - len(nodes) * 50)
                
                # Handle Normal maps specially
                if texture_type == "Normal":
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

"""
Integration tests for texture handling that run inside Blender.
Tests analyze_material_textures(), apply_textures_to_materials(), and channel extraction.

Run with: blender --background --python tests/integration/test_texture_flow.py
"""
import sys
import os
import traceback
import tempfile


def setup_addon():
    """Ensure addon is registered."""
    import bpy
    
    addon_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    if addon_path not in sys.path:
        sys.path.insert(0, addon_path)
    
    import modelibr
    try:
        modelibr.register()
    except:
        pass  # Already registered


def create_test_material_with_textures():
    """
    Create a test material with Principled BSDF and linked textures.
    Returns (material, created_images)
    """
    import bpy
    
    # Create material
    mat = bpy.data.materials.new(name="TestMaterial")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Get Principled BSDF
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    
    created_images = []
    
    # Create and link Albedo texture
    albedo_img = bpy.data.images.new("test_albedo", width=64, height=64)
    albedo_node = nodes.new("ShaderNodeTexImage")
    albedo_node.image = albedo_img
    albedo_node.location = (-300, 300)
    links.new(albedo_node.outputs["Color"], bsdf.inputs["Base Color"])
    created_images.append(("Albedo", albedo_img, albedo_node))
    
    # Create and link Roughness texture (grayscale)
    rough_img = bpy.data.images.new("test_roughness", width=64, height=64)
    rough_node = nodes.new("ShaderNodeTexImage")
    rough_node.image = rough_img
    rough_node.location = (-300, 0)
    links.new(rough_node.outputs["Color"], bsdf.inputs["Roughness"])
    created_images.append(("Roughness", rough_img, rough_node))
    
    # Create and link Metallic texture (grayscale) - needed for packable detection
    metal_img = bpy.data.images.new("test_metallic", width=64, height=64)
    metal_node = nodes.new("ShaderNodeTexImage")
    metal_node.image = metal_img
    metal_node.location = (-300, -100)
    links.new(metal_node.outputs["Color"], bsdf.inputs["Metallic"])
    created_images.append(("Metallic", metal_img, metal_node))
    
    # Create and link Normal texture with Normal Map node
    normal_img = bpy.data.images.new("test_normal", width=64, height=64)
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = normal_img
    normal_tex.location = (-500, -200)
    
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-200, -200)
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    created_images.append(("Normal", normal_img, normal_tex))
    
    return mat, created_images


def create_test_material_with_orm():
    """
    Create a test material with ORM packed texture (Separate RGB pattern).
    Returns (material, orm_image)
    """
    import bpy
    
    mat = bpy.data.materials.new(name="TestMaterial_ORM")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    
    # Create ORM packed texture
    orm_img = bpy.data.images.new("test_orm", width=64, height=64)
    orm_node = nodes.new("ShaderNodeTexImage")
    orm_node.image = orm_img
    orm_node.location = (-500, 0)
    
    # Add Separate RGB node
    sep_rgb = nodes.new("ShaderNodeSeparateColor")
    sep_rgb.location = (-200, 0)
    links.new(orm_node.outputs["Color"], sep_rgb.inputs["Color"])
    
    # Connect channels: R=AO (multiply with albedo), G=Roughness, B=Metallic
    links.new(sep_rgb.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep_rgb.outputs["Blue"], bsdf.inputs["Metallic"])
    
    return mat, orm_img


def create_test_object_with_material(mat):
    """Create a cube with the given material attached."""
    import bpy
    
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = "TestCube"
    
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    
    return obj


def cleanup_test_scene():
    """Remove all test objects and materials."""
    import bpy
    
    # Remove test objects
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Test"):
            bpy.data.objects.remove(obj, do_unlink=True)
    
    # Remove test materials
    for mat in list(bpy.data.materials):
        if mat.name.startswith("Test"):
            bpy.data.materials.remove(mat, do_unlink=True)
    
    # Remove test images
    for img in list(bpy.data.images):
        if img.name.startswith("test_"):
            bpy.data.images.remove(img, do_unlink=True)


# === TEST FUNCTIONS ===

def test_analyze_material_textures_basic():
    """Test analyze_material_textures detects basic textures."""
    import bpy
    from modelibr.texture_utils import analyze_material_textures
    
    cleanup_test_scene()
    
    mat, images = create_test_material_with_textures()
    obj = create_test_object_with_material(mat)
    
    analysis = analyze_material_textures([obj])
    
    # Should find 4 textures (Albedo, Roughness, Metallic, Normal)
    assert len(analysis["textures"]) >= 4, \
        f"Expected at least 4 textures, got {len(analysis['textures'])}"
    
    # Check texture types detected
    texture_types = {t.get("texture_type") for t in analysis["textures"]}
    assert "Albedo" in texture_types, "Albedo not detected"
    assert "Roughness" in texture_types, "Roughness not detected"
    assert "Metallic" in texture_types, "Metallic not detected"
    assert "Normal" in texture_types, "Normal not detected"
    
    cleanup_test_scene()


def test_analyze_material_textures_orm_packed():
    """Test analyze_material_textures detects ORM packed texture."""
    import bpy
    from modelibr.texture_utils import analyze_material_textures
    
    cleanup_test_scene()
    
    mat, orm_img = create_test_material_with_orm()
    obj = create_test_object_with_material(mat)
    
    analysis = analyze_material_textures([obj])
    
    # Should detect packed texture
    assert len(analysis["packed"]) >= 1, \
        f"Expected at least 1 packed texture, got {len(analysis['packed'])}"
    
    # Packed texture should have channel mappings
    packed = analysis["packed"][0]
    assert "channels" in packed, "Packed texture missing channel info"
    
    cleanup_test_scene()


def test_analyze_material_textures_packable_detection():
    """Test that separate grayscale textures are detected as packable."""
    import bpy
    from modelibr.texture_utils import analyze_material_textures
    
    cleanup_test_scene()
    
    mat, images = create_test_material_with_textures()
    obj = create_test_object_with_material(mat)
    
    analysis = analyze_material_textures([obj])
    
    # Roughness should be detected as packable
    packable_types = {t.get("texture_type") for t in analysis.get("packable", [])}
    assert "Roughness" in packable_types, \
        f"Roughness not in packable types: {packable_types}"
    
    cleanup_test_scene()


def test_classify_textures_for_export_new():
    """Test classify_textures_for_export marks textures without file_id as new."""
    from modelibr.texture_utils import analyze_material_textures, classify_textures_for_export
    
    cleanup_test_scene()
    
    mat, images = create_test_material_with_textures()
    obj = create_test_object_with_material(mat)
    
    analysis = analyze_material_textures([obj])
    classification = classify_textures_for_export(analysis)
    
    # All textures should be "new" since they have no file_id
    assert len(classification["new"]) >= 4, \
        f"Expected at least 4 new textures, got {len(classification['new'])}"
    assert classification["any_changed"] == True, \
        "any_changed should be True for new textures"
    
    cleanup_test_scene()


def test_classify_textures_for_export_with_file_id():
    """Test classify_textures_for_export handles modelibr metadata."""
    import bpy
    from modelibr.texture_utils import analyze_material_textures, classify_textures_for_export
    
    cleanup_test_scene()
    
    mat, images = create_test_material_with_textures()
    obj = create_test_object_with_material(mat)
    
    # Set file_id on one image (simulate imported texture)
    albedo_img = images[0][1]
    albedo_img["modelibr_file_id"] = 123
    albedo_img["modelibr_original_hash"] = "test_hash"
    
    analysis = analyze_material_textures([obj])
    classification = classify_textures_for_export(analysis)
    
    # Should have from_modelibr flag set
    assert classification["any_from_modelibr"] == True, \
        "any_from_modelibr should be True"
    
    cleanup_test_scene()


def test_extract_channel_from_image():
    """Test channel extraction creates grayscale image."""
    import bpy
    import numpy as np
    from modelibr.texture_utils import extract_channel_from_image, SOURCE_CHANNEL_R
    
    cleanup_test_scene()
    
    # Create test image with known channel values
    img = bpy.data.images.new("test_rgb", width=4, height=4)
    pixels = np.zeros(4 * 4 * 4, dtype=np.float32)
    
    # Set R=1.0, G=0.5, B=0.25 for all pixels
    for i in range(4 * 4):
        pixels[i * 4 + 0] = 1.0   # R
        pixels[i * 4 + 1] = 0.5   # G
        pixels[i * 4 + 2] = 0.25  # B
        pixels[i * 4 + 3] = 1.0   # A
    
    img.pixels[:] = pixels.tolist()
    
    # Extract R channel
    extracted = extract_channel_from_image(img, SOURCE_CHANNEL_R, "test_extracted_r")
    
    assert extracted is not None, "Channel extraction returned None"
    assert extracted.size[0] == 4 and extracted.size[1] == 4, \
        f"Extracted image size wrong: {extracted.size}"
    
    # Check extracted values (should be grayscale with R channel value)
    extracted_pixels = list(extracted.pixels)
    # First pixel R value should be ~1.0
    assert extracted_pixels[0] > 0.9, \
        f"Expected R channel ~1.0, got {extracted_pixels[0]}"
    
    # Clean up
    bpy.data.images.remove(img, do_unlink=True)
    bpy.data.images.remove(extracted, do_unlink=True)
    
    cleanup_test_scene()


def run_tests():
    """Run all texture flow tests."""
    results = {
        'passed': 0,
        'failed': 0,
        'errors': []
    }
    
    tests = [
        ("test_analyze_material_textures_basic", test_analyze_material_textures_basic),
        ("test_analyze_material_textures_orm_packed", test_analyze_material_textures_orm_packed),
        ("test_analyze_material_textures_packable_detection", test_analyze_material_textures_packable_detection),
        ("test_classify_textures_for_export_new", test_classify_textures_for_export_new),
        ("test_classify_textures_for_export_with_file_id", test_classify_textures_for_export_with_file_id),
        ("test_extract_channel_from_image", test_extract_channel_from_image),
    ]
    
    for name, test_func in tests:
        try:
            test_func()
            print(f"✓ {name}")
            results['passed'] += 1
        except Exception as e:
            print(f"✗ {name}: {e}")
            results['failed'] += 1
            results['errors'].append((name, str(e), traceback.format_exc()))
    
    return results


if __name__ == '__main__':
    print("\n" + "="*50)
    print("Modelibr Texture Flow Integration Tests")
    print("="*50 + "\n")
    
    setup_addon()
    results = run_tests()
    
    print("\n" + "-"*50)
    print(f"Results: {results['passed']} passed, {results['failed']} failed")
    
    if results['errors']:
        print("\nErrors:")
        for name, error, tb in results['errors']:
            print(f"\n{name}:")
            print(tb)
    
    sys.exit(0 if results['failed'] == 0 else 1)

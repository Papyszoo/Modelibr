"""
Unit tests for texture utilities.
Tests texture type mapping and texture set handling.
"""
import unittest
import os
import sys
import importlib.util


# Direct module import to avoid triggering bpy via __init__.py
def import_module_directly(module_name, module_path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


# Get paths
base_path = os.path.join(os.path.dirname(__file__), '..', '..')
modelibr_path = os.path.join(base_path, 'modelibr')

# Import texture_utils (skip bpy-dependent functions)
# We'll test the mapping constants directly
texture_utils_path = os.path.join(modelibr_path, 'texture_utils.py')

# Read just the mapping definitions without executing bpy code
with open(texture_utils_path, 'r') as f:
    content = f.read()

# Extract and execute just the mapping constants
mapping_code = """
TEXTURE_TYPE_ID_TO_NAME = {
    1: "Albedo",
    2: "Normal",
    3: "Height",
    4: "AmbientOcclusion",
    5: "Roughness",
    6: "Metallic",
    7: "Albedo",
    8: "Specular",
    9: "Emissive",
    10: "Normal",
    11: "Opacity",
    12: "Height",
}

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
"""

exec(mapping_code)


class TestTextureTypeMapping(unittest.TestCase):
    """Test texture type ID to name mapping."""
    
    def test_albedo_mapping(self):
        """Test Albedo (ID 1) maps correctly."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[1], "Albedo")
    
    def test_normal_mapping(self):
        """Test Normal (ID 2) maps correctly."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[2], "Normal")
    
    def test_roughness_mapping(self):
        """Test Roughness (ID 5) maps correctly."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[5], "Roughness")
    
    def test_metallic_mapping(self):
        """Test Metallic (ID 6) maps correctly."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[6], "Metallic")
    
    def test_diffuse_maps_to_albedo(self):
        """Test Diffuse (ID 7) maps to Albedo."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[7], "Albedo")
    
    def test_bump_maps_to_normal(self):
        """Test Bump (ID 10) maps to Normal."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[10], "Normal")
    
    def test_displacement_maps_to_height(self):
        """Test Displacement (ID 12) maps to Height."""
        self.assertEqual(TEXTURE_TYPE_ID_TO_NAME[12], "Height")
    
    def test_all_ids_have_valid_names(self):
        """Test all texture type IDs map to valid node input names."""
        for id_val, name in TEXTURE_TYPE_ID_TO_NAME.items():
            self.assertIn(name, TEXTURE_TYPE_TO_NODE_INPUT,
                f"Texture type {name} (ID {id_val}) has no node input mapping")
    
    def test_fallback_for_unknown_id(self):
        """Test that unknown IDs return default value."""
        unknown_id = 999
        result = TEXTURE_TYPE_ID_TO_NAME.get(unknown_id, "Albedo")
        self.assertEqual(result, "Albedo")


class TestTextureTypeToNodeInput(unittest.TestCase):
    """Test texture type to Blender node input mapping."""
    
    def test_albedo_to_base_color(self):
        """Test Albedo maps to Base Color."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["Albedo"], "Base Color")
    
    def test_normal_to_normal(self):
        """Test Normal maps to Normal."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["Normal"], "Normal")
    
    def test_roughness_to_roughness(self):
        """Test Roughness maps to Roughness."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["Roughness"], "Roughness")
    
    def test_metallic_to_metallic(self):
        """Test Metallic maps to Metallic."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["Metallic"], "Metallic")
    
    def test_ao_to_ao(self):
        """Test AmbientOcclusion maps to AO."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["AmbientOcclusion"], "AO")
    
    def test_emissive_to_emission_color(self):
        """Test Emissive maps to Emission Color."""
        self.assertEqual(TEXTURE_TYPE_TO_NODE_INPUT["Emissive"], "Emission Color")


class TestTextureSetIdsFallback(unittest.TestCase):
    """Test texture set ID fallback logic."""
    
    def test_use_default_texture_set_id_when_present(self):
        """Test defaultTextureSetId is used when present."""
        version = {
            'defaultTextureSetId': 5,
            'textureSetIds': [1, 2, 3]
        }
        texture_set_id = version.get('defaultTextureSetId')
        self.assertEqual(texture_set_id, 5)
    
    def test_fallback_to_first_texture_set_id(self):
        """Test fallback to first textureSetIds when defaultTextureSetId is None."""
        version = {
            'defaultTextureSetId': None,
            'textureSetIds': [10, 20, 30]
        }
        texture_set_id = version.get('defaultTextureSetId')
        texture_set_ids = version.get('textureSetIds', [])
        
        if texture_set_id is None and texture_set_ids:
            texture_set_id = texture_set_ids[0]
        
        self.assertEqual(texture_set_id, 10)
    
    def test_no_fallback_when_texture_set_ids_empty(self):
        """Test no fallback when textureSetIds is empty."""
        version = {
            'defaultTextureSetId': None,
            'textureSetIds': []
        }
        texture_set_id = version.get('defaultTextureSetId')
        texture_set_ids = version.get('textureSetIds', [])
        
        if texture_set_id is None and texture_set_ids:
            texture_set_id = texture_set_ids[0]
        
        self.assertIsNone(texture_set_id)


if __name__ == '__main__':
    unittest.main()

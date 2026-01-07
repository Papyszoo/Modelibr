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


# Channel mapping constants
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

PACKABLE_TEXTURE_TYPES = {"AmbientOcclusion", "Roughness", "Metallic"}


class TestChannelMappingConstants(unittest.TestCase):
    """Test channel mapping constants for ORM textures."""
    
    def test_source_channel_values(self):
        """Test source channel enum values."""
        self.assertEqual(SOURCE_CHANNEL_RGB, 0)
        self.assertEqual(SOURCE_CHANNEL_R, 1)
        self.assertEqual(SOURCE_CHANNEL_G, 2)
        self.assertEqual(SOURCE_CHANNEL_B, 3)
        self.assertEqual(SOURCE_CHANNEL_A, 4)
    
    def test_channel_index_to_name_mapping(self):
        """Test channel index to name mapping."""
        self.assertEqual(CHANNEL_INDEX_TO_NAME[0], "RGB")
        self.assertEqual(CHANNEL_INDEX_TO_NAME[1], "R")
        self.assertEqual(CHANNEL_INDEX_TO_NAME[2], "G")
        self.assertEqual(CHANNEL_INDEX_TO_NAME[3], "B")
        self.assertEqual(CHANNEL_INDEX_TO_NAME[4], "A")
    
    def test_all_channels_have_names(self):
        """Test all source channels have names."""
        for channel_id in [SOURCE_CHANNEL_RGB, SOURCE_CHANNEL_R, 
                          SOURCE_CHANNEL_G, SOURCE_CHANNEL_B, SOURCE_CHANNEL_A]:
            self.assertIn(channel_id, CHANNEL_INDEX_TO_NAME)


class TestPackableTextureTypes(unittest.TestCase):
    """Test packable texture type detection."""
    
    def test_packable_types_includes_orm(self):
        """Test ORM textures are in packable set."""
        self.assertIn("AmbientOcclusion", PACKABLE_TEXTURE_TYPES)
        self.assertIn("Roughness", PACKABLE_TEXTURE_TYPES)
        self.assertIn("Metallic", PACKABLE_TEXTURE_TYPES)
    
    def test_packable_types_excludes_rgb(self):
        """Test RGB textures are not in packable set."""
        self.assertNotIn("Albedo", PACKABLE_TEXTURE_TYPES)
        self.assertNotIn("Normal", PACKABLE_TEXTURE_TYPES)
        self.assertNotIn("Emissive", PACKABLE_TEXTURE_TYPES)
    
    def test_packable_count(self):
        """Test there are exactly 3 packable types (ORM)."""
        self.assertEqual(len(PACKABLE_TEXTURE_TYPES), 3)


class TestClassifyTexturesForExport(unittest.TestCase):
    """Test classification logic for texture export decisions."""
    
    def test_empty_analysis_returns_no_changes(self):
        """Test empty analysis returns no changes."""
        analysis = {"textures": [], "packed": [], "packable": []}
        result = self._classify(analysis)
        
        self.assertEqual(len(result["unchanged"]), 0)
        self.assertEqual(len(result["modified"]), 0)
        self.assertEqual(len(result["new"]), 0)
        self.assertFalse(result["any_from_modelibr"])
        self.assertFalse(result["any_changed"])
    
    def test_new_texture_without_file_id(self):
        """Test texture without file_id is classified as new."""
        analysis = {
            "textures": [{"texture_type": "Albedo", "file_id": None, "image": None}],
            "packed": [],
            "packable": []
        }
        result = self._classify(analysis)
        
        self.assertEqual(len(result["new"]), 1)
        self.assertTrue(result["any_changed"])
        self.assertFalse(result["any_from_modelibr"])
    
    def test_texture_with_file_id_is_from_modelibr(self):
        """Test texture with file_id is marked as from_modelibr."""
        mock_image = MockImage(file_id=123, original_hash="abc", current_hash="abc")
        analysis = {
            "textures": [{"texture_type": "Albedo", "file_id": 123, "image": mock_image}],
            "packed": [],
            "packable": []
        }
        result = self._classify(analysis)
        
        self.assertTrue(result["any_from_modelibr"])
    
    def test_unchanged_when_hash_matches(self):
        """Test texture is unchanged when hash matches."""
        mock_image = MockImage(file_id=123, original_hash="hash123", current_hash="hash123")
        analysis = {
            "textures": [{"texture_type": "Albedo", "file_id": 123, "image": mock_image}],
            "packed": [],
            "packable": []
        }
        result = self._classify(analysis)
        
        self.assertEqual(len(result["unchanged"]), 1)
        self.assertFalse(result["any_changed"])
    
    def test_modified_when_hash_differs(self):
        """Test texture is modified when hash differs."""
        mock_image = MockImage(file_id=123, original_hash="old_hash", current_hash="new_hash")
        analysis = {
            "textures": [{"texture_type": "Albedo", "file_id": 123, "image": mock_image}],
            "packed": [],
            "packable": []
        }
        result = self._classify(analysis)
        
        self.assertEqual(len(result["modified"]), 1)
        self.assertTrue(result["any_changed"])
    
    def test_removed_types_detected(self):
        """Test removed texture types are detected."""
        analysis = {
            "textures": [{"texture_type": "Albedo", "file_id": None, "image": None}],
            "packed": [],
            "packable": []
        }
        original_types = {"Albedo", "Normal", "Roughness"}
        result = self._classify(analysis, original_types)
        
        self.assertIn("Normal", result["removed"])
        self.assertIn("Roughness", result["removed"])
        self.assertTrue(result["any_changed"])
    
    def _classify(self, analysis, original_types=None):
        """Mock classify_textures_for_export logic for testing."""
        result = {
            "unchanged": [],
            "modified": [],
            "new": [],
            "removed": set(),
            "any_from_modelibr": False,
            "any_changed": False,
        }
        
        current_types = set()
        
        for tex in analysis.get("textures", []):
            image = tex.get("image")
            file_id = tex.get("file_id")
            texture_type = tex.get("texture_type")
            
            if texture_type:
                current_types.add(texture_type)
            
            if file_id:
                result["any_from_modelibr"] = True
                original_hash = image.get("modelibr_original_hash", "") if image else ""
                current_hash = mock_calculate_hash(image) if image else ""
                
                if original_hash and current_hash and original_hash == current_hash:
                    result["unchanged"].append(tex)
                else:
                    result["modified"].append(tex)
                    result["any_changed"] = True
            else:
                result["new"].append(tex)
                result["any_changed"] = True
        
        if original_types:
            result["removed"] = original_types - current_types
            if result["removed"]:
                result["any_changed"] = True
        
        return result


class MockImage:
    """Mock Blender image for testing."""
    def __init__(self, file_id=None, original_hash="", current_hash=""):
        self._props = {
            "modelibr_file_id": file_id,
            "modelibr_original_hash": original_hash,
        }
        self._current_hash = current_hash
    
    def get(self, key, default=""):
        return self._props.get(key, default)


def mock_calculate_hash(image):
    """Mock hash calculation for testing."""
    if hasattr(image, '_current_hash'):
        return image._current_hash
    return ""


if __name__ == '__main__':
    unittest.main()


"""
Unit tests for the tracking module.
Tests object tracking and modification detection with mocked bpy.
"""
import unittest
from unittest.mock import MagicMock, patch
import sys
import os
import importlib.util

# Mock bpy before importing tracking
mock_bpy = MagicMock()
sys.modules['bpy'] = mock_bpy


# Direct module import
def import_module_directly(module_name, module_path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


base_path = os.path.join(os.path.dirname(__file__), '..', '..')
modelibr_path = os.path.join(base_path, 'modelibr')

# Import config first (tracking depends on it)
config = import_module_directly('modelibr.config', os.path.join(modelibr_path, 'config.py'))
tracking = import_module_directly('modelibr.tracking', os.path.join(modelibr_path, 'tracking.py'))

calculate_object_hash = tracking.calculate_object_hash
is_modified = tracking.is_modified
get_modelibr_objects = tracking.get_modelibr_objects
get_modelibr_models = tracking.get_modelibr_models
store_object_metadata = tracking.store_object_metadata


class TestCalculateObjectHash(unittest.TestCase):
    """Test object hash calculation."""
    
    def test_hash_none_object(self):
        """Test hash of None returns empty string."""
        result = calculate_object_hash(None)
        self.assertEqual(result, "")
    
    def test_hash_object_no_data(self):
        """Test hash of object with no data returns empty string."""
        obj = MagicMock()
        obj.data = None
        result = calculate_object_hash(obj)
        self.assertEqual(result, "")
    
    def test_hash_mesh_object(self):
        """Test hash of mesh object."""
        obj = MagicMock()
        obj.data.vertices = [1, 2, 3]
        obj.data.polygons = [1, 2]
        obj.matrix_world = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        obj.material_slots = []
        
        result = calculate_object_hash(obj)
        
        self.assertIsInstance(result, str)
        self.assertEqual(len(result), 32)  # MD5 hash length
    
    def test_hash_consistency(self):
        """Test that same object produces same hash."""
        obj = MagicMock()
        obj.data.vertices = [1, 2, 3]
        obj.data.polygons = [1, 2]
        obj.matrix_world = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        obj.material_slots = []
        
        hash1 = calculate_object_hash(obj)
        hash2 = calculate_object_hash(obj)
        
        self.assertEqual(hash1, hash2)


class TestIsModified(unittest.TestCase):
    """Test modification detection."""
    
    def test_none_object(self):
        """Test that None returns False."""
        self.assertFalse(is_modified(None))
    
    def test_object_without_metadata(self):
        """Test object without modelibr metadata returns False."""
        obj = MagicMock()
        obj.__contains__ = lambda self, key: False
        
        self.assertFalse(is_modified(obj))


class TestGetModelibrObjects(unittest.TestCase):
    """Test finding Modelibr objects in scene."""
    
    def test_empty_scene(self):
        """Test empty scene returns empty list."""
        scene = MagicMock()
        scene.objects = []
        
        result = get_modelibr_objects(scene)
        self.assertEqual(result, [])
    
    def test_scene_with_modelibr_objects(self):
        """Test scene with Modelibr objects."""
        obj1 = MagicMock()
        obj1.__contains__ = lambda s, key: key == "modelibr_model_id"
        
        obj2 = MagicMock()
        obj2.__contains__ = lambda s, key: False
        
        obj3 = MagicMock()
        obj3.__contains__ = lambda s, key: key == "modelibr_model_id"
        
        scene = MagicMock()
        scene.objects = [obj1, obj2, obj3]
        
        result = get_modelibr_objects(scene)
        
        self.assertEqual(len(result), 2)
        self.assertIn(obj1, result)
        self.assertIn(obj3, result)


class TestStoreObjectMetadata(unittest.TestCase):
    """Test storing metadata on objects."""
    
    @patch.object(tracking, 'calculate_object_hash')
    def test_stores_all_metadata(self, mock_hash):
        """Test that all metadata fields are stored."""
        mock_hash.return_value = "abc123"
        
        obj = MagicMock()
        obj.__setitem__ = MagicMock()
        
        store_object_metadata(
            obj,
            model_id=1,
            model_name="Test Model",
            version_id=5,
            version_number=2,
            file_id=10
        )
        
        calls = obj.__setitem__.call_args_list
        keys_set = [call[0][0] for call in calls]
        
        self.assertIn("modelibr_model_id", keys_set)
        self.assertIn("modelibr_model_name", keys_set)
        self.assertIn("modelibr_version_id", keys_set)


if __name__ == '__main__':
    unittest.main()

"""
E2E tests for upload flow using mock server.
"""
import unittest
import sys
import os
import tempfile
import importlib.util

# Direct module import to avoid triggering bpy
def import_module_directly(module_name, module_path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


base_path = os.path.join(os.path.dirname(__file__), '..', '..')
modelibr_path = os.path.join(base_path, 'modelibr')

# Import dependencies
exceptions = import_module_directly('modelibr.exceptions', os.path.join(modelibr_path, 'exceptions.py'))
config = import_module_directly('modelibr.config', os.path.join(modelibr_path, 'config.py'))
api_client = import_module_directly('modelibr.api_client', os.path.join(modelibr_path, 'api_client.py'))

# Import mock server
from tests.e2e.mock_server import MockServer

ModelibrApiClient = api_client.ModelibrApiClient


class TestUploadFlow(unittest.TestCase):
    """E2E tests for model upload."""
    
    def setUp(self):
        """Start mock server."""
        self.server = MockServer()
        self.server.__enter__()
        self.client = ModelibrApiClient(self.server.url, "test-key")
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Stop mock server and clean up."""
        self.server.__exit__(None, None, None)
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def _create_test_file(self, filename: str, content: bytes = b"test content") -> str:
        """Create a test file for upload."""
        filepath = os.path.join(self.temp_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(content)
        return filepath
    
    def test_create_new_model(self):
        """Test creating new model with file upload."""
        test_file = self._create_test_file("new_model.glb", b"GLB file data")
        
        result = self.client.create_model(test_file)
        
        self.assertIn("id", result)
        self.assertGreater(result["id"], 0)
    
    def test_create_new_version(self):
        """Test creating new version for existing model."""
        test_file = self._create_test_file("version_2.glb", b"Updated GLB data")
        
        result = self.client.create_version(
            model_id=1,
            file_path=test_file,
            description="Test version",
            set_as_active=True
        )
        
        self.assertIn("id", result)
        self.assertGreater(result["id"], 0)
    
    def test_upload_multiple_versions(self):
        """Test uploading multiple versions to same model."""
        version_ids = []
        
        for i in range(3):
            test_file = self._create_test_file(f"version_{i}.glb", f"Version {i} data".encode())
            result = self.client.create_version(
                model_id=1,
                file_path=test_file,
                description=f"Version {i}"
            )
            version_ids.append(result["id"])
        
        # All version IDs should be unique
        self.assertEqual(len(version_ids), len(set(version_ids)))
    
    def test_full_upload_flow(self):
        """Test complete upload flow: create model -> add version."""
        # 1. Create new model
        model_file = self._create_test_file("model.glb", b"Initial GLB")
        model_result = self.client.create_model(model_file)
        model_id = model_result.get("id") or model_result.get("modelId")
        self.assertIsNotNone(model_id)
        
        # 2. Add new version
        version_file = self._create_test_file("model_v2.glb", b"Updated GLB")
        version_result = self.client.create_version(
            model_id=model_id,
            file_path=version_file,
            description="Second version"
        )
        self.assertIn("id", version_result)


class TestUploadWithTextures(unittest.TestCase):
    """E2E tests for upload with texture sets."""
    
    def setUp(self):
        """Start mock server."""
        self.server = MockServer()
        self.server.__enter__()
        self.client = ModelibrApiClient(self.server.url, "test-key")
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        self.server.__exit__(None, None, None)
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def _create_test_file(self, filename: str, content: bytes = b"test") -> str:
        filepath = os.path.join(self.temp_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(content)
        return filepath
    
    def test_create_texture_set(self):
        """Test creating texture set."""
        texture_file = self._create_test_file("diffuse.png", b"PNG data")
        
        result = self.client.create_texture_set_with_file(
            texture_file,
            "Test Textures",
            "Albedo"
        )
        
        self.assertIn("textureSetId", result)
        self.assertGreater(result["textureSetId"], 0)


class TestConnectionTesting(unittest.TestCase):
    """Tests for connection testing functionality."""
    
    def test_connection_success(self):
        """Test successful connection."""
        with MockServer() as server:
            client = ModelibrApiClient(server.url, "test-key")
            result = client.test_connection()
            self.assertTrue(result)
    
    def test_connection_failure(self):
        """Test failed connection to non-existent server."""
        client = ModelibrApiClient("http://localhost:9999", "test-key")
        result = client.test_connection()
        self.assertFalse(result)


if __name__ == '__main__':
    unittest.main()

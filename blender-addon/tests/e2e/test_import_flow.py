"""
E2E tests for import flow using mock server.
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
from tests.e2e.mock_server import MockServer, MockModelibrHandler

ModelibrApiClient = api_client.ModelibrApiClient


class TestImportFlow(unittest.TestCase):
    """E2E tests for model import."""
    
    def setUp(self):
        """Start mock server."""
        self.server = MockServer()
        self.server.__enter__()
        self.client = ModelibrApiClient(self.server.url, "test-key")
    
    def tearDown(self):
        """Stop mock server."""
        self.server.__exit__(None, None, None)
    
    def test_list_models(self):
        """Test fetching model list."""
        models = self.client.get_models()
        
        self.assertIsInstance(models, list)
        self.assertGreater(len(models), 0)
        self.assertEqual(models[0]["name"], "Test Model")
    
    def test_get_model_details(self):
        """Test fetching model details."""
        model = self.client.get_model(1)
        
        self.assertEqual(model["id"], 1)
        self.assertEqual(model["name"], "Test Model")
        self.assertEqual(model["activeVersionId"], 1)
    
    def test_get_model_versions(self):
        """Test fetching model versions."""
        versions = self.client.get_model_versions(1)
        
        self.assertIsInstance(versions, list)
        self.assertGreater(len(versions), 0)
        self.assertEqual(versions[0]["versionNumber"], 1)
    
    def test_get_version_files(self):
        """Test that version contains file info."""
        version = self.client.get_model_version(1, 1)
        
        self.assertIn("files", version)
        self.assertGreater(len(version["files"]), 0)
        self.assertIn("originalFileName", version["files"][0])
    
    def test_download_file(self):
        """Test file download."""
        with tempfile.TemporaryDirectory() as temp_dir:
            filepath = self.client.download_file(1, temp_dir, "test.glb")
            
            self.assertTrue(os.path.exists(filepath))
            with open(filepath, 'rb') as f:
                content = f.read()
            self.assertEqual(content, b"glTF binary data")
    
    def test_full_import_flow(self):
        """Test complete import flow: list -> get -> version -> download."""
        # 1. List models
        models = self.client.get_models()
        self.assertGreater(len(models), 0)
        
        # 2. Get model details
        model = self.client.get_model(models[0]["id"])
        self.assertIn("activeVersionId", model)
        
        # 3. Get versions
        versions = self.client.get_model_versions(model["id"])
        self.assertGreater(len(versions), 0)
        
        # 4. Download file
        version = versions[0]
        files = version.get("files", [])
        self.assertGreater(len(files), 0)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            filepath = self.client.download_file(
                files[0]["id"],
                temp_dir,
                files[0]["originalFileName"]
            )
            self.assertTrue(os.path.exists(filepath))


class TestImportWithTextures(unittest.TestCase):
    """E2E tests for import with texture sets."""
    
    def setUp(self):
        """Start mock server with texture data."""
        self.server = MockServer()
        self.server.__enter__()
        
        # Add texture set with integer texture types (as returned by API)
        MockModelibrHandler.texture_sets_db[1] = {
            "id": 1,
            "name": "Test Textures",
            "textures": [
                {"id": 1, "textureType": 1, "fileId": 100, "fileName": "diffuse.png"},  # 1 = Albedo
                {"id": 2, "textureType": 2, "fileId": 101, "fileName": "normal.png"},   # 2 = Normal
            ]
        }
        MockModelibrHandler.versions_db[1]["defaultTextureSetId"] = 1
        MockModelibrHandler.versions_db[1]["textureSetIds"] = [1]
        MockModelibrHandler.files_db[100] = b"PNG diffuse texture data"
        MockModelibrHandler.files_db[101] = b"PNG normal texture data"
        
        self.client = ModelibrApiClient(self.server.url, "test-key")
    
    def tearDown(self):
        self.server.__exit__(None, None, None)
    
    def test_get_texture_set(self):
        """Test fetching texture set."""
        texture_set = self.client.get_texture_set(1)
        
        self.assertEqual(texture_set["name"], "Test Textures")
        self.assertEqual(len(texture_set["textures"]), 2)
    
    def test_texture_types_are_integers(self):
        """Test that API returns texture types as integers."""
        texture_set = self.client.get_texture_set(1)
        
        for tex in texture_set["textures"]:
            self.assertIsInstance(tex["textureType"], int)
    
    def test_download_textures(self):
        """Test downloading textures."""
        texture_set = self.client.get_texture_set(1)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            for tex in texture_set["textures"]:
                filepath = self.client.download_file(
                    tex["fileId"],
                    temp_dir,
                    tex["fileName"]
                )
                self.assertTrue(os.path.exists(filepath))


class TestTextureSetIdsFallback(unittest.TestCase):
    """E2E tests for textureSetIds fallback when defaultTextureSetId is None."""
    
    def setUp(self):
        """Start mock server with texture data but no default set."""
        self.server = MockServer()
        self.server.__enter__()
        
        # Add texture set
        MockModelibrHandler.texture_sets_db[5] = {
            "id": 5,
            "name": "Fallback Textures",
            "textures": [
                {"id": 10, "textureType": 1, "fileId": 200, "fileName": "fallback.png"},
            ]
        }
        # Version has NO defaultTextureSetId but has textureSetIds
        MockModelibrHandler.versions_db[1]["defaultTextureSetId"] = None
        MockModelibrHandler.versions_db[1]["textureSetIds"] = [5, 6, 7]
        MockModelibrHandler.files_db[200] = b"PNG fallback texture data"
        
        self.client = ModelibrApiClient(self.server.url, "test-key")
    
    def tearDown(self):
        self.server.__exit__(None, None, None)
    
    def test_version_has_texture_set_ids(self):
        """Test that version contains textureSetIds array."""
        versions = self.client.get_model_versions(1)
        version = versions[0]
        
        self.assertIn("textureSetIds", version)
        self.assertIsInstance(version["textureSetIds"], list)
    
    def test_fallback_to_first_texture_set_id(self):
        """Test that first textureSetId is used when defaultTextureSetId is None."""
        versions = self.client.get_model_versions(1)
        version = versions[0]
        
        default_id = version.get("defaultTextureSetId")
        texture_set_ids = version.get("textureSetIds", [])
        
        # Simulate fallback logic
        if default_id is None and texture_set_ids:
            default_id = texture_set_ids[0]
        
        self.assertEqual(default_id, 5)
        
        # Verify we can fetch the texture set
        texture_set = self.client.get_texture_set(default_id)
        self.assertEqual(texture_set["name"], "Fallback Textures")


if __name__ == '__main__':
    unittest.main()


"""
Unit tests for the API client.
Tests HTTP communication with mocked responses.
"""
import unittest
from unittest.mock import patch, MagicMock
import json
import os
import sys
import tempfile
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

# Import dependencies first
exceptions = import_module_directly('modelibr.exceptions', os.path.join(modelibr_path, 'exceptions.py'))
config = import_module_directly('modelibr.config', os.path.join(modelibr_path, 'config.py'))
api_client = import_module_directly('modelibr.api_client', os.path.join(modelibr_path, 'api_client.py'))

ModelibrApiClient = api_client.ModelibrApiClient
ApiError = exceptions.ApiError


class TestModelibrApiClient(unittest.TestCase):
    """Test cases for ModelibrApiClient."""
    
    def setUp(self):
        """Set up test client."""
        self.client = ModelibrApiClient(
            server_url="http://localhost:5000",
            api_key="test-api-key"
        )
    
    def test_init(self):
        """Test client initialization."""
        self.assertEqual(self.client.server_url, "http://localhost:5000")
        self.assertEqual(self.client.api_key, "test-api-key")
    
    def test_init_trailing_slash(self):
        """Test that trailing slashes are removed from server URL."""
        client = ModelibrApiClient("http://localhost:5000/", "key")
        self.assertEqual(client.server_url, "http://localhost:5000")
    
    def test_get_headers_with_api_key(self):
        """Test that headers include authorization when API key is set."""
        headers = self.client._get_headers()
        self.assertEqual(headers["Authorization"], "Bearer test-api-key")
        self.assertEqual(headers["Accept"], "application/json")
    
    def test_get_headers_without_api_key(self):
        """Test headers without API key."""
        client = ModelibrApiClient("http://localhost:5000", "")
        headers = client._get_headers()
        self.assertNotIn("Authorization", headers)
        self.assertEqual(headers["Accept"], "application/json")
    
    def test_get_models_success(self):
        """Test successful model list retrieval."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps([
            {"id": 1, "name": "Model 1"},
            {"id": 2, "name": "Model 2"}
        ]).encode('utf-8')
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        
        # Patch directly on the imported module's request reference
        with patch.object(api_client.request, 'urlopen', return_value=mock_response):
            models = self.client.get_models()
        
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["name"], "Model 1")
    
    def test_get_model_success(self):
        """Test getting a single model."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "id": 1,
            "name": "Test Model",
            "activeVersionId": 5
        }).encode('utf-8')
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        
        with patch.object(api_client.request, 'urlopen', return_value=mock_response):
            model = self.client.get_model(1)
        
        self.assertEqual(model["id"], 1)
        self.assertEqual(model["name"], "Test Model")
    
    def test_http_error_handling(self):
        """Test that HTTP errors raise ApiError."""
        from urllib.error import HTTPError
        
        error = HTTPError(
            url="http://test",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=MagicMock(read=lambda: b"Model not found")
        )
        
        with patch.object(api_client.request, 'urlopen', side_effect=error):
            with self.assertRaises(ApiError) as context:
                self.client.get_model(999)
        
        self.assertIn("404", str(context.exception))
    
    def test_test_connection_success(self):
        """Test connection test success."""
        with patch.object(self.client, 'get_models', return_value=[]):
            result = self.client.test_connection()
            self.assertTrue(result)
    
    def test_test_connection_failure(self):
        """Test connection test failure."""
        with patch.object(self.client, 'get_models', side_effect=ApiError("Failed")):
            result = self.client.test_connection()
            self.assertFalse(result)


class TestApiClientFileOperations(unittest.TestCase):
    """Test file upload/download operations."""
    
    def setUp(self):
        self.client = ModelibrApiClient("http://localhost:5000", "test-key")
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def test_download_file(self):
        """Test file download."""
        mock_response = MagicMock()
        mock_response.read.side_effect = [b"file content", b""]
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        
        with patch.object(api_client.request, 'urlopen', return_value=mock_response):
            filepath = self.client.download_file(1, self.temp_dir, "test.glb")
        
        self.assertTrue(os.path.exists(filepath))
        with open(filepath, 'rb') as f:
            self.assertEqual(f.read(), b"file content")
    
    def test_upload_file_not_found(self):
        """Test that uploading non-existent file raises error."""
        with self.assertRaises(ApiError):
            self.client.create_model("/nonexistent/file.glb")
    
    def test_upload_empty_file(self):
        """Test that uploading empty file raises error."""
        empty_file = os.path.join(self.temp_dir, "empty.glb")
        with open(empty_file, 'w') as f:
            pass
        
        with self.assertRaises(ApiError):
            self.client.create_model(empty_file)


if __name__ == '__main__':
    unittest.main()


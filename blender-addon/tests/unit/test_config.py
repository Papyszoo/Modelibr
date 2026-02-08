"""
Unit tests for config and exceptions modules.
"""
import unittest
import sys
import os
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

config = import_module_directly('modelibr.config', os.path.join(modelibr_path, 'config.py'))
exceptions = import_module_directly('modelibr.exceptions', os.path.join(modelibr_path, 'exceptions.py'))

# Import from config
IMPORT_FORMAT_PRIORITY = config.IMPORT_FORMAT_PRIORITY
EXPORT_FORMAT_ITEMS = config.EXPORT_FORMAT_ITEMS
API_READ_TIMEOUT = config.API_READ_TIMEOUT
API_UPLOAD_TIMEOUT = config.API_UPLOAD_TIMEOUT
TEXTURE_FILENAME_PATTERNS = config.TEXTURE_FILENAME_PATTERNS
METADATA_MODEL_ID = config.METADATA_MODEL_ID
DEFAULT_SERVER_URL = config.DEFAULT_SERVER_URL

# Import from exceptions
ModelibrError = exceptions.ModelibrError
ApiError = exceptions.ApiError
ConnectionError_ = exceptions.ConnectionError  # Avoid builtin conflict
AuthenticationError = exceptions.AuthenticationError
NotFoundError = exceptions.NotFoundError
ModelibrImportError = exceptions.ModelImportError
ExportError = exceptions.ExportError
UploadError = exceptions.UploadError
TextureError = exceptions.TextureError
ConfigurationError = exceptions.ConfigurationError


class TestConfig(unittest.TestCase):
    """Test configuration values."""
    
    def test_import_format_priority(self):
        """Test import format priority is defined."""
        self.assertIsInstance(IMPORT_FORMAT_PRIORITY, (list, tuple))
        self.assertIn('glb', IMPORT_FORMAT_PRIORITY)
        self.assertIn('fbx', IMPORT_FORMAT_PRIORITY)
    
    def test_export_format_items(self):
        """Test export format items for Blender EnumProperty."""
        self.assertIsInstance(EXPORT_FORMAT_ITEMS, (list, tuple))
        
        for item in EXPORT_FORMAT_ITEMS:
            self.assertEqual(len(item), 3)
    
    def test_api_timeouts(self):
        """Test API timeout values are reasonable."""
        self.assertGreater(API_READ_TIMEOUT, 0)
        self.assertGreater(API_UPLOAD_TIMEOUT, API_READ_TIMEOUT)
    
    def test_texture_filename_patterns(self):
        """Test texture filename patterns exist."""
        self.assertIsInstance(TEXTURE_FILENAME_PATTERNS, dict)
        self.assertIn('Albedo', TEXTURE_FILENAME_PATTERNS)
        self.assertIn('Normal', TEXTURE_FILENAME_PATTERNS)
    
    def test_metadata_keys(self):
        """Test metadata key constants."""
        self.assertEqual(METADATA_MODEL_ID, "modelibr_model_id")
    
    def test_default_server_url(self):
        """Test default server URL is set."""
        self.assertIsInstance(DEFAULT_SERVER_URL, str)
        self.assertTrue(DEFAULT_SERVER_URL.startswith("http"))


class TestExceptions(unittest.TestCase):
    """Test custom exception hierarchy."""
    
    def test_modelibr_error_base(self):
        """Test ModelibrError is base exception."""
        error = ModelibrError("Test error")
        self.assertIsInstance(error, Exception)
        self.assertEqual(str(error), "Test error")
    
    def test_api_error_with_status_code(self):
        """Test ApiError stores status code."""
        error = ApiError("Not found", status_code=404)
        self.assertEqual(error.status_code, 404)
        self.assertIsInstance(error, ModelibrError)
    
    def test_not_found_error(self):
        """Test NotFoundError is ApiError subclass."""
        error = NotFoundError("Model", 1)  # resource_type, resource_id
        self.assertIsInstance(error, ApiError)
        self.assertEqual(error.status_code, 404)
        self.assertEqual(error.resource_type, "Model")
        self.assertEqual(error.resource_id, 1)
    
    def test_connection_error(self):
        """Test ConnectionError."""
        error = ConnectionError_("Failed to connect")
        self.assertIsInstance(error, ModelibrError)
    
    def test_authentication_error(self):
        """Test AuthenticationError."""
        error = AuthenticationError()
        self.assertIsInstance(error, ModelibrError)
        # AuthenticationError doesn't have status_code (it's not ApiError subclass)
    
    def test_import_error(self):
        """Test ImportError."""
        error = ModelibrImportError("Failed to import model")
        self.assertIsInstance(error, ModelibrError)
    
    def test_export_error(self):
        """Test ExportError."""
        error = ExportError("Failed to export model")
        self.assertIsInstance(error, ModelibrError)
    
    def test_upload_error(self):
        """Test UploadError."""
        error = UploadError("Failed to upload file")
        self.assertIsInstance(error, ModelibrError)
    
    def test_texture_error(self):
        """Test TextureError."""
        error = TextureError("Texture operation failed")
        self.assertIsInstance(error, ModelibrError)
    
    def test_configuration_error(self):
        """Test ConfigurationError."""
        error = ConfigurationError("Invalid configuration")
        self.assertIsInstance(error, ModelibrError)


if __name__ == '__main__':
    unittest.main()

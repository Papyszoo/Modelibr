"""
Mock Modelibr server for E2E testing.
Provides a simple HTTP server that simulates the Modelibr API.
"""
import http.server
import json
import os
import re
import threading
from typing import Dict, Any
from urllib.parse import urlparse, parse_qs


class MockModelibrHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler that simulates Modelibr API."""
    
    # Shared test data
    models_db: Dict[int, Dict[str, Any]] = {}
    versions_db: Dict[int, Dict[str, Any]] = {}
    texture_sets_db: Dict[int, Dict[str, Any]] = {}
    files_db: Dict[int, bytes] = {}
    next_id = 1
    
    @classmethod
    def reset(cls):
        """Reset all test data."""
        cls.models_db = {}
        cls.versions_db = {}
        cls.texture_sets_db = {}
        cls.files_db = {}
        cls.next_id = 2
        
        # Add default test data
        cls.models_db[1] = {
            "id": 1,
            "name": "Test Model",
            "activeVersionId": 1,
        }
        cls.versions_db[1] = {
            "id": 1,
            "modelId": 1,
            "versionNumber": 1,
            "files": [
                {"id": 1, "originalFileName": "test.glb"}
            ],
            "defaultTextureSetId": None,
            "textureSetIds": [],
        }
        cls.files_db[1] = b"glTF binary data"
    
    def log_message(self, format, *args):
        """Suppress logging unless debug mode."""
        if os.environ.get('MOCK_SERVER_DEBUG'):
            super().log_message(format, *args)
    
    def _normalize_path(self, path: str) -> str:
        """Remove /api prefix if present."""
        if path.startswith('/api'):
            return path[4:]  # Remove '/api'
        return path
    
    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = self._normalize_path(parsed.path)
        
        try:
            # GET /models - list all models
            if path == '/models':
                self._send_json(list(self.models_db.values()))
            
            # GET /models/{id}/versions/{vid} - get specific version
            elif re.match(r'^/models/\d+/versions/\d+$', path):
                parts = path.split('/')
                version_id = int(parts[4])
                version = self.versions_db.get(version_id)
                if version:
                    self._send_json(version)
                else:
                    self._send_error(404, "Version not found")
            
            # GET /models/{id}/versions - list versions
            elif re.match(r'^/models/\d+/versions$', path):
                parts = path.split('/')
                model_id = int(parts[2])
                versions = [v for v in self.versions_db.values() 
                           if v.get('modelId') == model_id]
                self._send_json(versions)
            
            # GET /models/{id} - get model
            elif re.match(r'^/models/\d+$', path):
                model_id = int(path.split('/')[-1])
                model = self.models_db.get(model_id)
                if model:
                    self._send_json(model)
                else:
                    self._send_error(404, "Model not found")
            
            # GET /texture-sets/{id} - get texture set
            elif re.match(r'^/texture-sets/\d+$', path):
                ts_id = int(path.split('/')[-1])
                ts = self.texture_sets_db.get(ts_id)
                if ts:
                    self._send_json(ts)
                else:
                    self._send_error(404, "Texture set not found")
            
            # GET /files/{id} or /files/{id}/download - download file
            elif re.match(r'^/files/\d+(/download)?$', path):
                parts = path.split('/')
                file_id = int(parts[2])
                file_data = self.files_db.get(file_id)
                if file_data:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/octet-stream')
                    self.send_header('Content-Length', len(file_data))
                    self.end_headers()
                    self.wfile.write(file_data)
                else:
                    self._send_error(404, "File not found")
            
            else:
                self._send_error(404, f"Unknown GET endpoint: {path}")
                
        except Exception as e:
            self._send_error(500, str(e))
    
    def do_POST(self):
        """Handle POST requests."""
        parsed = urlparse(self.path)
        path = self._normalize_path(parsed.path)
        cls = MockModelibrHandler  # Use class explicitly for shared state
        
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''
            
            # POST /models - create new model
            if path == '/models':
                model_id = cls.next_id
                cls.next_id += 1
                
                cls.models_db[model_id] = {
                    "id": model_id,
                    "name": f"Model {model_id}",
                    "activeVersionId": model_id,
                }
                
                # Create first version
                cls.versions_db[model_id] = {
                    "id": model_id,
                    "modelId": model_id,
                    "versionNumber": 1,
                    "files": [{"id": model_id, "originalFileName": "uploaded.glb"}],
                }
                
                cls.files_db[model_id] = body
                self._send_json({"id": model_id, "modelId": model_id})
            
            # POST /models/{id}/versions - create new version
            elif re.match(r'^/models/\d+/versions', path):
                parts = path.split('/')
                model_id = int(parts[2])
                
                version_id = cls.next_id
                cls.next_id += 1
                
                existing_versions = [v for v in cls.versions_db.values() 
                                    if v.get('modelId') == model_id]
                
                cls.versions_db[version_id] = {
                    "id": version_id,
                    "modelId": model_id,
                    "versionNumber": len(existing_versions) + 1,
                    "files": [{"id": version_id, "originalFileName": "uploaded.glb"}],
                }
                
                cls.files_db[version_id] = body
                self._send_json({"id": version_id})
            
            # POST /texture-sets - create texture set
            elif path == '/texture-sets':
                ts_id = cls.next_id
                cls.next_id += 1
                
                cls.texture_sets_db[ts_id] = {
                    "id": ts_id,
                    "name": "Uploaded Textures",
                    "textures": [],
                }
                
                self._send_json({"textureSetId": ts_id})
            
            # POST /texture-sets/with-file - create texture set with file
            elif path == '/texture-sets/with-file':
                ts_id = cls.next_id
                cls.next_id += 1
                
                cls.texture_sets_db[ts_id] = {
                    "id": ts_id,
                    "name": "Uploaded Textures",
                    "textures": [],
                }
                
                self._send_json({"textureSetId": ts_id})
            
            # POST /models/{id}/versions/{vid}/files - add file to version
            elif re.match(r'^/models/\d+/versions/\d+/files$', path):
                file_id = cls.next_id
                cls.next_id += 1
                cls.files_db[file_id] = body
                self._send_json({"id": file_id})
            
            else:
                self._send_error(404, f"Unknown POST endpoint: {path}")
                
        except Exception as e:
            self._send_error(500, str(e))
    
    def do_PUT(self):
        """Handle PUT requests."""
        self._send_json({"success": True})
    
    def _send_json(self, data):
        """Send JSON response."""
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
    
    def _send_error(self, code, message):
        """Send error response."""
        body = json.dumps({"error": message}).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


class MockServer:
    """Context manager for running mock server."""
    
    def __init__(self, port: int = 0):
        self.port = port
        self.server = None
        self.thread = None
    
    def __enter__(self):
        MockModelibrHandler.reset()
        self.server = http.server.HTTPServer(('localhost', self.port), MockModelibrHandler)
        self.port = self.server.server_address[1]
        
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        
        return self
    
    def __exit__(self, *args):
        if self.server:
            self.server.shutdown()
    
    @property
    def url(self):
        return f"http://localhost:{self.port}"
    
    def add_model(self, model_id: int, name: str, **kwargs):
        """Add a test model."""
        MockModelibrHandler.models_db[model_id] = {
            "id": model_id,
            "name": name,
            **kwargs
        }
    
    def add_version(self, version_id: int, model_id: int, files=None, **kwargs):
        """Add a test version."""
        MockModelibrHandler.versions_db[version_id] = {
            "id": version_id,
            "modelId": model_id,
            "files": files or [],
            **kwargs
        }
    
    def add_file(self, file_id: int, content: bytes):
        """Add a test file."""
        MockModelibrHandler.files_db[file_id] = content


if __name__ == '__main__':
    print("Starting mock Modelibr server...")
    with MockServer(port=5555) as server:
        print(f"Server running at {server.url}")
        print("Press Ctrl+C to stop")
        try:
            while True:
                pass
        except KeyboardInterrupt:
            print("\nShutting down...")

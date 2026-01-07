"""
API client for communicating with the Modelibr server.
Provides methods for fetching models, uploading files, and managing texture sets.
"""
import json
import os
from urllib import request, error, parse
from typing import Optional, List, Dict, Any

from .config import API_READ_TIMEOUT, API_UPLOAD_TIMEOUT, API_DOWNLOAD_TIMEOUT
from .exceptions import ApiError, ConnectionError, AuthenticationError


class ModelibrApiClient:
    """HTTP client for the Modelibr REST API."""
    
    def __init__(self, server_url: str, api_key: str = ""):
        """
        Initialize the API client.
        
        Args:
            server_url: Base URL of the Modelibr server
            api_key: Optional API key for authentication
        """
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.read_timeout = API_READ_TIMEOUT
        self.upload_timeout = API_UPLOAD_TIMEOUT
        self.download_timeout = API_DOWNLOAD_TIMEOUT


    def _get_headers(self) -> dict:
        headers = {
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _make_request(self, method: str, endpoint: str, data: Optional[bytes] = None,
                      content_type: Optional[str] = None, timeout: Optional[int] = None) -> dict:
        url = f"{self.server_url}{endpoint}"
        headers = self._get_headers()
        if content_type:
            headers["Content-Type"] = content_type

        req = request.Request(url, data=data, headers=headers, method=method)
        request_timeout = timeout if timeout else self.read_timeout

        try:
            with request.urlopen(req, timeout=request_timeout) as response:
                response_data = response.read().decode('utf-8')
                if response_data:
                    return json.loads(response_data)
                return {}
        except error.HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else str(e)
            raise ApiError(f"HTTP {e.code}: {error_body}", e.code)
        except error.URLError as e:
            raise ApiError(f"Connection error: {e.reason}")

    def _download_file(self, endpoint: str, target_path: str) -> str:
        """Download a file from the API to a local path."""
        url = f"{self.server_url}{endpoint}"
        headers = self._get_headers()

        req = request.Request(url, headers=headers, method="GET")

        try:
            with request.urlopen(req, timeout=self.download_timeout) as response:
                with open(target_path, 'wb') as f:
                    while chunk := response.read(8192):
                        f.write(chunk)
                return target_path
        except error.HTTPError as e:
            raise ApiError(f"HTTP {e.code}: Failed to download file", e.code)
        except error.URLError as e:
            raise ApiError(f"Connection error: {e.reason}")

    def _upload_file(self, endpoint: str, file_path: str, 
                     additional_fields: Optional[dict] = None) -> dict:
        # Verify file exists before attempting upload
        if not os.path.exists(file_path):
            raise ApiError(f"File not found: {file_path}")
        if os.path.getsize(file_path) <= 0:
            raise ApiError(f"File is empty: {file_path}")
        
        boundary = '----WebKitFormBoundary' + os.urandom(16).hex()
        headers = self._get_headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

        body = b''
        filename = os.path.basename(file_path)

        # Add file field
        body += f'--{boundary}\r\n'.encode()
        body += f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
        body += b'Content-Type: application/octet-stream\r\n\r\n'
        with open(file_path, 'rb') as f:
            body += f.read()
        body += b'\r\n'

        # Add additional fields
        if additional_fields:
            for key, value in additional_fields.items():
                if value is not None:
                    body += f'--{boundary}\r\n'.encode()
                    body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
                    body += str(value).encode()
                    body += b'\r\n'

        body += f'--{boundary}--\r\n'.encode()

        url = f"{self.server_url}{endpoint}"
        req = request.Request(url, data=body, headers=headers, method="POST")

        try:
            with request.urlopen(req, timeout=self.upload_timeout) as response:
                response_data = response.read().decode('utf-8')
                if response_data:
                    return json.loads(response_data)
                return {}
        except error.HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else str(e)
            raise ApiError(f"HTTP {e.code}: {error_body}", e.code)
        except error.URLError as e:
            raise ApiError(f"Connection error: {e.reason}")

    def get_models(self, search: str = "") -> list:
        endpoint = "/models"
        if search:
            endpoint += f"?search={parse.quote(search)}"
        result = self._make_request("GET", endpoint)
        return result if isinstance(result, list) else []

    def get_model(self, model_id: int) -> dict:
        return self._make_request("GET", f"/models/{model_id}")

    def get_model_versions(self, model_id: int) -> list:
        result = self._make_request("GET", f"/models/{model_id}/versions")
        return result if isinstance(result, list) else []

    def get_model_version(self, model_id: int, version_id: int) -> dict:
        return self._make_request("GET", f"/models/{model_id}/versions/{version_id}")

    def download_file(self, file_id: int, target_dir: str, filename: str = "") -> str:
        if not filename:
            filename = f"file_{file_id}"
        target_path = os.path.join(target_dir, filename)
        return self._download_file(f"/files/{file_id}", target_path)

    def download_thumbnail(self, model_id: int, target_dir: str) -> str:
        target_path = os.path.join(target_dir, f"thumbnail_{model_id}.png")
        return self._download_file(f"/models/{model_id}/thumbnail/file", target_path)

    def create_model(self, file_path: str) -> dict:
        return self._upload_file("/models", file_path)

    def create_version(self, model_id: int, file_path: str, 
                       description: str = "", set_as_active: bool = True) -> dict:
        # Add setAsActive as query parameter (must be in query string, not form data)
        query_params = parse.urlencode({"setAsActive": str(set_as_active).lower()})
        endpoint = f"/models/{model_id}/versions?{query_params}"
        return self._upload_file(
            endpoint,
            file_path,
            {
                "description": description,
            }
        )

    def add_file_to_version(self, model_id: int, version_id: int, file_path: str) -> dict:
        return self._upload_file(
            f"/models/{model_id}/versions/{version_id}/files",
            file_path
        )

    def test_connection(self) -> bool:
        try:
            self.get_models()
            return True
        except ApiError:
            return False

    # Texture Set API Methods
    
    def get_texture_set(self, texture_set_id: int) -> dict:
        """
        Fetch a texture set by ID with all its textures.
        
        Returns dict with keys: id, name, createdAt, updatedAt, textureCount, isEmpty,
        textures (list of {id, textureType, fileId, fileName, createdAt})
        """
        return self._make_request("GET", f"/texture-sets/{texture_set_id}")

    def create_texture_set_with_file(self, file_path: str, name: str, 
                                     texture_type: str = "Albedo") -> dict:
        """
        Create a new texture set with an initial texture file.
        
        Args:
            file_path: Path to the texture file
            name: Name for the texture set
            texture_type: Type of texture (Albedo, Normal, Roughness, Metallic, etc.)
        
        Returns dict with keys: textureSetId, textureId, fileId
        """
        return self._upload_file(
            "/texture-sets/with-file",
            file_path,
            {
                "name": name,
                "textureType": texture_type,
            }
        )

    def add_texture_to_set(self, texture_set_id: int, file_id: int, 
                           texture_type: str = "Albedo",
                           source_channel: int = 0) -> dict:
        """
        Add an existing file as a texture to a texture set.
        
        Args:
            texture_set_id: ID of the texture set
            file_id: ID of the file to add as texture
            texture_type: Type of texture
            source_channel: Source channel (0=RGB, 1=R, 2=G, 3=B, 4=A)
        """
        payload = {
            "fileId": file_id, 
            "textureType": texture_type,
        }
        if source_channel != 0:
            payload["sourceChannel"] = source_channel
            
        return self._make_request(
            "POST",
            f"/texture-sets/{texture_set_id}/textures",
            data=json.dumps(payload).encode('utf-8'),
            content_type="application/json"
        )

    def associate_texture_set_with_version(self, texture_set_id: int, 
                                           model_version_id: int) -> None:
        """
        Associate a texture set with a model version.
        """
        self._make_request(
            "POST",
            f"/texture-sets/{texture_set_id}/model-versions/{model_version_id}"
        )

    def disassociate_texture_set_from_version(self, texture_set_id: int,
                                               model_version_id: int) -> None:
        """
        Remove association between a texture set and a model version.
        """
        self._make_request(
            "DELETE",
            f"/texture-sets/{texture_set_id}/model-versions/{model_version_id}"
        )

    def set_default_texture_set(self, model_id: int, texture_set_id: Optional[int],
                                 model_version_id: int) -> dict:
        """
        Set a texture set as the default for a model version.
        
        Args:
            model_id: ID of the model
            texture_set_id: ID of the texture set to set as default (or None to clear)
            model_version_id: ID of the model version
        """
        return self._make_request(
            "PUT",
            f"/models/{model_id}/defaultTextureSet",
            data=json.dumps({
                "textureSetId": texture_set_id,
                "modelVersionId": model_version_id
            }).encode('utf-8'),
            content_type="application/json"
        )

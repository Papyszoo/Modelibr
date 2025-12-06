import json
import os
import tempfile
from urllib import request, error, parse
from typing import Optional
from http.client import HTTPResponse


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class ModelibrApiClient:
    def __init__(self, server_url: str, api_key: str = ""):
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.read_timeout = 10  # Shorter timeout for read operations
        self.upload_timeout = 300  # Longer timeout for uploads

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
        url = f"{self.server_url}{endpoint}"
        headers = self._get_headers()

        req = request.Request(url, headers=headers, method="GET")

        try:
            with request.urlopen(req, timeout=120) as response:
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
        target_path = os.path.join(target_dir, f"thumbnail_{model_id}.webp")
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

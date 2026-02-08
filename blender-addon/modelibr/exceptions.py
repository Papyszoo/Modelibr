"""
Custom exceptions for the Modelibr Blender addon.
Provides a hierarchy of exceptions for better error handling and user feedback.
"""
from typing import Optional


class ModelibrError(Exception):
    """
    Base exception for all Modelibr addon errors.
    
    Attributes:
        message: Human-readable error message
        details: Optional additional details for debugging
    """
    
    def __init__(self, message: str, details: Optional[str] = None):
        self.message = message
        self.details = details
        super().__init__(message)
    
    def __str__(self) -> str:
        if self.details:
            return f"{self.message} ({self.details})"
        return self.message


class ConnectionError(ModelibrError):
    """
    Raised when connection to the Modelibr server fails.
    
    Examples:
        - Server is not running
        - Network is unavailable
        - DNS resolution failed
    """
    
    def __init__(self, message: str = "Failed to connect to server", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class AuthenticationError(ModelibrError):
    """
    Raised when API authentication fails.
    
    Examples:
        - Invalid API key
        - Expired credentials
        - Missing authorization header
    """
    
    def __init__(self, message: str = "Authentication failed", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class ApiError(ModelibrError):
    """
    Raised when the API returns an error response.
    
    Attributes:
        status_code: HTTP status code from the response
    """
    
    def __init__(self, message: str, status_code: int = 0, 
                 details: Optional[str] = None):
        self.status_code = status_code
        super().__init__(message, details)
    
    def __str__(self) -> str:
        base = f"HTTP {self.status_code}: {self.message}" if self.status_code else self.message
        if self.details:
            return f"{base} ({self.details})"
        return base


class NotFoundError(ApiError):
    """
    Raised when a requested resource is not found (404).
    """
    
    def __init__(self, resource_type: str, resource_id: int,
                 details: Optional[str] = None):
        message = f"{resource_type} with ID {resource_id} not found"
        super().__init__(message, status_code=404, details=details)
        self.resource_type = resource_type
        self.resource_id = resource_id


class ModelImportError(ModelibrError):
    """
    Raised when model import fails.
    
    Examples:
        - Unsupported file format
        - Corrupted file
        - Blender import operator failed
    """
    
    def __init__(self, message: str = "Failed to import model", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class ExportError(ModelibrError):
    """
    Raised when model export fails.
    
    Examples:
        - Export operator failed
        - File system error
        - Invalid export format
    """
    
    def __init__(self, message: str = "Failed to export model", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class UploadError(ModelibrError):
    """
    Raised when file upload fails.
    
    Examples:
        - Upload timeout
        - File too large
        - Server rejected the file
    """
    
    def __init__(self, message: str = "Failed to upload file", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class TextureError(ModelibrError):
    """
    Raised when texture operations fail.
    
    Examples:
        - Texture file not found
        - Failed to apply texture to material
        - Unsupported texture format
    """
    
    def __init__(self, message: str = "Texture operation failed", 
                 details: Optional[str] = None):
        super().__init__(message, details)


class ConfigurationError(ModelibrError):
    """
    Raised when addon configuration is invalid.
    
    Examples:
        - Invalid server URL
        - Missing required preference
    """
    
    def __init__(self, message: str = "Invalid configuration", 
                 details: Optional[str] = None):
        super().__init__(message, details)

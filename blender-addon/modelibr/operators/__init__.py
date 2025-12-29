"""
Operators package for the Modelibr Blender addon.

This package contains all Blender operators, split into modules:
- import_ops: Model import operators
- upload_ops: Version and model upload operators  
- context_ops: Model context management operators
- utility_ops: Connection testing and refresh operators
- common: Shared utilities used across operators
"""

from . import import_ops
from . import upload_ops
from . import context_ops
from . import utility_ops

# Re-export commonly used items
from .common import get_api_client, sanitize_filename, debug_log, extract_id


def register() -> None:
    """Register all operator modules."""
    import_ops.register()
    upload_ops.register()
    context_ops.register()
    utility_ops.register()


def unregister() -> None:
    """Unregister all operator modules in reverse order."""
    utility_ops.unregister()
    context_ops.unregister()
    upload_ops.unregister()
    import_ops.unregister()

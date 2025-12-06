import bpy
import sys
import os
from urllib.parse import urlparse, parse_qs

from .api_client import ModelibrApiClient, ApiError
from .preferences import get_preferences


def parse_modelibr_uri(uri: str) -> dict:
    """
    Parse a modelibr:// URI and extract parameters.
    
    Format: modelibr://open?modelId=123&versionId=456
    """
    if not uri.startswith("modelibr://"):
        return {}
    
    parsed = urlparse(uri)
    params = parse_qs(parsed.query)
    
    result = {}
    if 'modelId' in params:
        try:
            result['model_id'] = int(params['modelId'][0])
        except (ValueError, IndexError):
            pass
    
    if 'versionId' in params:
        try:
            result['version_id'] = int(params['versionId'][0])
        except (ValueError, IndexError):
            pass
    
    return result


def handle_uri_on_startup():
    """
    Check command line arguments for modelibr:// URI and handle it.
    Called on Blender startup.
    """
    for arg in sys.argv:
        if arg.startswith("modelibr://"):
            params = parse_modelibr_uri(arg)
            if params.get('model_id'):
                # Schedule the operation to run after Blender is fully loaded
                bpy.app.timers.register(
                    lambda: set_model_context_from_uri(params),
                    first_interval=0.5,
                )
            break


def set_model_context_from_uri(params: dict) -> None:
    """
    Set the scene's model context based on URI parameters.
    This is called after Blender is fully initialized.
    """
    try:
        prefs = get_preferences()
        client = ModelibrApiClient(prefs.server_url, prefs.api_key)
        
        model_id = params.get('model_id', 0)
        version_id = params.get('version_id', 0)
        
        if model_id > 0:
            # Fetch model details
            model = client.get_model(model_id)
            
            # Set scene properties
            scene = bpy.context.scene
            scene.modelibr.current_model_id = model_id
            scene.modelibr.current_model_name = model.get('name', f'Model #{model_id}')
            
            if version_id > 0:
                scene.modelibr.current_version_id = version_id
            elif model.get('activeVersionId'):
                scene.modelibr.current_version_id = model.get('activeVersionId')
            
            print(f"[Modelibr] Set model context: {model.get('name', '')} (ID: {model_id})")
            
    except ApiError as e:
        print(f"[Modelibr] Failed to set model context: {e}")
    except Exception as e:
        print(f"[Modelibr] Unexpected error: {e}")


@bpy.app.handlers.persistent
def load_handler(dummy):
    """
    Handler called when a new file is loaded.
    Preserves model context if the file was associated with a model.
    """
    pass


def register():
    bpy.app.handlers.load_post.append(load_handler)
    
    # Handle URI on startup
    handle_uri_on_startup()


def unregister():
    if load_handler in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(load_handler)

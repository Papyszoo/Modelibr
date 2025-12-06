"""
Thumbnail caching and preview management for Modelibr
"""

import bpy
import os
import tempfile
from pathlib import Path
from .api_client import ModelibrApiClient, ApiError


class ThumbnailCache:
    """Manages thumbnail downloads and caching"""
    
    def __init__(self):
        self.cache_dir = Path(tempfile.gettempdir()) / "modelibr_thumbnails"
        self.cache_dir.mkdir(exist_ok=True)
    
    def get_thumbnail_path(self, model_id: int) -> Path:
        """Get the cached thumbnail path for a model"""
        return self.cache_dir / f"model_{model_id}.webp"
    
    def has_thumbnail(self, model_id: int) -> bool:
        """Check if thumbnail is cached"""
        path = self.get_thumbnail_path(model_id)
        return path.exists() and path.stat().st_size > 0
    
    def download_thumbnail(self, client: ModelibrApiClient, model_id: int) -> str:
        """Download thumbnail for a model"""
        try:
            target_path = str(self.get_thumbnail_path(model_id))
            return client.download_thumbnail(model_id, str(self.cache_dir))
        except ApiError:
            return ""
    
    def get_or_download(self, client: ModelibrApiClient, model_id: int) -> str:
        """Get thumbnail from cache or download if not present"""
        if self.has_thumbnail(model_id):
            return str(self.get_thumbnail_path(model_id))
        return self.download_thumbnail(client, model_id)
    
    def clear_cache(self):
        """Clear all cached thumbnails"""
        for file in self.cache_dir.glob("*.webp"):
            try:
                file.unlink()
            except Exception:
                pass


# Global thumbnail cache instance
_thumbnail_cache = None


def get_thumbnail_cache() -> ThumbnailCache:
    """Get the global thumbnail cache instance"""
    global _thumbnail_cache
    if _thumbnail_cache is None:
        _thumbnail_cache = ThumbnailCache()
    return _thumbnail_cache


def load_thumbnail_preview(model_id: int, thumbnail_path: str) -> None:
    """Load a thumbnail into Blender's preview collection"""
    if not thumbnail_path or not os.path.exists(thumbnail_path):
        return
    
    # Get or create preview collection
    pcoll = get_preview_collection()
    
    # Load thumbnail if not already loaded
    key = f"model_{model_id}"
    if key not in pcoll:
        try:
            pcoll.load(key, thumbnail_path, 'IMAGE')
        except Exception as e:
            print(f"Failed to load thumbnail for model {model_id}: {e}")


def get_preview_collection():
    """Get or create the preview collection for thumbnails"""
    import bpy.utils.previews
    
    # Store preview collection in window manager
    wm = bpy.context.window_manager
    if not hasattr(wm, "modelibr_previews"):
        pcoll = bpy.utils.previews.new()
        wm.modelibr_previews = pcoll
    return wm.modelibr_previews


def clear_preview_collection():
    """Clear all previews from the collection"""
    wm = bpy.context.window_manager
    if hasattr(wm, "modelibr_previews"):
        bpy.utils.previews.remove(wm.modelibr_previews)
        del wm.modelibr_previews


def register():
    """Register thumbnail system"""
    pass


def unregister():
    """Unregister thumbnail system"""
    try:
        clear_preview_collection()
    except Exception:
        pass

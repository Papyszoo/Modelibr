"""
Thumbnail handler module for animated WebP thumbnails.
Handles thumbnail loading, caching, and animation on hover.
"""

import bpy
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional


class AnimatedThumbnail:
    """Handle animated WebP thumbnails with hover detection"""
    
    def __init__(self, model_id: int, thumbnail_url: str):
        """
        Initialize an animated thumbnail handler.
        
        Args:
            model_id: Model ID from Modelibr
            thumbnail_url: URL to download thumbnail from
        """
        self.model_id = model_id
        self.thumbnail_url = thumbnail_url
        self.frames = []
        self.current_frame = 0
        self.is_animating = False
        self.temp_dir = None
        self.thumbnail_path = None
        self.preview_id = None
    
    def load(self, api_client, preview_collection) -> bool:
        """
        Download and prepare thumbnail.
        
        Args:
            api_client: ModelibrApiClient instance for downloading
            preview_collection: Blender preview collection to add icon to
            
        Returns:
            True if thumbnail loaded successfully, False otherwise
        """
        try:
            # Create temp directory if needed
            if not self.temp_dir:
                self.temp_dir = Path(tempfile.gettempdir()) / "modelibr_thumbnails"
                self.temp_dir.mkdir(exist_ok=True)
            
            # Download thumbnail
            print(f"[Modelibr] Downloading thumbnail for model {self.model_id}...")
            self.thumbnail_path = api_client.download_thumbnail(
                self.model_id,
                str(self.temp_dir)
            )
            
            print(f"[Modelibr] Thumbnail path: {self.thumbnail_path}, exists: {os.path.exists(self.thumbnail_path)}")
            
            if not os.path.exists(self.thumbnail_path):
                print(f"[Modelibr] Thumbnail file does not exist at {self.thumbnail_path}")
                return False
            
            # Load into Blender's image data blocks for better compatibility with WebP
            image_name = f"modelibr_thumb_{self.model_id}"
            
            # Check if image already loaded
            if image_name in bpy.data.images:
                img = bpy.data.images[image_name]
                # Reload if path changed
                if img.filepath != self.thumbnail_path:
                    img.filepath = self.thumbnail_path
                    img.reload()
            else:
                # Load new image
                print(f"[Modelibr] Loading image into bpy.data.images: {self.thumbnail_path}")
                img = bpy.data.images.load(self.thumbnail_path, check_existing=True)
                img.name = image_name
                print(f"[Modelibr] Image loaded successfully: {img.name}")
            
            # Also load into preview collection for icon display
            preview_id = f"modelibr_thumb_{self.model_id}"
            if preview_id not in preview_collection:
                try:
                    print(f"[Modelibr] Loading into preview collection: {preview_id}")
                    # Force reload the preview to ensure it's loaded properly
                    preview_collection.load(preview_id, self.thumbnail_path, 'IMAGE', force_reload=True)
                except TypeError:
                    # Older Blender versions don't have force_reload parameter
                    preview_collection.load(preview_id, self.thumbnail_path, 'IMAGE')
            
            # Verify the preview was loaded successfully
            if preview_id in preview_collection:
                preview = preview_collection[preview_id]
                print(f"[Modelibr] Preview loaded: {preview_id}, icon_id={preview.icon_id}")
            else:
                print(f"[Modelibr] WARNING: Preview {preview_id} not found in collection after load!")
            
            self.preview_id = preview_id
            print(f"[Modelibr] Successfully loaded thumbnail for model {self.model_id}, preview_id: {self.preview_id}")
            return True
            
        except Exception as e:
            print(f"[Modelibr] Error loading thumbnail for model {self.model_id}: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_preview_id(self) -> Optional[str]:
        """
        Get the preview ID for use in UI.
        
        Returns:
            Preview ID string or None if not loaded
        """
        return self.preview_id
    
    def start_animation(self):
        """Start cycling through frames (called on hover)"""
        # Note: For initial implementation, we'll use static thumbnails
        # Animation can be added later if API provides multi-frame WebP
        self.is_animating = True
    
    def stop_animation(self):
        """Stop animation (called on hover end)"""
        self.is_animating = False
        self.current_frame = 0
    
    def cleanup(self):
        """Clean up temporary files and image data"""
        try:
            # Remove image from bpy.data.images
            image_name = f"modelibr_thumb_{self.model_id}"
            if image_name in bpy.data.images:
                bpy.data.images.remove(bpy.data.images[image_name])
            
            # Remove temporary file
            if self.thumbnail_path and os.path.exists(self.thumbnail_path):
                os.remove(self.thumbnail_path)
        except Exception:
            pass


class ThumbnailManager:
    """Manage all thumbnails for browse window"""
    
    def __init__(self):
        """Initialize thumbnail manager"""
        self.thumbnails: Dict[int, AnimatedThumbnail] = {}
        self.preview_collection = None
    
    def initialize(self):
        """Initialize preview collection"""
        if not self.preview_collection:
            self.preview_collection = bpy.utils.previews.new()
    
    def load_thumbnail(self, model_id: int, thumbnail_url: str, api_client) -> Optional[AnimatedThumbnail]:
        """
        Load a thumbnail for a model.
        
        Args:
            model_id: Model ID from Modelibr
            thumbnail_url: URL to download thumbnail from
            api_client: API client for downloading
            
        Returns:
            AnimatedThumbnail instance or None if loading failed
        """
        print(f"[Modelibr ThumbnailManager] load_thumbnail called for model {model_id}")
        
        if model_id in self.thumbnails:
            print(f"[Modelibr ThumbnailManager] Thumbnail already loaded for model {model_id}")
            return self.thumbnails[model_id]
        
        print(f"[Modelibr ThumbnailManager] Creating new AnimatedThumbnail for model {model_id}")
        thumbnail = AnimatedThumbnail(model_id, thumbnail_url)
        
        print(f"[Modelibr ThumbnailManager] Calling thumbnail.load() for model {model_id}")
        load_success = thumbnail.load(api_client, self.preview_collection)
        print(f"[Modelibr ThumbnailManager] thumbnail.load() returned: {load_success}")
        
        if load_success:
            self.thumbnails[model_id] = thumbnail
            print(f"[Modelibr ThumbnailManager] Thumbnail stored in manager for model {model_id}")
            return thumbnail
        else:
            print(f"[Modelibr ThumbnailManager] Thumbnail loading FAILED for model {model_id}")
        
        return None
    
    def get_thumbnail(self, model_id: int) -> Optional[AnimatedThumbnail]:
        """
        Get a loaded thumbnail.
        
        Args:
            model_id: Model ID
            
        Returns:
            AnimatedThumbnail instance or None if not loaded
        """
        return self.thumbnails.get(model_id)
    
    def cleanup(self):
        """Clean up all thumbnails and preview collection"""
        for thumbnail in self.thumbnails.values():
            thumbnail.cleanup()
        
        self.thumbnails.clear()
        
        if self.preview_collection:
            bpy.utils.previews.remove(self.preview_collection)
            self.preview_collection = None


# Global thumbnail manager instance
_thumbnail_manager: Optional[ThumbnailManager] = None


def get_thumbnail_manager() -> ThumbnailManager:
    """
    Get the global thumbnail manager instance.
    
    Returns:
        ThumbnailManager instance
    """
    global _thumbnail_manager
    if _thumbnail_manager is None:
        _thumbnail_manager = ThumbnailManager()
        _thumbnail_manager.initialize()
    return _thumbnail_manager


def cleanup_thumbnail_manager():
    """Clean up the global thumbnail manager"""
    global _thumbnail_manager
    if _thumbnail_manager:
        _thumbnail_manager.cleanup()
        _thumbnail_manager = None

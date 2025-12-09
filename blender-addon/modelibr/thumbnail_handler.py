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
    
    def __init__(self, thumbnail_key, thumbnail_url: str):
        """
        Initialize an animated thumbnail handler.
        
        Args:
            thumbnail_key: Unique key for this thumbnail (can be model_id or model_id_vversion_id)
            thumbnail_url: URL to download thumbnail from
        """
        self.thumbnail_key = thumbnail_key
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
            print(f"[Modelibr] Downloading thumbnail for key {self.thumbnail_key}...")
            
            # Check if URL is a direct endpoint path or a full URL
            if self.thumbnail_url.startswith('/'):
                # It's an API endpoint - use direct download
                downloaded_path = api_client._download_file(
                    self.thumbnail_url,
                    str(self.temp_dir / f"thumbnail_{self.thumbnail_key}.webp")
                )
            else:
                # Legacy support - for old code that passes model_id directly
                # Extract numeric model_id from thumbnail_key
                try:
                    # If thumbnail_key is "123_v456", extract 123
                    if isinstance(self.thumbnail_key, str) and '_v' in self.thumbnail_key:
                        model_id = int(self.thumbnail_key.split('_v')[0])
                    else:
                        model_id = int(self.thumbnail_key)
                    downloaded_path = api_client.download_thumbnail(model_id, str(self.temp_dir))
                except (ValueError, AttributeError) as e:
                    raise ValueError(f"Invalid thumbnail_key format: {self.thumbnail_key}. Expected model_id or 'model_id_v{{version_id}}'")
            
            print(f"[Modelibr] Downloaded thumbnail path: {downloaded_path}, exists: {os.path.exists(downloaded_path)}")
            
            if not os.path.exists(downloaded_path):
                print(f"[Modelibr] Thumbnail file does not exist at {downloaded_path}")
                return False
            
            # Convert WebP to PNG for better Blender compatibility
            # WebP decoding can fail in some Blender versions, so we convert to PNG
            png_path = downloaded_path.replace('.webp', '.png')
            
            try:
                # Load WebP using Blender and save as PNG
                print(f"[Modelibr] Converting WebP to PNG for compatibility...")
                temp_img = bpy.data.images.load(downloaded_path, check_existing=False)
                
                # Save as PNG
                temp_img.filepath_raw = png_path
                temp_img.file_format = 'PNG'
                temp_img.save()
                
                # Remove temporary image from Blender
                bpy.data.images.remove(temp_img)
                
                # Use PNG path for preview collection
                self.thumbnail_path = png_path
                print(f"[Modelibr] Converted to PNG: {png_path}")
                
            except Exception as conv_error:
                print(f"[Modelibr] WebP conversion failed: {conv_error}")
                print(f"[Modelibr] Trying to use WebP directly...")
                # Fall back to using WebP directly if conversion fails
                self.thumbnail_path = downloaded_path
            
            # Load into Blender's image data blocks
            image_name = f"modelibr_thumb_{self.thumbnail_key}"
            
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
            preview_id = f"modelibr_thumb_{self.thumbnail_key}"
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
            print(f"[Modelibr] Successfully loaded thumbnail for key {self.thumbnail_key}, preview_id: {self.preview_id}")
            return True
            
        except Exception as e:
            print(f"[Modelibr] Error loading thumbnail for key {self.thumbnail_key}: {e}")
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
            image_name = f"modelibr_thumb_{self.thumbnail_key}"
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
        self.thumbnails: Dict[str, AnimatedThumbnail] = {}  # Changed to string key
        self.preview_collection = None
    
    def initialize(self):
        """Initialize preview collection"""
        if not self.preview_collection:
            self.preview_collection = bpy.utils.previews.new()
    
    def load_thumbnail(self, thumbnail_key, thumbnail_url: str, api_client) -> Optional[AnimatedThumbnail]:
        """
        Load a thumbnail for a model.
        
        Args:
            thumbnail_key: Unique key for this thumbnail (can be model_id or "model_id_vversion_id")
            thumbnail_url: URL to download thumbnail from
            api_client: API client for downloading
            
        Returns:
            AnimatedThumbnail instance or None if loading failed
        """
        print(f"[Modelibr ThumbnailManager] load_thumbnail called for key {thumbnail_key}")
        
        if thumbnail_key in self.thumbnails:
            print(f"[Modelibr ThumbnailManager] Thumbnail already loaded for key {thumbnail_key}")
            return self.thumbnails[thumbnail_key]
        
        print(f"[Modelibr ThumbnailManager] Creating new AnimatedThumbnail for key {thumbnail_key}")
        thumbnail = AnimatedThumbnail(thumbnail_key, thumbnail_url)
        
        print(f"[Modelibr ThumbnailManager] Calling thumbnail.load() for key {thumbnail_key}")
        load_success = thumbnail.load(api_client, self.preview_collection)
        print(f"[Modelibr ThumbnailManager] thumbnail.load() returned: {load_success}")
        
        if load_success:
            self.thumbnails[thumbnail_key] = thumbnail
            print(f"[Modelibr ThumbnailManager] Thumbnail stored in manager for key {thumbnail_key}")
            return thumbnail
        else:
            print(f"[Modelibr ThumbnailManager] Thumbnail loading FAILED for key {thumbnail_key}")
        
        return None
    
    def get_thumbnail(self, thumbnail_key) -> Optional[AnimatedThumbnail]:
        """
        Get a loaded thumbnail.
        
        Args:
            thumbnail_key: Unique key for this thumbnail
            
        Returns:
            AnimatedThumbnail instance or None if not loaded
        """
        return self.thumbnails.get(thumbnail_key)
    
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

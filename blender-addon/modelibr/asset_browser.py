"""
Asset Browser integration for Modelibr.
Handles asset library registration, syncing from API, and asset creation.
"""

import bpy
import os
import tempfile
import json
from pathlib import Path
from typing import Optional, Dict, List


class AssetLibraryHandler:
    """Manages the Modelibr asset library and asset creation."""
    
    LIBRARY_NAME = "Modelibr"
    
    @staticmethod
    def get_library_path() -> Path:
        """Get the path to the Modelibr asset library."""
        # Use Blender's user data directory
        user_path = Path(bpy.utils.resource_path('USER'))
        library_path = user_path / "modelibr_assets"
        return library_path
    
    @staticmethod
    def ensure_library_exists() -> bool:
        """Ensure the asset library directory exists."""
        library_path = AssetLibraryHandler.get_library_path()
        try:
            library_path.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            print(f"[Modelibr] Failed to create library directory: {e}")
            return False
    
    @staticmethod
    def is_library_registered() -> bool:
        """Check if the Modelibr library is already registered."""
        if not hasattr(bpy.context.preferences, 'filepaths'):
            return False
        
        filepaths = bpy.context.preferences.filepaths
        if not hasattr(filepaths, 'asset_libraries'):
            return False
            
        for lib in filepaths.asset_libraries:
            if lib.name == AssetLibraryHandler.LIBRARY_NAME:
                return True
        return False
    
    @staticmethod
    def register_asset_library() -> tuple[bool, str]:
        """
        Register the Modelibr asset library in Blender preferences.
        Returns (success, message).
        """
        if AssetLibraryHandler.is_library_registered():
            return (True, "Asset library already registered")
        
        if not AssetLibraryHandler.ensure_library_exists():
            return (False, "Failed to create library directory")
        
        library_path = AssetLibraryHandler.get_library_path()
        
        try:
            # Add the library using Blender's operator
            bpy.ops.preferences.asset_library_add(directory=str(library_path))
            
            # Find and rename the newly added library
            filepaths = bpy.context.preferences.filepaths
            for lib in filepaths.asset_libraries:
                # The new library will have an empty name or default name
                if lib.path == str(library_path) or (not lib.name or lib.name.startswith("Library")):
                    lib.name = AssetLibraryHandler.LIBRARY_NAME
                    break
            
            # Save preferences
            bpy.ops.wm.save_userpref()
            
            return (True, f"Asset library registered at: {library_path}")
        except Exception as e:
            return (False, f"Failed to register library: {str(e)}")
    
    @staticmethod
    def get_model_asset_path(model_id: int, version_number: int = 1) -> Path:
        """Get the path where a model asset should be stored."""
        library_path = AssetLibraryHandler.get_library_path()
        model_dir = library_path / f"model_{model_id}"
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir / f"model_v{version_number}.blend"
    
    @staticmethod
    def get_thumbnail_path(model_id: int) -> Path:
        """Get the path where a model thumbnail should be stored."""
        library_path = AssetLibraryHandler.get_library_path()
        model_dir = library_path / f"model_{model_id}"
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir / "thumbnail.webp"
    
    @staticmethod
    def create_asset_blend(
        model_id: int,
        model_data: dict,
        version_data: dict,
        file_path: str,
        client
    ) -> tuple[bool, str]:
        """
        Create a .blend file with the model marked as an asset.
        
        Args:
            model_id: The model ID
            model_data: Model metadata from API
            version_data: Version metadata from API
            file_path: Path to the downloaded model file
            client: API client for downloading thumbnail
            
        Returns:
            (success, message)
        """
        imported_objects = []
        try:
            version_number = version_data.get('versionNumber', 1)
            asset_path = AssetLibraryHandler.get_model_asset_path(model_id, version_number)
            
            # Store current selection to restore later
            original_selection = list(bpy.context.selected_objects)
            
            # Import the model based on file extension
            ext = os.path.splitext(file_path)[1].lower()
            
            # Deselect all objects before import
            bpy.ops.object.select_all(action='DESELECT')
            
            if ext in ['.glb', '.gltf']:
                bpy.ops.import_scene.gltf(filepath=file_path)
            elif ext == '.fbx':
                bpy.ops.import_scene.fbx(filepath=file_path)
            elif ext == '.obj':
                # Blender 4.0+ uses wm.obj_import
                bpy.ops.wm.obj_import(filepath=file_path)
            elif ext == '.blend':
                # Import from blend file
                with bpy.data.libraries.load(file_path, link=False) as (data_from, data_to):
                    data_to.objects = data_from.objects
                for obj in data_to.objects:
                    if obj is not None:
                        bpy.context.collection.objects.link(obj)
                        obj.select_set(True)
            else:
                return (False, f"Unsupported file format: {ext}")
            
            # Get imported objects (should be selected after import)
            imported_objects = [obj for obj in bpy.context.selected_objects if obj]
            
            if not imported_objects:
                return (False, "No objects imported")
            
            # Mark objects as assets and add metadata
            for obj in imported_objects:
                AssetLibraryHandler.mark_object_as_asset(obj, model_data, version_data)
            
            # Download thumbnail
            # Note: Animated WebP thumbnails will display as static (first frame) in Blender's Asset Browser
            try:
                thumbnail_path = AssetLibraryHandler.get_thumbnail_path(model_id)
                client.download_thumbnail(model_id, str(thumbnail_path.parent), filename="thumbnail.webp")
                print(f"[Modelibr] Thumbnail downloaded to: {thumbnail_path}")
            except Exception as e:
                print(f"[Modelibr] Warning: Could not download thumbnail: {e}")
            
            # Write objects to a new .blend file as a library
            # This saves only the selected objects without affecting the current file
            data_blocks = set(imported_objects)
            
            # Also include any meshes, materials, etc. used by these objects
            for obj in imported_objects:
                if obj.data:
                    data_blocks.add(obj.data)
                for mat_slot in obj.material_slots:
                    if mat_slot.material:
                        data_blocks.add(mat_slot.material)
            
            # Write the data blocks to the asset file
            bpy.data.libraries.write(str(asset_path), data_blocks, path_remap='RELATIVE', fake_user=True)
            
            # Clean up: Remove imported objects from current scene
            for obj in imported_objects:
                bpy.data.objects.remove(obj, do_unlink=True)
            
            # Restore original selection
            for obj in original_selection:
                if obj and obj.name in bpy.data.objects:
                    obj.select_set(True)
            
            return (True, f"Asset created at: {asset_path}")
            
        except Exception as e:
            # Clean up imported objects on error
            for obj in imported_objects:
                try:
                    if obj and obj.name in bpy.data.objects:
                        bpy.data.objects.remove(obj, do_unlink=True)
                except:
                    pass
            return (False, f"Failed to create asset: {str(e)}")
    
    @staticmethod
    def mark_object_as_asset(obj, model_data: dict, version_data: dict):
        """Mark a Blender object as an asset with Modelibr metadata."""
        try:
            # Mark as asset (Blender 3.0+ API)
            if hasattr(obj, 'asset_mark'):
                obj.asset_mark()
            else:
                print("[Modelibr] Warning: asset_mark() not available in this Blender version")
                return
            
            # Set basic asset metadata
            if hasattr(obj, 'asset_data'):
                asset_data = obj.asset_data
                asset_data.description = model_data.get('description', '')
                
                # Add tags
                tags = model_data.get('tags', '')
                if tags:
                    for tag in tags.split(','):
                        tag = tag.strip()
                        if tag and hasattr(asset_data, 'tags'):
                            asset_data.tags.new(tag)
        except Exception as e:
            print(f"[Modelibr] Warning: Could not set asset metadata: {e}")
        
        # Store Modelibr-specific metadata as custom properties (always works)
        obj["modelibr_model_id"] = model_data.get('id', 0)
        obj["modelibr_version_id"] = version_data.get('id', 0)
        obj["modelibr_version_number"] = version_data.get('versionNumber', 1)
        obj["modelibr_asset_type"] = "MODEL"
        obj["modelibr_model_name"] = model_data.get('name', '')
        
        # Add description as ID property for better preservation
        if model_data.get('description'):
            obj["modelibr_description"] = model_data.get('description', '')
    
    @staticmethod
    def sync_assets_from_api(client, progress_callback=None) -> tuple[bool, str, int]:
        """
        Sync models from the Modelibr API to local asset library.
        
        IMPORTANT: This operation downloads ALL model files from the server and creates
        local .blend assets. This is designed for offline access but requires disk space
        for each model. For large collections, consider:
        - Syncing selectively (future enhancement)
        - Using the sidebar workflow which downloads models on-demand
        - Implementing lazy loading with placeholder assets (future enhancement)
        
        Args:
            client: ModelibrApiClient instance
            progress_callback: Optional callback function(current, total, message)
            
        Returns:
            (success, message, count) - count is number of assets synced
        """
        try:
            # Ensure library exists
            if not AssetLibraryHandler.ensure_library_exists():
                return (False, "Failed to create library directory", 0)
            
            # Fetch models from API
            models = client.get_models()
            
            if not models:
                return (True, "No models found on server", 0)
            
            synced_count = 0
            total = len(models)
            
            for idx, model_data in enumerate(models):
                model_id = model_data.get('id')
                if not model_id:
                    continue
                
                if progress_callback:
                    progress_callback(idx + 1, total, f"Syncing: {model_data.get('name', f'Model {model_id}')}")
                
                try:
                    # Get active version
                    versions = client.get_model_versions(model_id)
                    if not versions:
                        print(f"[Modelibr] No versions found for model {model_id}")
                        continue
                    
                    # Find active version
                    active_version_id = model_data.get('activeVersionId')
                    version = next(
                        (v for v in versions if v['id'] == active_version_id),
                        versions[-1]
                    )
                    
                    # Check if asset already exists
                    version_number = version.get('versionNumber', 1)
                    asset_path = AssetLibraryHandler.get_model_asset_path(model_id, version_number)
                    
                    if asset_path.exists():
                        # Asset already synced
                        print(f"[Modelibr] Asset already exists for model {model_id} version {version_number}, skipping")
                        synced_count += 1  # Count it as synced since it exists
                        continue
                    
                    # Get files for this version
                    files = version.get('files', [])
                    if not files:
                        print(f"[Modelibr] No files found for model {model_id} version {version_number}")
                        continue
                    
                    # Find best file to download (prefer GLB)
                    priority = ['glb', 'gltf', 'fbx', 'obj', 'blend']
                    file_to_import = None
                    
                    for ext in priority:
                        for f in files:
                            if f.get('originalFileName', '').lower().endswith(f'.{ext}'):
                                file_to_import = f
                                break
                        if file_to_import:
                            break
                    
                    if not file_to_import:
                        file_to_import = files[0]
                    
                    # Download file to temp directory
                    print(f"[Modelibr] Processing model {model_id}: {model_data.get('name', 'Unknown')}")
                    with tempfile.TemporaryDirectory() as temp_dir:
                        filename = file_to_import.get('originalFileName', f"model_{model_id}")
                        print(f"[Modelibr] Downloading file: {filename}")
                        downloaded_path = client.download_file(
                            file_to_import['id'],
                            temp_dir,
                            filename
                        )
                        print(f"[Modelibr] Downloaded to: {downloaded_path}")
                        
                        # Create asset blend file
                        success, msg = AssetLibraryHandler.create_asset_blend(
                            model_id,
                            model_data,
                            version,
                            downloaded_path,
                            client
                        )
                        
                        if success:
                            synced_count += 1
                        else:
                            print(f"[Modelibr] Failed to create asset for model {model_id}: {msg}")
                
                except Exception as e:
                    import traceback
                    print(f"[Modelibr] Error syncing model {model_id}: {e}")
                    print(f"[Modelibr] Traceback: {traceback.format_exc()}")
                    continue
            
            return (True, f"Synced {synced_count} of {total} models", synced_count)
            
        except Exception as e:
            return (False, f"Sync failed: {str(e)}", 0)


def register():
    """Register asset browser components."""
    pass


def unregister():
    """Unregister asset browser components."""
    pass

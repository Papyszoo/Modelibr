"""
Upload operators for the Modelibr Blender addon.
Handles uploading new versions and new models to the Modelibr server.
"""
import os
import tempfile
from typing import Set, List, Dict, Any, Optional

import bpy
from bpy.types import Operator, Context, Object
from bpy.props import StringProperty, BoolProperty, EnumProperty, IntProperty

from ..api_client import ModelibrApiClient
from ..exceptions import ApiError
from ..preferences import get_preferences
from ..tracking import store_object_metadata, update_hashes_after_upload, get_modelibr_objects
from ..config import EXPORT_FORMAT_ITEMS, METADATA_TEXTURE_SET_ID, METADATA_TEXTURE_HASH
from .common import get_api_client, sanitize_filename, debug_log, extract_id, export_scene


class MODELIBR_OT_upload_version(Operator):
    """Upload current scene as a new version of existing model."""
    
    bl_idname = "modelibr.upload_version"
    bl_label = "Upload Version"
    bl_description = "Upload current scene as a new version"

    description: StringProperty(
        name="Description",
        description="Version description",
        default="",
    )

    set_as_active: BoolProperty(
        name="Set as Active",
        description="Set this version as the active version",
        default=True,
    )

    export_format: EnumProperty(
        name="Export Format",
        items=EXPORT_FORMAT_ITEMS,
        default='GLB',
    )

    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )

    pack_textures: EnumProperty(
        name="Pack Textures",
        description="How to handle separate grayscale textures (Roughness, Metallic, AO)",
        items=[
            ('SEPARATE', "Upload Separately", "Upload each texture as a separate file"),
            ('PACK_ORM', "Pack into ORM", "Combine into single ORM texture (R=AO, G=Roughness, B=Metallic)"),
        ],
        default='SEPARATE',
    )
    
    # Internal flag set during invoke
    has_packable_textures: BoolProperty(default=False, options={'HIDDEN'})

    def invoke(self, context: Context, event) -> Set[str]:
        props = context.scene.modelibr
        prefs = get_preferences()

        if props.current_model_id <= 0:
            self.report({'ERROR'}, "No model context. Import a model first or use 'Open in Blender' from the web app.")
            return {'CANCELLED'}

        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend

        debug_log(f"invoke upload_version: always_include_blend={prefs.always_include_blend}, include_blend={self.include_blend}")
        
        # Check for modifications
        from ..tracking import get_modelibr_models
        models = get_modelibr_models(context.scene)
        has_modifications = any(
            m["is_modified"] for m in models if m["model_id"] == props.current_model_id
        )
        
        if not has_modifications:
            self.report({'WARNING'}, "No changes detected. Uploading unchanged model may cause issues.")

        # Detect packable textures for dialog
        self.has_packable_textures = False
        if prefs.show_channel_packing_ui:
            from ..texture_utils import analyze_material_textures
            model_objects = get_modelibr_objects(context.scene, props.current_model_id)
            if model_objects:
                analysis = analyze_material_textures(model_objects)
                self.has_packable_textures = len(analysis.get("packable", [])) >= 2

        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context: Context) -> None:
        layout = self.layout
        props = context.scene.modelibr

        layout.label(text=f"Model: {props.current_model_name}")
        layout.prop(self, "description")
        layout.prop(self, "export_format")
        layout.prop(self, "set_as_active")
        layout.prop(self, "include_blend")
        
        # Show packing option if packable textures detected
        if self.has_packable_textures:
            layout.separator()
            box = layout.box()
            box.label(text="Texture Packing", icon='TEXTURE')
            box.prop(self, "pack_textures")

    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr
        debug_log(f"execute upload_version: include_blend={self.include_blend}")

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                # Export model
                model_name = props.current_model_name or "model"
                safe_name = sanitize_filename(model_name)
                
                export_path = self._export_model(temp_dir, safe_name)
                if not export_path:
                    self.report({'ERROR'}, "Export failed")
                    return {'CANCELLED'}

                # Create version
                result = client.create_version(
                    props.current_model_id,
                    export_path,
                    self.description,
                    self.set_as_active,
                )
                version_id = extract_id(result)
                debug_log(f"Created version {version_id}")

                # Upload blend file if requested
                if self.include_blend and version_id > 0:
                    self._upload_blend_file(client, props.current_model_id, version_id, temp_dir, safe_name)

                # Handle texture sets
                texture_set_used = self._handle_textures(
                    context, client, props.current_model_id, version_id, temp_dir, safe_name
                )

                # Update state
                if version_id > 0:
                    props.current_version_id = version_id
                
                update_hashes_after_upload(context.scene, props.current_model_id)

                texture_msg = f" (texture set {'created' if texture_set_used else 'linked'})" if texture_set_used else ""
                self.report({'INFO'}, f"Uploaded new version for '{props.current_model_name}'{texture_msg}")
                return {'FINISHED'}

        except ApiError as e:
            debug_log(f"ApiError in upload_version: {e}")
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}

    def _export_model(self, temp_dir: str, safe_name: str) -> Optional[str]:
        """Export the model to temp directory."""
        ext_map = {'GLB': '.glb', 'FBX': '.fbx', 'OBJ': '.obj'}
        extension = ext_map.get(self.export_format, '.glb')
        export_path = os.path.join(temp_dir, f"{safe_name}{extension}")
        
        if export_scene(self.export_format, export_path):
            debug_log(f"Exported to: {export_path}")
            return export_path
        return None

    def _upload_blend_file(
        self, 
        client: ModelibrApiClient, 
        model_id: int, 
        version_id: int, 
        temp_dir: str, 
        safe_name: str
    ) -> bool:
        """Save and upload the blend file."""
        blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
        try:
            debug_log(f"Saving blend file to: {blend_path}")
            result = bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
            
            if 'FINISHED' in result and os.path.exists(blend_path) and os.path.getsize(blend_path) > 0:
                client.add_file_to_version(model_id, version_id, blend_path)
                debug_log("Blend file uploaded successfully")
                return True
            else:
                self.report({'WARNING'}, "Blend file could not be saved")
        except Exception as e:
            debug_log(f"Exception during blend file upload: {e}")
            self.report({'WARNING'}, f"Could not include blend file: {e}")
        return False

    def _handle_textures(
        self,
        context: Context,
        client: ModelibrApiClient,
        model_id: int,
        version_id: int,
        temp_dir: str,
        safe_name: str
    ) -> Optional[int]:
        """Handle texture set creation or linking. Returns texture set ID if used."""
        if version_id <= 0:
            return None
            
        try:
            from ..texture_utils import (
                analyze_material_textures,
                classify_textures_for_export,
                export_textures,
                calculate_material_textures_hash,
                get_objects_texture_set_id
            )
            from ..preferences import get_preferences
            
            model_objects = [
                obj for obj in get_modelibr_objects(context.scene)
                if obj.get("modelibr_model_id") == model_id
            ]
            
            # Use new shader analysis
            analysis = analyze_material_textures(model_objects)
            total_textures = len(analysis["textures"]) + len(analysis["packed"])
            
            if total_textures == 0:
                debug_log("No textures found in model materials")
                return None
            
            debug_log(f"Found {total_textures} textures ({len(analysis['packed'])} packed, {len(analysis['packable'])} packable)")
            
            # Check for packing opportunities
            prefs = get_preferences()
            if analysis["packable"] and prefs.show_channel_packing_ui:
                packable_types = [t.get("texture_type") for t in analysis["packable"]]
                print(f"[Modelibr] Packing possible for: {', '.join(packable_types)}")
                
                if self.pack_textures == 'PACK_ORM' and len(analysis["packable"]) >= 2:
                    # Pack textures into ORM
                    from ..texture_utils import pack_textures_to_orm
                    packed_image = pack_textures_to_orm(analysis["packable"], f"{safe_name}_orm")
                    if packed_image:
                        print(f"[Modelibr] Created packed ORM texture: {packed_image.name}")
                        # Add packed image to analysis for export
                        analysis["textures"].append({
                            "image": packed_image,
                            "texture_type": "ORM",
                            "is_packed": True
                        })
                        # Mark individual textures as not needing separate export
                        for tex in analysis["packable"]:
                            tex["skip_export"] = True
                else:
                    print(f"[Modelibr] Uploading textures separately (user choice)")
            
            # Get original texture set info
            original_set_id = get_objects_texture_set_id(model_objects)
            print(f"[Modelibr] Checking textures for {len(model_objects)} objects")
            print(f"[Modelibr] Original texture set ID: {original_set_id}")
            
            # Classify textures for export
            classification = classify_textures_for_export(analysis)
            
            print(f"[Modelibr] Classification: unchanged={len(classification['unchanged'])}, "
                  f"modified={len(classification['modified'])}, new={len(classification['new'])}, "
                  f"removed={len(classification['removed'])}")
            print(f"[Modelibr] any_from_modelibr={classification['any_from_modelibr']}, "
                  f"any_changed={classification['any_changed']}")
            
            # Decision logic based on classification
            if not classification["any_changed"] and original_set_id:
                # No changes - reuse existing set
                print(f"[Modelibr] -> REUSING existing texture set {original_set_id}")
                return self._link_texture_set(client, model_id, version_id, original_set_id)
            elif classification["any_changed"]:
                # Changes detected - use selective upload if possible
                if classification["unchanged"]:
                    # Selective upload: upload modified/new, reference unchanged
                    print(f"[Modelibr] -> Creating NEW texture set (SELECTIVE: "
                          f"{len(classification['modified']) + len(classification['new'])} upload, "
                          f"{len(classification['unchanged'])} reuse)")
                    return self._create_texture_set_selective(
                        client, model_id, version_id, model_objects, 
                        classification, temp_dir, safe_name
                    )
                else:
                    # All textures are new/modified - upload all
                    print(f"[Modelibr] -> Creating NEW texture set (full upload)")
                    return self._create_texture_set(
                        client, model_id, version_id, model_objects, temp_dir, safe_name
                    )
            else:
                # No original set - upload all
                print(f"[Modelibr] -> Creating NEW texture set (no original)")
                return self._create_texture_set(
                    client, model_id, version_id, model_objects, temp_dir, safe_name
                )
                
        except Exception as e:
            debug_log(f"Error handling textures: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _create_texture_set(
        self,
        client: ModelibrApiClient,
        model_id: int,
        version_id: int,
        model_objects: List[Object],
        temp_dir: str,
        safe_name: str
    ) -> Optional[int]:
        """Create a new texture set and associate with version."""
        from ..texture_utils import export_textures, calculate_material_textures_hash
        
        debug_log("Creating new texture set...")
        exported_textures = export_textures(model_objects, temp_dir)
        
        if not exported_textures:
            return None
        
        try:
            first_tex = exported_textures[0]
            # Include version_id in texture set name to avoid caching issues
            texture_set_name = f"{safe_name}_textures_v{version_id}"
            
            ts_result = client.create_texture_set_with_file(
                first_tex["filepath"],
                texture_set_name,
                first_tex["texture_type"]
            )
            texture_set_id = ts_result.get("textureSetId", 0)
            debug_log(f"Created texture set {texture_set_id}")
            
            # Add remaining textures
            for tex in exported_textures[1:]:
                try:
                    file_result = client.add_file_to_version(model_id, version_id, tex["filepath"])
                    file_id = file_result.get("id", 0)
                    if file_id > 0:
                        client.add_texture_to_set(texture_set_id, file_id, tex["texture_type"])
                        debug_log(f"Added texture {tex['original_name']} to set")
                except Exception as tex_e:
                    debug_log(f"Failed to add texture: {tex_e}")
            
            # Associate and set as default
            client.associate_texture_set_with_version(texture_set_id, version_id)
            client.set_default_texture_set(model_id, texture_set_id, version_id)
            
            # Update metadata on objects
            new_hash = calculate_material_textures_hash(model_objects[0]) if model_objects else ""
            for obj in model_objects:
                obj[METADATA_TEXTURE_SET_ID] = texture_set_id
                if new_hash:
                    obj[METADATA_TEXTURE_HASH] = new_hash
            
            debug_log(f"Set texture set {texture_set_id} as default for version {version_id}")
            return texture_set_id
            
        except Exception as e:
            debug_log(f"Failed to create texture set: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _create_texture_set_selective(
        self,
        client: ModelibrApiClient,
        model_id: int,
        version_id: int,
        model_objects: List[Object],
        classification: dict,
        temp_dir: str,
        safe_name: str
    ) -> Optional[int]:
        """
        Create a new texture set with selective upload.
        
        Uploads only modified/new textures and references unchanged textures by file_id.
        This avoids re-uploading textures that haven't changed.
        """
        from ..texture_utils import export_textures, calculate_material_textures_hash
        
        debug_log("Creating texture set with selective upload...")
        debug_log(f"  - Unchanged (ref by file_id): {len(classification['unchanged'])}")
        debug_log(f"  - Modified (re-upload): {len(classification['modified'])}")
        debug_log(f"  - New (upload): {len(classification['new'])}")
        
        # Collect all textures to upload (modified + new)
        textures_to_upload = classification['modified'] + classification['new']
        
        # Collect unchanged textures to reference by file_id
        textures_to_reference = classification['unchanged']
        
        if not textures_to_upload and not textures_to_reference:
            debug_log("No textures to process")
            return None
        
        try:
            texture_set_id = None
            texture_set_name = f"{safe_name}_textures_v{version_id}"
            
            # First, handle textures that need uploading
            if textures_to_upload:
                # Export modified/new textures
                objects_for_export = model_objects
                exported_textures = export_textures(objects_for_export, temp_dir)
                
                if exported_textures:
                    # Create texture set with first uploaded texture
                    first_tex = exported_textures[0]
                    ts_result = client.create_texture_set_with_file(
                        first_tex["filepath"],
                        texture_set_name,
                        first_tex["texture_type"]
                    )
                    texture_set_id = ts_result.get("textureSetId", 0)
                    debug_log(f"Created texture set {texture_set_id} with first uploaded texture")
                    
                    # Add remaining uploaded textures
                    for tex in exported_textures[1:]:
                        try:
                            file_result = client.add_file_to_version(model_id, version_id, tex["filepath"])
                            file_id = file_result.get("id", 0)
                            if file_id > 0:
                                client.add_texture_to_set(texture_set_id, file_id, tex["texture_type"])
                                debug_log(f"Added uploaded texture {tex['original_name']} to set")
                        except Exception as tex_e:
                            debug_log(f"Failed to add uploaded texture: {tex_e}")
            
            # If no uploads, create empty texture set and reference all unchanged
            if not texture_set_id and textures_to_reference:
                # Create empty texture set first
                ts_result = client._make_request(
                    "POST", "/texture-sets",
                    data=f'{{"name": "{texture_set_name}"}}'.encode('utf-8'),
                    content_type="application/json"
                )
                texture_set_id = ts_result.get("id", 0)
                debug_log(f"Created empty texture set {texture_set_id}")
            
            # Add unchanged textures by referencing file_id
            if texture_set_id and textures_to_reference:
                for tex in textures_to_reference:
                    file_id = tex.get("file_id")
                    texture_type = tex.get("texture_type", "Albedo")
                    source_channel = tex.get("source_channel", 0)
                    
                    if file_id:
                        try:
                            client.add_texture_to_set(
                                texture_set_id, 
                                file_id, 
                                texture_type,
                                source_channel
                            )
                            debug_log(f"Referenced existing file {file_id} as {texture_type}")
                        except Exception as ref_e:
                            debug_log(f"Failed to reference file {file_id}: {ref_e}")
            
            if texture_set_id:
                # Associate and set as default
                client.associate_texture_set_with_version(texture_set_id, version_id)
                client.set_default_texture_set(model_id, texture_set_id, version_id)
                
                # Update metadata on objects
                new_hash = calculate_material_textures_hash(model_objects[0]) if model_objects else ""
                for obj in model_objects:
                    obj[METADATA_TEXTURE_SET_ID] = texture_set_id
                    if new_hash:
                        obj[METADATA_TEXTURE_HASH] = new_hash
                
                debug_log(f"Set texture set {texture_set_id} as default for version {version_id}")
                return texture_set_id
            
            return None
            
        except Exception as e:
            debug_log(f"Failed to create selective texture set: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _link_texture_set(
        self,
        client: ModelibrApiClient,
        model_id: int,
        version_id: int,
        texture_set_id: int
    ) -> Optional[int]:
        """Link existing texture set to new version."""
        debug_log(f"Reusing existing texture set {texture_set_id}")
        try:
            client.associate_texture_set_with_version(texture_set_id, version_id)
            client.set_default_texture_set(model_id, texture_set_id, version_id)
            debug_log(f"Linked texture set {texture_set_id} to version {version_id}")
            return texture_set_id
        except Exception as e:
            debug_log(f"Failed to link texture set: {e}")
            return None


class MODELIBR_OT_upload_new_model(Operator):
    """Upload current scene as a completely new model."""
    
    bl_idname = "modelibr.upload_new_model"
    bl_label = "Upload New Model"
    bl_description = "Upload current scene as a new model"

    model_name: StringProperty(
        name="Model Name",
        description="Name for the new model",
        default="",
    )

    export_format: EnumProperty(
        name="Export Format",
        items=EXPORT_FORMAT_ITEMS,
        default='GLB',
    )

    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )

    def invoke(self, context: Context, event) -> Set[str]:
        prefs = get_preferences()
        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend

        # Default name from blend file
        blend_name = bpy.path.basename(bpy.data.filepath)
        if blend_name:
            self.model_name = os.path.splitext(blend_name)[0]

        debug_log(f"invoke upload_new_model: always_include_blend={prefs.always_include_blend}")
        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.prop(self, "model_name")
        layout.prop(self, "export_format")
        layout.prop(self, "include_blend")

    def execute(self, context: Context) -> Set[str]:
        if not self.model_name:
            self.report({'ERROR'}, "Model name is required")
            return {'CANCELLED'}

        props = context.scene.modelibr
        debug_log(f"execute upload_new_model: model_name={self.model_name}")

        try:
            client = get_api_client()

            with tempfile.TemporaryDirectory() as temp_dir:
                safe_name = sanitize_filename(self.model_name)

                # Export model
                export_path = self._export_model(temp_dir, safe_name)
                if not export_path:
                    self.report({'ERROR'}, "Export failed")
                    return {'CANCELLED'}

                # Create new model
                result = client.create_model(export_path)
                model_id = extract_id(result, keys=('id', 'modelId', 'model_id'))
                debug_log(f"Created model {model_id}")
                
                # Get the version ID for the initial version
                version_id = 0
                if model_id > 0:
                    versions = client.get_model_versions(model_id)
                    if versions:
                        version_id = extract_id(versions[-1])

                # Upload blend file if requested
                if self.include_blend and model_id > 0 and version_id > 0:
                    blend_path = os.path.join(temp_dir, f"{safe_name}.blend")
                    self._upload_blend_file(client, model_id, version_id, blend_path)

                # Handle texture sets
                texture_set_created = self._handle_textures(
                    context, client, model_id, version_id, temp_dir, safe_name
                )

                # Set as current model
                if model_id > 0:
                    props.current_model_id = model_id
                    props.current_model_name = self.model_name
                    if version_id > 0:
                        props.current_version_id = version_id
                    
                    update_hashes_after_upload(context.scene, model_id)

                texture_msg = " with textures" if texture_set_created else ""
                self.report({'INFO'}, f"Created new model: '{self.model_name}'{texture_msg}")
                return {'FINISHED'}

        except ApiError as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}

    def _export_model(self, temp_dir: str, safe_name: str) -> Optional[str]:
        """Export the model to temp directory."""
        ext_map = {'GLB': '.glb', 'FBX': '.fbx', 'OBJ': '.obj'}
        extension = ext_map.get(self.export_format, '.glb')
        export_path = os.path.join(temp_dir, f"{safe_name}{extension}")
        
        if export_scene(self.export_format, export_path):
            return export_path
        return None

    def _upload_blend_file(
        self, 
        client: ModelibrApiClient, 
        model_id: int, 
        version_id: int, 
        blend_path: str
    ) -> bool:
        """Save and upload the blend file."""
        try:
            debug_log(f"Saving blend file to: {blend_path}")
            result = bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
            
            if 'FINISHED' in result and os.path.exists(blend_path) and os.path.getsize(blend_path) > 0:
                client.add_file_to_version(model_id, version_id, blend_path)
                debug_log("Blend file uploaded successfully")
                return True
            else:
                self.report({'WARNING'}, "Blend file could not be saved")
        except Exception as e:
            debug_log(f"Exception during blend file upload: {e}")
            self.report({'WARNING'}, f"Could not include blend file: {e}")
        return False

    def _handle_textures(
        self,
        context: Context,
        client: ModelibrApiClient,
        model_id: int,
        version_id: int,
        temp_dir: str,
        safe_name: str
    ) -> bool:
        """Handle texture set creation for new model. Returns True if created."""
        if model_id <= 0 or version_id <= 0:
            return False
            
        try:
            from ..texture_utils import (
                analyze_material_textures,
                export_textures
            )
            from ..preferences import get_preferences
            
            scene_objects = list(context.scene.objects)
            
            # Use new shader analysis for packing detection
            analysis = analyze_material_textures(scene_objects)
            total_textures = len(analysis["textures"]) + len(analysis["packed"])
            
            if total_textures == 0:
                debug_log("No textures found in scene materials")
                return False
            
            debug_log(f"Found {total_textures} textures ({len(analysis['packed'])} packed, {len(analysis['packable'])} packable)")
            
            # Check for packing opportunities
            prefs = get_preferences()
            if analysis["packable"] and prefs.show_channel_packing_ui:
                packable_types = [t.get("texture_type") for t in analysis["packable"]]
                print(f"[Modelibr] Packing possible for: {', '.join(packable_types)}")
                # TODO: Show packing dialog - for now, just log
                print(f"[Modelibr] (Packing dialog not yet implemented - uploading as separate)")
            
            exported_textures = export_textures(scene_objects, temp_dir)
            
            if not exported_textures:
                return False
            
            # Create texture set with first texture
            first_tex = exported_textures[0]
            texture_set_name = f"{safe_name}_textures"
            
            ts_result = client.create_texture_set_with_file(
                first_tex["filepath"],
                texture_set_name,
                first_tex["texture_type"]
            )
            texture_set_id = ts_result.get("textureSetId", 0)
            debug_log(f"Created texture set {texture_set_id}")
            
            # Add remaining textures
            for tex in exported_textures[1:]:
                try:
                    file_result = client.add_file_to_version(model_id, version_id, tex["filepath"])
                    file_id = file_result.get("id", 0)
                    if file_id > 0:
                        client.add_texture_to_set(texture_set_id, file_id, tex["texture_type"])
                        debug_log(f"Added texture {tex['original_name']} to set")
                except Exception as tex_e:
                    debug_log(f"Failed to add texture: {tex_e}")
            
            # Associate and set as default
            client.associate_texture_set_with_version(texture_set_id, version_id)
            client.set_default_texture_set(model_id, texture_set_id, version_id)
            debug_log(f"Set texture set {texture_set_id} as default for version {version_id}")
            return True
            
        except Exception as e:
            debug_log(f"Error handling textures: {e}")
            import traceback
            traceback.print_exc()
            return False


class MODELIBR_OT_upload_from_imported(Operator):
    """Upload selected imported asset as new version or new model."""
    
    bl_idname = "modelibr.upload_from_imported"
    bl_label = "Upload Selected Asset"
    bl_description = "Upload selected asset as new version or new model"
    
    model_id: IntProperty(
        name="Model ID",
        description="Model ID for version upload",
        default=0,
    )
    
    upload_as: EnumProperty(
        name="Upload As",
        items=[
            ('VERSION', "New Version", "Upload as new version of existing model"),
            ('MODEL', "New Model", "Upload as completely new model"),
        ],
        default='VERSION',
    )
    
    description: StringProperty(
        name="Description",
        description="Version or model description",
        default="",
    )
    
    model_name: StringProperty(
        name="Model Name",
        description="Name for new model (only for New Model option)",
        default="",
    )
    
    export_format: EnumProperty(
        name="Export Format",
        items=EXPORT_FORMAT_ITEMS,
        default='GLB',
    )
    
    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )
    
    def invoke(self, context: Context, event) -> Set[str]:
        obj = context.active_object
        prefs = get_preferences()
        
        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend
        
        # Detect if active object is from Modelibr
        if obj and "modelibr_model_id" in obj:
            self.model_id = obj["modelibr_model_id"]
            self.model_name = obj.get("modelibr_model_name", "")
            self.upload_as = 'VERSION'
        else:
            self.upload_as = 'MODEL'
            self.model_id = 0
            
            blend_name = bpy.path.basename(bpy.data.filepath)
            if blend_name:
                self.model_name = os.path.splitext(blend_name)[0]
        
        return context.window_manager.invoke_props_dialog(self)
    
    def draw(self, context: Context) -> None:
        layout = self.layout
        
        layout.prop(self, "upload_as", expand=True)
        
        if self.upload_as == 'VERSION':
            layout.label(text=f"Model: {self.model_name}")
            layout.prop(self, "description")
        else:
            layout.prop(self, "model_name")
        
        layout.prop(self, "export_format")
        layout.prop(self, "include_blend")
    
    def execute(self, context: Context) -> Set[str]:
        props = context.scene.modelibr
        
        if self.upload_as == 'VERSION':
            if self.model_id <= 0:
                self.report({'ERROR'}, "No model ID available")
                return {'CANCELLED'}
            
            # Temporarily set model context for upload_version
            original_model_id = props.current_model_id
            original_model_name = props.current_model_name
            
            try:
                props.current_model_id = self.model_id
                props.current_model_name = self.model_name
                
                bpy.ops.modelibr.upload_version(
                    description=self.description,
                    export_format=self.export_format,
                    include_blend=self.include_blend,
                    set_as_active=True,
                )
            finally:
                props.current_model_id = original_model_id
                props.current_model_name = original_model_name
        else:
            if not self.model_name:
                self.report({'ERROR'}, "Model name is required")
                return {'CANCELLED'}
            
            bpy.ops.modelibr.upload_new_model(
                model_name=self.model_name,
                export_format=self.export_format,
                include_blend=self.include_blend,
            )
        
        return {'FINISHED'}


# ============================================================================
# ASYNC UPLOAD OPERATORS
# ============================================================================

from ..async_handler import (
    BackgroundTask, TaskStatus,
    register_task, unregister_task
)
from bpy.types import Event
import shutil


class UploadTask(BackgroundTask):
    """Background task for uploading model files."""
    
    def __init__(
        self,
        client: ModelibrApiClient,
        model_id: int,
        export_path: str,
        description: str,
        set_as_active: bool,
        blend_path: Optional[str] = None
    ):
        super().__init__()
        self.client = client
        self.model_id = model_id
        self.export_path = export_path
        self.description = description
        self.set_as_active = set_as_active
        self.blend_path = blend_path
        self.version_id: int = 0
    
    def run(self) -> None:
        """Upload model files in background thread."""
        try:
            total_steps = 2 if self.blend_path else 1
            current_step = 0
            
            # Step 1: Upload main model file
            filename = os.path.basename(self.export_path)
            self.tracker.update(
                progress=0.0,
                message=f"Uploading {filename}..."
            )
            
            if self.should_cancel:
                self.tracker.set_cancelled()
                return
            
            result = self.client.create_version(
                self.model_id,
                self.export_path,
                self.description,
                self.set_as_active,
            )
            self.version_id = extract_id(result)
            current_step += 1
            self.tracker.update(progress=current_step / total_steps)
            
            if self.should_cancel:
                self.tracker.set_cancelled()
                return
            
            # Step 2: Upload blend file if requested
            if self.blend_path and self.version_id > 0:
                self.tracker.update(
                    progress=current_step / total_steps,
                    message="Uploading .blend file..."
                )
                
                if os.path.exists(self.blend_path) and os.path.getsize(self.blend_path) > 0:
                    try:
                        self.client.add_file_to_version(
                            self.model_id,
                            self.version_id,
                            self.blend_path
                        )
                    except ApiError as e:
                        debug_log(f"Failed to upload blend file: {e}")
                
                current_step += 1
                self.tracker.update(progress=current_step / total_steps)
            
            self.tracker.set_completed({
                'version_id': self.version_id,
            })
            
        except Exception as e:
            self.tracker.set_failed(str(e))


class MODELIBR_OT_upload_version_async(Operator):
    """
    Upload a new version asynchronously with progress feedback.
    
    This operator exports the model on the main thread, then uploads
    files in the background while keeping the UI responsive.
    """
    
    bl_idname = "modelibr.upload_version_async"
    bl_label = "Upload Version (Async)"
    bl_description = "Upload new version with progress feedback (non-blocking)"

    description: StringProperty(
        name="Description",
        description="Version description",
        default="",
    )

    set_as_active: BoolProperty(
        name="Set as Active",
        description="Set this version as the active version",
        default=True,
    )

    export_format: EnumProperty(
        name="Export Format",
        items=EXPORT_FORMAT_ITEMS,
        default='GLB',
    )

    include_blend: BoolProperty(
        name="Include .blend File",
        description="Also upload the .blend file",
        default=False,
    )
    
    # Internal state
    _timer = None
    _task: Optional[UploadTask] = None
    _temp_dir: Optional[str] = None
    _model_id: int = 0
    _model_name: str = ""

    def invoke(self, context: Context, event: Event) -> Set[str]:
        props = context.scene.modelibr
        prefs = get_preferences()

        if props.current_model_id <= 0:
            self.report({'ERROR'}, "No model context. Import a model first.")
            return {'CANCELLED'}

        self._model_id = props.current_model_id
        self._model_name = props.current_model_name
        self.export_format = prefs.default_export_format
        self.include_blend = prefs.always_include_blend

        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.label(text=f"Model: {self._model_name}")
        layout.prop(self, "description")
        layout.prop(self, "export_format")
        layout.prop(self, "set_as_active")
        layout.prop(self, "include_blend")

    def execute(self, context: Context) -> Set[str]:
        """Export on main thread, then start background upload."""
        props = context.scene.modelibr
        
        try:
            # Create temp directory
            self._temp_dir = tempfile.mkdtemp(prefix="modelibr_upload_")
            safe_name = sanitize_filename(self._model_name or "model")
            
            # Export model on main thread (bpy ops required)
            context.area.header_text_set(f"Exporting '{self._model_name}'...")
            
            ext_map = {'GLB': '.glb', 'FBX': '.fbx', 'OBJ': '.obj'}
            extension = ext_map.get(self.export_format, '.glb')
            export_path = os.path.join(self._temp_dir, f"{safe_name}{extension}")
            
            if not export_scene(self.export_format, export_path):
                self.report({'ERROR'}, "Export failed")
                self._cleanup()
                return {'CANCELLED'}
            
            # Save blend file if requested (also main thread)
            blend_path = None
            if self.include_blend:
                blend_path = os.path.join(self._temp_dir, f"{safe_name}.blend")
                result = bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
                if 'FINISHED' not in result or not os.path.exists(blend_path):
                    blend_path = None
                    self.report({'WARNING'}, "Could not save blend file")
            
            # Start background upload task
            client = get_api_client()
            self._task = UploadTask(
                client=client,
                model_id=self._model_id,
                export_path=export_path,
                description=self.description,
                set_as_active=self.set_as_active,
                blend_path=blend_path
            )
            register_task(f"upload_{self._model_id}", self._task)
            self._task.start()
            
            # Add timer for progress updates
            wm = context.window_manager
            self._timer = wm.event_timer_add(0.1, window=context.window)
            wm.modal_handler_add(self)
            
            debug_log(f"Started async upload for model {self._model_id}")
            return {'RUNNING_MODAL'}
            
        except Exception as e:
            self.report({'ERROR'}, f"Upload failed: {e}")
            self._cleanup()
            return {'CANCELLED'}

    def modal(self, context: Context, event: Event) -> Set[str]:
        """Handle timer events and check task progress."""
        if event.type == 'TIMER':
            if self._task is None:
                return self._finish(context, cancelled=True)
            
            state = self._task.tracker.get_state()
            
            # Update header with progress
            context.area.header_text_set(
                f"Uploading '{self._model_name}': {state.progress:.0%} - {state.message}"
            )
            
            if state.status == TaskStatus.COMPLETED:
                return self._complete_upload(context, state.result)
            elif state.status == TaskStatus.FAILED:
                self.report({'ERROR'}, f"Upload failed: {state.error}")
                return self._finish(context)
            elif state.status == TaskStatus.CANCELLED:
                self.report({'WARNING'}, "Upload cancelled")
                return self._finish(context, cancelled=True)
        
        elif event.type == 'ESC':
            if self._task:
                self._task.cancel()
            self.report({'WARNING'}, "Upload cancelled")
            return self._finish(context, cancelled=True)
        
        return {'PASS_THROUGH'}

    def _complete_upload(self, context: Context, result: Dict[str, Any]) -> Set[str]:
        """Handle upload completion."""
        version_id = result.get('version_id', 0) if result else 0
        
        if version_id > 0:
            props = context.scene.modelibr
            props.current_version_id = version_id
            update_hashes_after_upload(context.scene, self._model_id)
            self.report({'INFO'}, f"Uploaded new version for '{self._model_name}'")
        else:
            self.report({'WARNING'}, "Upload completed but no version ID returned")
        
        return self._finish(context)

    def _finish(self, context: Context, cancelled: bool = False) -> Set[str]:
        """Clean up and finish the operator."""
        if self._timer:
            wm = context.window_manager
            wm.event_timer_remove(self._timer)
            self._timer = None
        
        context.area.header_text_set(None)
        unregister_task(f"upload_{self._model_id}")
        self._cleanup()
        self._task = None
        
        return {'CANCELLED'} if cancelled else {'FINISHED'}

    def _cleanup(self) -> None:
        """Clean up temp directory."""
        if self._temp_dir and os.path.exists(self._temp_dir):
            try:
                shutil.rmtree(self._temp_dir)
            except Exception:
                pass
            self._temp_dir = None


# List of classes to register
classes = [
    MODELIBR_OT_upload_version,
    MODELIBR_OT_upload_new_model,
    MODELIBR_OT_upload_from_imported,
    MODELIBR_OT_upload_version_async,
]


def register() -> None:
    """Register upload operators."""
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    """Unregister upload operators."""
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


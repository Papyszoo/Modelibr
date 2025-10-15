# 3D Model Viewer with Texture Preview - Implementation Summary

## Overview
This implementation adds texture set support to the 3D model viewer, allowing users to:
1. View linked texture sets for a model
2. Switch between texture sets in real-time
3. Set a default texture set that loads automatically
4. Apply PBR textures (Albedo/Diffuse, Normal, Roughness, Metallic, AO) to 3D models

## Backend Changes

### Domain Layer
- **Model.cs**: Added `DefaultTextureSetId` property and `SetDefaultTextureSet()` method
  - Validates that texture set is associated with model before setting as default
  - Updates model timestamp when default is changed

### Application Layer
- **ModelDto**: Added `DefaultTextureSetId` field to API response
- **SetDefaultTextureSetCommand**: New command to set/clear default texture set for a model
  - Validates model exists
  - Validates texture set association
  - Returns updated model ID and default texture set ID

### Infrastructure Layer
- **Migration**: Added `20251015222900_AddDefaultTextureSetToModel.cs`
  - Adds `DefaultTextureSetId` column to Models table
  - Creates foreign key relationship with TextureSets table (ON DELETE SET NULL)
  - Creates index for efficient queries

### API Layer
- **ModelsEndpoints.cs**: Added PUT endpoint `/models/{id}/defaultTextureSet`
  - Accepts model ID and optional texture set ID
  - Returns success/failure result

## Frontend Changes

### Data Model
- **fileUtils.ts**: Added `defaultTextureSetId` to Model interface
- **ApiClient.ts**: Added `setDefaultTextureSet()` method
  - Invalidates model cache when default changes

### Components

#### TextureSetSelectorWindow.tsx
A new sidebar component that:
- Lists all texture sets associated with the model
- Shows preview thumbnails (Albedo/Diffuse texture)
- Indicates currently selected texture set
- Shows default texture set with a badge
- Allows setting any texture set as default (star button)
- Includes a "No Texture" option to view base material

#### TexturedModel.tsx
A new 3D rendering component that:
- Extends the existing Model component with texture support
- Loads and applies PBR textures from selected texture set:
  - Albedo/Diffuse → Base color map
  - Normal → Normal map
  - Roughness → Roughness map
  - Metallic → Metalness map
  - AO → Ambient occlusion map
- Supports OBJ, FBX, GLTF/GLB model formats
- Configures textures with proper wrapping (RepeatWrapping)
- Maintains model scaling and positioning logic

#### ModelPreviewScene.tsx
Updated to:
- Accept optional `textureSet` prop
- Render TexturedModel when texture set is selected
- Fall back to basic Model for backward compatibility

#### ModelViewer.tsx
Enhanced with:
- State management for selected texture set
- Automatic loading of default texture set on mount
- New "Texture Sets" button in viewer controls
- Integration with TextureSetSelectorWindow
- Real-time texture switching without page reload

### User Experience Flow

1. **Initial Load**:
   - Model loads with default texture set if configured
   - Otherwise, displays with base material

2. **Switching Textures**:
   - User clicks "Texture Sets" button (palette icon)
   - Sidebar shows all linked texture sets with previews
   - User clicks a texture set to apply it instantly
   - Selected texture set is highlighted
   - Default texture set shows a yellow "DEFAULT" badge

3. **Setting Default**:
   - User hovers over a texture set
   - Star button appears
   - Clicking star sets as default
   - Badge updates immediately

4. **Removing Texture**:
   - User clicks "No Texture" option at top of list
   - Model displays with basic material (gray/blue)

## Technical Details

### Texture Loading
- Uses Three.js TextureLoader via @react-three/drei's useTexture hook
- Loads all textures in parallel for performance
- Handles missing textures gracefully (falls back to basic material values)
- Configures texture wrapping for proper UV mapping

### Material Properties
- **With Textures**:
  - Metalness: 1 (fully metal if metalness map present)
  - Roughness: 1 (fully rough if roughness map present)
  - Maps applied as available
  
- **Without Textures**:
  - Color: RGB(0.7, 0.7, 0.9) - light purple-gray
  - Metalness: 0.3
  - Roughness: 0.4
  - EnvMapIntensity: 1.0

### Performance Considerations
- Model cloning prevents scene conflicts in dual-panel view
- Texture URLs built only when texture set changes
- React keys ensure proper re-rendering when switching textures
- Suspense boundaries for loading states

### Database Schema
```sql
-- Models table update
ALTER TABLE Models 
ADD COLUMN DefaultTextureSetId INTEGER NULL
ADD CONSTRAINT FK_Models_TextureSets_DefaultTextureSetId 
  FOREIGN KEY (DefaultTextureSetId) 
  REFERENCES TextureSets(Id) 
  ON DELETE SET NULL;

CREATE INDEX IX_Models_DefaultTextureSetId 
  ON Models(DefaultTextureSetId);
```

## Testing Recommendations

### Backend Testing
1. Test setting default texture set on model with associated texture sets
2. Test clearing default (setting to null)
3. Test error when setting non-associated texture set as default
4. Test cascade behavior when texture set is deleted (should set NULL)

### Frontend Testing
1. Test texture loading and application on all supported model formats (OBJ, FBX, GLTF/GLB)
2. Test switching between texture sets in real-time
3. Test setting and clearing default texture set
4. Test model with no associated texture sets (should show empty state)
5. Test "No Texture" option
6. Test dual-panel view with different textures on same model

### Integration Testing
1. Link texture sets to model via Model Information window
2. Set default texture set via Texture Sets window
3. Reload page - verify default texture set loads automatically
4. Remove texture set association - verify it disappears from selector
5. Delete texture set - verify default is cleared if it was the default

## Future Enhancements
- Support for displacement/height maps
- Support for emissive maps
- UV mapping visualization with texture overlay
- Texture set preview before applying
- Batch apply texture set to multiple models
- Texture set templates/presets

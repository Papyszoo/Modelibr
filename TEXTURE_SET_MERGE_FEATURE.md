# Texture Set Merge Feature

## Overview
This feature allows users to merge texture sets by dragging one texture set card onto another. When dropped, a modal dialog appears asking which texture type the albedo texture from the dragged set should be added as to the target set.

## Implementation Details

### Frontend Components

#### 1. MergeTextureSetDialog (`src/frontend/src/features/texture-set/dialogs/MergeTextureSetDialog.tsx`)
A new dialog component that:
- Displays information about the source and target texture sets
- Shows a dropdown to select the texture type
- Filters out texture types that already exist in the target set
- Validates that the source set has an albedo texture
- Handles the merge operation by calling the API

#### 2. TextureSetGrid Updates (`src/frontend/src/features/texture-set/components/TextureSetGrid.tsx`)
Enhanced with drag-and-drop functionality:
- Made texture set cards draggable
- Added drag event handlers (onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop)
- Distinguishes between file drops and texture set drops using custom data transfer type
- Shows visual feedback when hovering over a drop target
- Prevents dropping a texture set on itself
- Validates that source has an albedo texture before showing merge dialog

#### 3. CSS Styling (`src/frontend/src/features/texture-set/components/TextureSetGrid.css`)
Added styles for:
- `.drag-over-card` class for visual feedback when hovering over a drop target
- Border highlight and opacity changes for better UX

### How It Works

1. **Drag Start**: When a user starts dragging a texture set card, the component:
   - Stores the dragged texture set in state
   - Sets custom data transfer type to distinguish from file drops

2. **Drag Over**: While dragging over another card:
   - Checks if it's a texture set being dragged (not a file)
   - Adds visual feedback (border highlight and opacity)
   - Prevents default to allow drop

3. **Drop**: When dropped on another card:
   - Validates the drop target is different from source
   - Checks if source has an albedo texture
   - Opens the merge dialog

4. **Merge Dialog**: Shows:
   - Source and target texture set names
   - Dropdown with available texture types (excluding ones already in target)
   - Merge button that calls the API

5. **API Call**: Uses existing `addTextureToSetEndpoint`:
   - Extracts the albedo texture's fileId from source set
   - Adds it to target set with the selected texture type
   - Refreshes the texture set list on success

### Backend API
Uses the existing endpoint: `POST /texture-sets/{id}/textures`
- Request body: `{ fileId: number, textureType: TextureType }`
- No backend changes required

## User Flow

1. User drags a texture set card
2. User hovers over another texture set card (target card highlights)
3. User drops the card
4. Modal appears asking "Which texture type to add the albedo texture as?"
5. User selects a texture type from dropdown (e.g., Normal, Roughness, etc.)
6. User clicks "Merge"
7. Success message appears
8. Texture set list refreshes to show updated data

## Edge Cases Handled

- Cannot drop a texture set on itself (shows warning)
- Source must have an albedo texture (shows warning if not)
- Target texture types that already exist are filtered out
- Shows info message if target has all texture types filled
- Proper cleanup of drag state on cancel or error

## Future Enhancements

Potential improvements:
- Support for selecting which texture from source (not just albedo)
- Batch merge multiple textures at once
- Undo/redo functionality
- Drag preview showing texture being dragged

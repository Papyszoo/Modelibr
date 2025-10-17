# Texture Type Drag-and-Drop Feature

## Overview
This feature allows users to change a texture's type by dragging it from one texture card to another in the TextureSet Viewer. For example, you can drag a texture from the "Albedo" card to the "Normal" card to change its type from Albedo to Normal.

## How It Works

### User Perspective
1. Navigate to a TextureSet in the viewer
2. Find a texture card that has a texture assigned
3. Click and drag the texture preview image
4. Drop it onto another texture card (of a different type)
5. The texture will change its type to match the destination card
6. If the destination card already has a texture, you'll get an error message
7. Visual feedback shows which card is the drag source (opacity reduced) and the drop target (highlighted)

### Technical Implementation

#### Backend (C#/.NET)
- **New Command**: `ChangeTextureTypeCommand`
  - Located: `src/Application/TextureSets/ChangeTextureTypeCommand.cs`
  - Validates texture set and texture existence
  - Prevents changing to the same type (no-op)
  - Prevents changing when target type already exists
  - Uses domain method `Texture.UpdateTextureType()`
  
- **New API Endpoint**: `PUT /texture-sets/{setId}/textures/{textureId}/type`
  - Located: `src/WebApi/Endpoints/TextureSetEndpoints.cs`
  - Request body: `{ "textureType": <number> }`
  - Returns: 204 No Content on success, 400 Bad Request on failure

- **Unit Tests**: 
  - Located: `tests/Application.Tests/TextureSets/ChangeTextureTypeCommandHandlerTests.cs`
  - Tests all scenarios: not found, same type, target exists, successful change

#### Frontend (React/TypeScript)
- **API Client Method**: `changeTextureType()`
  - Located: `src/frontend/src/services/ApiClient.ts`
  - Calls the backend endpoint
  - Invalidates cache for texture sets
  
- **Hook Method**: `useTextureSets.changeTextureType()`
  - Located: `src/frontend/src/features/texture-set/hooks/useTextureSets.ts`
  - Wraps API call with loading/error states
  
- **Component Changes**: `TextureCard`
  - Located: `src/frontend/src/features/texture-set/components/TextureCard.tsx`
  - New state: `isDraggingTexture` - tracks when this card's texture is being dragged
  - New handlers:
    - `handleTextureDragStart` - initiates drag, stores texture data in dataTransfer
    - `handleTextureDragEnd` - cleans up drag state
    - `handleTextureDragOver` - distinguishes between file and texture drags
    - `handleTextureDragEnterEnhanced` - handles texture entering drop zone
    - `handleTextureDropEnhanced` - handles drop, calls API to change type
  - Made texture preview draggable with `draggable` attribute
  - Prevents cross-set texture moves (validation)

- **CSS Changes**: `TextureCard.css`
  - Located: `src/frontend/src/features/texture-set/components/TextureCard.css`
  - New class: `.dragging-source` - reduces opacity when dragging
  - Updated: `.texture-card-with-preview` - cursor changed to `move`

## Business Rules
1. Can only change texture type within the same texture set
2. Cannot change to a type that already exists in the set
3. Changing to the same type returns early (no database update, but still considered success)
4. Only one texture of each type per set (existing rule, enforced)

## Error Handling
- Backend validates all operations and returns appropriate error codes
- Frontend shows toast notifications for success/error
- Specific messages for:
  - Texture not found
  - Texture set not found
  - Target type already exists
  - Cannot move between sets

## Files Changed
### Backend
- `src/Application/TextureSets/ChangeTextureTypeCommand.cs` (new)
- `src/WebApi/Endpoints/TextureSetEndpoints.cs` (modified)
- `tests/Application.Tests/TextureSets/ChangeTextureTypeCommandHandlerTests.cs` (new)

### Frontend
- `src/frontend/src/services/ApiClient.ts` (modified)
- `src/frontend/src/features/texture-set/hooks/useTextureSets.ts` (modified)
- `src/frontend/src/features/texture-set/components/TextureCard.tsx` (modified)
- `src/frontend/src/features/texture-set/components/TextureCard.css` (modified)

## Testing
- Unit tests for command handler cover all scenarios
- Domain tests already covered `Texture.UpdateTextureType()` method
- Manual testing required for UI drag-and-drop interaction

## Future Enhancements
- Add undo/redo functionality
- Support drag-and-drop between different texture sets (with merge logic)
- Batch texture type changes
- Preview texture in destination card before dropping

# Texture Upload Endpoint Fix

## Issue
The TextureCard component was using an incorrect endpoint `/api/uploadModel` for uploading texture files, which:
- Doesn't exist in the backend
- Is meant for creating 3D models, not uploading texture images
- Expected wrong response structure (`files[0].id` vs actual `{id, alreadyExists}`)

This resulted in "Failed to upload texture" errors.

## Solution

### 1. Added `uploadFileToModel` Method to ApiClient
Created a new method in `ApiClient.ts` that uploads files to an existing model using the `/models/{modelId}/files` endpoint:

```typescript
async uploadFileToModel(
  modelId: number,
  file: File
): Promise<{ fileId: number; alreadyLinked: boolean }>
```

### 2. Updated TextureCard Component
Modified the texture upload logic to:
- Accept `associatedModels` prop from the parent
- Validate that the texture pack has at least one associated model
- Upload files using the new `uploadFileToModel` method with the first associated model's ID
- Extract `fileId` from the correct response structure

### 3. Updated TexturePackViewer
Updated to pass `associatedModels` from the texture pack to each TextureCard.

## Workflow
The correct texture upload workflow now follows the documented pattern:

1. **Associate Model**: Users must first associate at least one 3D model with the texture pack (via the Models tab)
2. **Upload Texture**: When uploading a texture, the file is uploaded to the first associated model using `/models/{modelId}/files`
3. **Add to Pack**: The returned `fileId` is then added to the texture pack with the appropriate texture type

## Error Handling
If users try to upload a texture before associating any models, they'll see a clear error message:
> "Please associate at least one model with this texture pack before uploading textures"

## Files Changed
- `src/frontend/src/services/ApiClient.ts` - Added `uploadFileToModel` method
- `src/frontend/src/components/tabs/texture-pack-viewer/TextureCard.tsx` - Updated upload logic
- `src/frontend/src/components/tabs/TexturePackViewer.tsx` - Pass associated models to TextureCard
- `src/frontend/src/services/__mocks__/ApiClient.ts` - Updated mock for tests

## Testing
- ✅ Frontend builds successfully
- ✅ All frontend tests pass
- ✅ Backend builds successfully
- ✅ Follows documented texture pack workflow from `docs/backend/endpoints/texture-packs.md`

# Texture Pack Details Fix

## Issue
When clicking "View Details" on a texture pack in the grid, the application displayed a red error message "Texture pack not found" in the middle of the screen instead of showing the texture pack details.

## Root Cause
The frontend `ApiClient.getTexturePackById()` method was incorrectly handling the API response:

```typescript
// INCORRECT - Before fix
async getTexturePackById(id: number): Promise<TexturePackDto> {
  const response: AxiosResponse<GetTexturePackByIdResponse> =
    await this.client.get(`/texture-packs/${id}`)
  return response.data.texturePack  // ❌ Trying to access .texturePack property
}
```

The code was expecting the API to return:
```json
{
  "texturePack": {
    "id": 1,
    "name": "Metal Surface Pack",
    ...
  }
}
```

But the backend API actually returns the TexturePack object directly (as documented in `docs/backend/endpoints/texture-packs.md`):
```json
{
  "id": 1,
  "name": "Metal Surface Pack",
  ...
}
```

This mismatch caused the method to return `undefined`, which triggered the "Texture pack not found" error in the `TexturePackViewer` component.

## Solution
Updated `ApiClient.getTexturePackById()` to return `response.data` directly instead of `response.data.texturePack`:

```typescript
// CORRECT - After fix
async getTexturePackById(id: number): Promise<TexturePackDto> {
  const response: AxiosResponse<TexturePackDto> =
    await this.client.get(`/texture-packs/${id}`)
  return response.data  // ✅ Returns the TexturePack directly
}
```

Also removed the unused `GetTexturePackByIdResponse` import since it's no longer needed.

## Files Changed
- `src/frontend/src/services/ApiClient.ts` - Fixed response handling and removed unused import

## Testing
- ✅ Frontend builds successfully
- ✅ All frontend tests pass (12 test suites, 92 tests)
- ✅ Backend builds successfully
- ✅ Response format matches backend API documentation

## Related
- Backend endpoint: `src/WebApi/Endpoints/TexturePackEndpoints.cs` (line 75-88)
- Backend handler: `src/Application/TexturePacks/GetTexturePackByIdQuery.cs`
- API documentation: `docs/backend/endpoints/texture-packs.md`

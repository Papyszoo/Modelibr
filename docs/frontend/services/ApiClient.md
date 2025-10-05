# ApiClient

RESTful API client service for backend communication.

## Purpose

Provides a centralized API client for:
- Model upload and retrieval
- File management
- Thumbnail operations
- Texture pack management
- Type-safe API communication

## Import

```typescript
import ApiClient from '../services/ApiClient'
```

## Configuration

### Base URL

The API base URL is configured via environment variable:

```typescript
const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:8081'
```

### Axios Configuration

```typescript
{
  baseURL: 'https://localhost:8081',
  timeout: 30000,  // 30 seconds
  headers: {
    'Content-Type': 'application/json'
  }
}
```

## API Methods

### Model Operations

#### uploadModel

Upload a 3D model file.

```typescript
async uploadModel(file: File): Promise<UploadModelResponse>
```

**Parameters:**
- `file: File` - File to upload

**Returns:**
```typescript
{
  id: number,
  alreadyExists: boolean
}
```

**Example:**
```typescript
const file = document.querySelector('input[type="file"]').files[0]
const result = await ApiClient.uploadModel(file)

if (result.alreadyExists) {
  console.log(`Model already exists with ID: ${result.id}`)
} else {
  console.log(`New model uploaded with ID: ${result.id}`)
}
```

#### getModels

Fetch all models.

```typescript
async getModels(): Promise<Model[]>
```

**Returns:** Array of `Model` objects

**Example:**
```typescript
const models = await ApiClient.getModels()
console.log(`Found ${models.length} models`)

models.forEach(model => {
  console.log(`${model.id}: ${model.name}`)
})
```

#### getModelById

Fetch a specific model by ID.

```typescript
async getModelById(modelId: string): Promise<Model>
```

**Parameters:**
- `modelId: string` - Model ID

**Returns:** `Model` object

**Example:**
```typescript
const model = await ApiClient.getModelById('123')
console.log(`Model: ${model.name}`)
console.log(`Files: ${model.files.length}`)
```

### File URL Generators

#### getModelFileUrl

Get URL for model's primary file.

```typescript
getModelFileUrl(modelId: string): string
```

**Parameters:**
- `modelId: string` - Model ID

**Returns:** Full URL to model file

**Example:**
```typescript
const url = ApiClient.getModelFileUrl('123')
// "https://localhost:8081/models/123/file"
```

#### getFileUrl

Get URL for any file by ID.

```typescript
getFileUrl(fileId: string): string
```

**Parameters:**
- `fileId: string` - File ID

**Returns:** Full URL to file

**Example:**
```typescript
const url = ApiClient.getFileUrl('abc-123')
// "https://localhost:8081/files/abc-123"
```

### Thumbnail Operations

#### getThumbnailStatus

Get thumbnail generation status.

```typescript
async getThumbnailStatus(modelId: string): Promise<ThumbnailStatus>
```

**Parameters:**
- `modelId: string` - Model ID

**Returns:**
```typescript
{
  Status: 'Pending' | 'Processing' | 'Ready' | 'Failed',
  FileUrl?: string,
  SizeBytes?: number,
  Width?: number,
  Height?: number,
  ErrorMessage?: string,
  CreatedAt?: string,
  ProcessedAt?: string
}
```

**Example:**
```typescript
const status = await ApiClient.getThumbnailStatus('123')

if (status.Status === 'Ready') {
  console.log(`Thumbnail ready: ${status.Width}x${status.Height}`)
} else if (status.Status === 'Failed') {
  console.error(`Thumbnail failed: ${status.ErrorMessage}`)
}
```

#### getThumbnailUrl

Get URL for thumbnail file.

```typescript
getThumbnailUrl(modelId: string): string
```

**Parameters:**
- `modelId: string` - Model ID

**Returns:** Full URL to thumbnail

**Example:**
```typescript
const url = ApiClient.getThumbnailUrl('123')
// "https://localhost:8081/models/123/thumbnail/file"

<img src={url} alt="Thumbnail" />
```

#### regenerateThumbnail

Request thumbnail regeneration.

```typescript
async regenerateThumbnail(modelId: string): Promise<void>
```

**Parameters:**
- `modelId: string` - Model ID

**Example:**
```typescript
await ApiClient.regenerateThumbnail('123')
console.log('Thumbnail regeneration requested')
```

### Texture Pack Operations

#### getAllTexturePacks

Fetch all texture packs.

```typescript
async getAllTexturePacks(): Promise<TexturePackDto[]>
```

**Returns:** Array of texture packs

**Example:**
```typescript
const packs = await ApiClient.getAllTexturePacks()
console.log(`Found ${packs.length} texture packs`)
```

#### getTexturePackById

Fetch specific texture pack.

```typescript
async getTexturePackById(id: number): Promise<TexturePackDto>
```

**Parameters:**
- `id: number` - Texture pack ID

**Returns:** Texture pack details

**Example:**
```typescript
const pack = await ApiClient.getTexturePackById(5)
console.log(`Pack: ${pack.name}`)
console.log(`Textures: ${pack.textureCount}`)
```

#### createTexturePack

Create a new texture pack.

```typescript
async createTexturePack(request: CreateTexturePackRequest): Promise<CreateTexturePackResponse>
```

**Parameters:**
```typescript
{
  name: string
}
```

**Returns:**
```typescript
{
  id: number,
  name: string
}
```

**Example:**
```typescript
const pack = await ApiClient.createTexturePack({
  name: 'My Texture Pack'
})
console.log(`Created pack with ID: ${pack.id}`)
```

#### updateTexturePack

Update texture pack name.

```typescript
async updateTexturePack(id: number, request: UpdateTexturePackRequest): Promise<UpdateTexturePackResponse>
```

**Parameters:**
- `id: number` - Pack ID
- `request: { name: string }` - New name

**Example:**
```typescript
const updated = await ApiClient.updateTexturePack(5, {
  name: 'Renamed Pack'
})
console.log(`Pack updated: ${updated.name}`)
```

#### deleteTexturePack

Delete a texture pack.

```typescript
async deleteTexturePack(id: number): Promise<void>
```

**Parameters:**
- `id: number` - Pack ID

**Example:**
```typescript
await ApiClient.deleteTexturePack(5)
console.log('Pack deleted')
```

#### addTextureToPackEndpoint

Add a texture to a pack.

```typescript
async addTextureToPackEndpoint(packId: number, request: AddTextureToPackRequest): Promise<AddTextureToPackResponse>
```

**Parameters:**
- `packId: number` - Pack ID
- `request`:
  ```typescript
  {
    fileId: number,
    textureType: TextureType
  }
  ```

**Returns:**
```typescript
{
  textureId: number,
  packId: number
}
```

**Example:**
```typescript
const result = await ApiClient.addTextureToPackEndpoint(5, {
  fileId: 123,
  textureType: TextureType.Albedo
})
console.log(`Added texture ${result.textureId} to pack ${result.packId}`)
```

#### removeTextureFromPack

Remove texture from pack.

```typescript
async removeTextureFromPack(packId: number, textureId: number): Promise<void>
```

**Parameters:**
- `packId: number` - Pack ID
- `textureId: number` - Texture ID

**Example:**
```typescript
await ApiClient.removeTextureFromPack(5, 123)
console.log('Texture removed from pack')
```

#### associateTexturePackWithModel

Associate a texture pack with a model.

```typescript
async associateTexturePackWithModel(packId: number, modelId: number): Promise<void>
```

**Example:**
```typescript
await ApiClient.associateTexturePackWithModel(5, 123)
console.log('Pack associated with model')
```

#### disassociateTexturePackFromModel

Remove pack association from model.

```typescript
async disassociateTexturePackFromModel(packId: number, modelId: number): Promise<void>
```

**Example:**
```typescript
await ApiClient.disassociateTexturePackFromModel(5, 123)
console.log('Pack disassociated from model')
```

### Utility Methods

#### getBaseURL

Get the configured API base URL.

```typescript
getBaseURL(): string
```

**Returns:** Base URL string

**Example:**
```typescript
const baseUrl = ApiClient.getBaseURL()
console.log(`API base: ${baseUrl}`)
// "https://localhost:8081"
```

## Error Handling

All async methods throw errors that should be caught:

```typescript
try {
  const models = await ApiClient.getModels()
  // Success
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('Server error:', error.response.status)
    console.error('Message:', error.response.data)
  } else if (error.request) {
    // Request made but no response
    console.error('Network error:', error.message)
  } else {
    // Other error
    console.error('Error:', error.message)
  }
}
```

## Usage Examples

### Complete Upload Flow

```typescript
import ApiClient from '../services/ApiClient'

async function uploadAndFetchModel(file: File) {
  try {
    // Upload
    const uploadResult = await ApiClient.uploadModel(file)
    console.log('Uploaded:', uploadResult.id)
    
    // Fetch details
    const model = await ApiClient.getModelById(uploadResult.id.toString())
    console.log('Model details:', model)
    
    // Get thumbnail status
    const thumbnailStatus = await ApiClient.getThumbnailStatus(uploadResult.id.toString())
    console.log('Thumbnail status:', thumbnailStatus.Status)
    
    return model
  } catch (error) {
    console.error('Upload flow failed:', error)
    throw error
  }
}
```

### Texture Pack Management

```typescript
async function createAndPopulatePack(name: string, fileIds: number[]) {
  // Create pack
  const pack = await ApiClient.createTexturePack({ name })
  
  // Add textures
  for (const fileId of fileIds) {
    await ApiClient.addTextureToPackEndpoint(pack.id, {
      fileId,
      textureType: TextureType.Albedo
    })
  }
  
  // Fetch updated pack
  const updatedPack = await ApiClient.getTexturePackById(pack.id)
  console.log(`Pack has ${updatedPack.textureCount} textures`)
  
  return updatedPack
}
```

### File URL Construction

```typescript
function getModelUrls(model: Model) {
  return {
    thumbnail: ApiClient.getThumbnailUrl(model.id),
    primaryFile: ApiClient.getModelFileUrl(model.id),
    additionalFiles: model.files.map(file => ({
      name: file.originalFileName,
      url: ApiClient.getFileUrl(file.id)
    }))
  }
}
```

## Related

- [useFileUpload](../hooks/useFileUpload.md) - Uses upload methods
- [ThumbnailDisplay](../components/ThumbnailDisplay.md) - Uses thumbnail methods directly
- [useTexturePacks](../hooks/useTexturePacks.md) - Uses texture pack methods
- [Model](../components/Model.md) - Uses file URLs

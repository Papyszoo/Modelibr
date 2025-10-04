# API Quick Reference

A quick reference guide for the Modelibr Backend API.

## Base URL

Development: `http://localhost:5009`

## Endpoints Overview

### Model Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/models` | Upload a new 3D model |
| POST | `/models/{modelId}/files` | Add file to model |
| GET | `/models` | Get all models |
| GET | `/models/{id}` | Get model by ID |
| GET | `/models/{id}/file` | Download model file |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/files/{id}` | Download any file |

### Thumbnails

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/models/{id}/thumbnail` | Get thumbnail status |
| POST | `/models/{id}/thumbnail/regenerate` | Regenerate thumbnail |
| POST | `/models/{id}/thumbnail/upload` | Upload custom thumbnail |
| GET | `/models/{id}/thumbnail/file` | Download thumbnail |

### Texture Packs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/texture-packs` | Get all texture packs |
| GET | `/texture-packs/{id}` | Get texture pack by ID |
| POST | `/texture-packs` | Create texture pack |
| PUT | `/texture-packs/{id}` | Update texture pack |
| DELETE | `/texture-packs/{id}` | Delete texture pack |
| POST | `/texture-packs/{id}/textures` | Add texture to pack |
| DELETE | `/texture-packs/{packId}/textures/{textureId}` | Remove texture from pack |
| POST | `/texture-packs/{packId}/models/{modelId}` | Associate pack with model |
| DELETE | `/texture-packs/{packId}/models/{modelId}` | Disassociate pack from model |

### Worker API (Thumbnail Jobs)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/thumbnail-jobs/dequeue` | Get next job (workers) |
| POST | `/api/thumbnail-jobs/{jobId}/complete` | Mark job complete (workers) |
| POST | `/api/test/thumbnail-complete/{modelId}` | Test notification (dev only) |

## Common Request Examples

### Upload a Model

```bash
curl -X POST http://localhost:5009/models \
  -F "file=@model.obj"
```

### Get All Models

```bash
curl http://localhost:5009/models
```

### Download Model File

```bash
curl http://localhost:5009/models/1/file -o model.obj
```

### Check Thumbnail Status

```bash
curl http://localhost:5009/models/1/thumbnail
```

### Create Texture Pack

```bash
curl -X POST http://localhost:5009/texture-packs \
  -H "Content-Type: application/json" \
  -d '{"name": "Metal Pack"}'
```

### Add Texture to Pack

```bash
curl -X POST http://localhost:5009/texture-packs/1/textures \
  -H "Content-Type: application/json" \
  -d '{"fileId": 10, "textureType": "Albedo"}'
```

## File Type Support

### Model Files (Upload to /models)
- `.obj` - Wavefront OBJ
- `.fbx` - Autodesk FBX
- `.gltf` - glTF JSON
- `.glb` - glTF Binary

### Additional Files (Upload to /models/{id}/files)
- **Models**: `.obj`, `.fbx`, `.gltf`, `.glb`
- **Project**: `.blend`, `.max`, `.ma`, `.mb`
- **Textures**: `.jpg`, `.jpeg`, `.png`, `.tga`, `.bmp`
- **Materials**: `.mtl`

### Thumbnail Images
- `.png`, `.jpg`, `.jpeg`, `.webp`

## Texture Types

- `Albedo` - Base color
- `Normal` - Normal map
- `Height` - Height/displacement
- `AO` - Ambient occlusion
- `Roughness` - Surface roughness
- `Metallic` - Metallic map
- `Diffuse` - Diffuse color (legacy)
- `Specular` - Specular reflectivity

## Thumbnail Status

- `None` - No thumbnail
- `Pending` - Queued for generation
- `Processing` - Being generated
- `Ready` - Available for download
- `Failed` - Generation failed

## Validation Limits

### File Upload
- **Max size**: 1GB (1,073,741,824 bytes)
- **Model types only**: obj, fbx, gltf, glb for `/models`
- **All types**: Any supported type for `/models/{id}/files`

### Thumbnail Upload
- **Max size**: 10MB (10,485,760 bytes)
- **Formats**: png, jpg, jpeg, webp

### Texture Pack
- **Name**: Max 200 characters
- **Textures**: Must be valid texture types

## Error Response Format

```json
{
  "error": "ErrorCode",
  "message": "Human-readable error message"
}
```

## HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success, no response body
- `400 Bad Request` - Validation error
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Response Headers

### Caching (Thumbnails)
- `Cache-Control: public, max-age=3600` - Status (1 hour)
- `Cache-Control: public, max-age=86400` - File (24 hours)
- `ETag: "{id}-{timestamp}"` - For validation

### Range Support
- `Accept-Ranges: bytes` - Partial content supported
- `Content-Length: {size}` - File size

## JavaScript Examples

### Upload Model

```javascript
const formData = new FormData();
formData.append('file', modelFile);

const response = await fetch('http://localhost:5009/models', {
  method: 'POST',
  body: formData
});

const result = await response.json();
// { "id": 1, "alreadyExists": false }
```

### Get Model with Files

```javascript
const response = await fetch('http://localhost:5009/models/1');
const model = await response.json();

console.log(`Model: ${model.name}`);
console.log(`Files: ${model.files.length}`);
```

### Monitor Thumbnail Status

```javascript
async function waitForThumbnail(modelId) {
  while (true) {
    const response = await fetch(`http://localhost:5009/models/${modelId}/thumbnail`);
    const status = await response.json();
    
    if (status.status === 'Ready') {
      return status.fileUrl;
    }
    
    if (status.status === 'Failed') {
      throw new Error(status.errorMessage);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

### Create Complete Texture Pack

```javascript
// 1. Create pack
const packResponse = await fetch('http://localhost:5009/texture-packs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Pack' })
});
const pack = await packResponse.json();

// 2. Upload texture file
const formData = new FormData();
formData.append('file', textureFile);

const fileResponse = await fetch('http://localhost:5009/models/1/files', {
  method: 'POST',
  body: formData
});
const fileResult = await fileResponse.json();

// 3. Add to pack
await fetch(`http://localhost:5009/texture-packs/${pack.id}/textures`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fileId: fileResult.fileId,
    textureType: 'Albedo'
  })
});

// 4. Associate with model
await fetch(`http://localhost:5009/texture-packs/${pack.id}/models/1`, {
  method: 'POST'
});
```

## Real-time Updates (SignalR)

### Connect to Hub

```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5009/thumbnailHub")
  .build();

await connection.start();
```

### Listen for Thumbnail Updates

```javascript
connection.on("ThumbnailStatusChanged", (modelId, status, url, error) => {
  console.log(`Model ${modelId}: ${status}`);
  
  if (status === 'Ready') {
    updateUI(modelId, url);
  }
});
```

### Listen for Job Queue Updates

```javascript
const jobConnection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5009/thumbnailJobHub")
  .build();

jobConnection.on("JobAdded", (jobId) => {
  console.log(`New job ${jobId} added to queue`);
});

await jobConnection.start();
```

## Worker Implementation

### Basic Worker Loop

```javascript
class ThumbnailWorker {
  async start(workerId) {
    while (true) {
      // Dequeue job
      const response = await fetch('http://localhost:5009/api/thumbnail-jobs/dequeue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId })
      });
      
      if (response.status === 204) {
        await sleep(5000); // No jobs, wait
        continue;
      }
      
      const job = await response.json();
      
      // Process job
      const result = await this.generateThumbnail(job);
      
      // Complete job
      await fetch(`http://localhost:5009/api/thumbnail-jobs/${job.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    }
  }
}
```

## See Also

- [Full API Documentation](./README.md)
- [Model Endpoints](./endpoints/models.md)
- [Thumbnail Endpoints](./endpoints/thumbnails.md)
- [Texture Pack Endpoints](./endpoints/texture-packs.md)
- [Worker API](./endpoints/thumbnail-jobs.md)

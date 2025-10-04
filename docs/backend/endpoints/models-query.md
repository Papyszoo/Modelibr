# Model Query Endpoints

This document describes endpoints for querying and retrieving 3D models and their files.

## Get All Models

Retrieves a list of all models with their associated files.

### Endpoint

```
GET /models
```

### Request

No parameters required.

### Success Response

**Status Code**: `200 OK`

```json
[
  {
    "id": 1,
    "name": "Spaceship Model",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "files": [
      {
        "id": 1,
        "originalFileName": "spaceship.obj",
        "mimeType": "model/obj",
        "fileType": {
          "value": "obj",
          "description": "Wavefront OBJ",
          "isRenderable": true,
          "category": "Model3D"
        },
        "isRenderable": true,
        "sizeBytes": 2048576
      },
      {
        "id": 2,
        "originalFileName": "spaceship_texture.png",
        "mimeType": "image/png",
        "fileType": {
          "value": "texture",
          "description": "Texture Image",
          "isRenderable": false,
          "category": "Texture"
        },
        "isRenderable": false,
        "sizeBytes": 524288
      }
    ]
  },
  {
    "id": 2,
    "name": "Character Model",
    "createdAt": "2024-01-16T14:20:00Z",
    "updatedAt": "2024-01-16T14:20:00Z",
    "files": [
      {
        "id": 3,
        "originalFileName": "character.fbx",
        "mimeType": "application/octet-stream",
        "fileType": {
          "value": "fbx",
          "description": "Autodesk FBX",
          "isRenderable": true,
          "category": "Model3D"
        },
        "isRenderable": true,
        "sizeBytes": 5242880
      }
    ]
  }
]
```

### Response Fields

#### Model Object

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique model identifier |
| name | string | Model name |
| createdAt | datetime | Model creation timestamp (ISO 8601) |
| updatedAt | datetime | Last update timestamp (ISO 8601) |
| files | array | Array of associated file objects |

#### File Object

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique file identifier |
| originalFileName | string | Original name of the uploaded file |
| mimeType | string | MIME type of the file |
| fileType | object | File type information object |
| isRenderable | boolean | Whether file can be rendered in 3D viewer |
| sizeBytes | long | File size in bytes |

#### FileType Object

| Field | Type | Description |
|-------|------|-------------|
| value | string | File type value (e.g., "obj", "fbx") |
| description | string | Human-readable description |
| isRenderable | boolean | Whether type is renderable |
| category | string | File category (Model3D, Texture, Material, Project, Other) |

### Error Responses

#### General Error

**Status Code**: `400 Bad Request`

```json
{
  "error": "ErrorCode",
  "message": "Error message"
}
```

### Example Request (cURL)

```bash
curl http://localhost:5009/models
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/models');
const models = await response.json();

console.log(models);
// Array of model objects with files
```

---

## Get Model by ID

Retrieves a specific model by its ID, including all associated files.

### Endpoint

```
GET /models/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Success Response

**Status Code**: `200 OK`

```json
{
  "id": 1,
  "name": "Spaceship Model",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "files": [
    {
      "id": 1,
      "originalFileName": "spaceship.obj",
      "mimeType": "model/obj",
      "fileType": {
        "value": "obj",
        "description": "Wavefront OBJ",
        "isRenderable": true,
        "category": "Model3D"
      },
      "isRenderable": true,
      "sizeBytes": 2048576
    },
    {
      "id": 2,
      "originalFileName": "spaceship_texture.png",
      "mimeType": "image/png",
      "fileType": {
        "value": "texture",
        "description": "Texture Image",
        "isRenderable": false,
        "category": "Texture"
      },
      "isRenderable": false,
      "sizeBytes": 524288
    }
  ]
}
```

### Response Fields

Same structure as individual model object in [Get All Models](#get-all-models) response.

### Error Responses

#### Model Not Found

**Status Code**: `404 Not Found`

```json
{
  "error": "ModelNotFound",
  "message": "Model with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl http://localhost:5009/models/1
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/models/1');
const model = await response.json();

console.log(model);
// Single model object with files
```

---

## Get Model File

Downloads the primary model file (the file used to create the model). This endpoint returns the raw file data with appropriate content type and enables range requests for efficient downloading.

### Endpoint

```
GET /models/{id}/file
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Success Response

**Status Code**: `200 OK`

**Content-Type**: Appropriate MIME type for the file (e.g., `model/obj`, `application/octet-stream`)

**Content-Disposition**: `attachment; filename="original-filename.ext"`

**Response Body**: Raw file binary data

**Headers**:
- `Accept-Ranges: bytes` - Supports partial content requests
- `Content-Length: {size}` - File size in bytes

### Process Flow

1. **Model Lookup**: Retrieves model by ID
2. **File Path Resolution**: Gets the physical file path from storage
3. **File Stream**: Opens file stream for reading
4. **Content Type Detection**: Determines appropriate MIME type
5. **Range Support**: Enables range requests for large files

### Error Responses

#### Model Not Found

**Status Code**: `404 Not Found`

```json
"Model with ID 999 was not found."
```

#### File Not Found

**Status Code**: `404 Not Found`

```json
"Model file not found."
```

### Example Request (cURL)

```bash
# Download the file
curl http://localhost:5009/models/1/file -o downloaded-model.obj

# Download with range request (partial content)
curl http://localhost:5009/models/1/file \
  -H "Range: bytes=0-1023" \
  -o partial-model.obj
```

### Example Request (JavaScript)

```javascript
// Download file
const response = await fetch('http://localhost:5009/models/1/file');
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);

// Create download link
const a = document.createElement('a');
a.href = url;
a.download = 'model.obj';
a.click();

// Cleanup
window.URL.revokeObjectURL(url);
```

### Example Request (JavaScript with Progress)

```javascript
const response = await fetch('http://localhost:5009/models/1/file');
const reader = response.body.getReader();
const contentLength = +response.headers.get('Content-Length');

let receivedLength = 0;
const chunks = [];

while(true) {
  const {done, value} = await reader.read();
  
  if (done) break;
  
  chunks.push(value);
  receivedLength += value.length;
  
  console.log(`Downloaded ${receivedLength} of ${contentLength} bytes`);
}

const blob = new Blob(chunks);
// Use the blob...
```

## Notes

### File Categories

Models can have multiple files in different categories:

- **Model3D**: The 3D geometry files (obj, fbx, gltf, glb)
- **Texture**: Image files for texturing (jpg, png, etc.)
- **Material**: Material definition files (mtl)
- **Project**: Source project files (blend, max, maya)
- **Other**: Any other supported file types

### Renderable Files

Only certain file types are marked as `isRenderable: true`:
- Wavefront OBJ (.obj)
- Autodesk FBX (.fbx)
- glTF JSON (.gltf)
- glTF Binary (.glb)

These are the files that can be displayed in a 3D viewer.

### Performance Considerations

- **Range Requests**: The `/models/{id}/file` endpoint supports HTTP range requests, allowing efficient downloading of large files
- **Streaming**: Files are streamed directly from disk, not loaded into memory
- **Caching**: Consider implementing client-side caching using ETags or Last-Modified headers

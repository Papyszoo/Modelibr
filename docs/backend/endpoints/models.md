# Model Management Endpoints

This document describes endpoints for creating and managing 3D models.

## Create Model

Creates a new 3D model by uploading a renderable model file. The system automatically detects if a model with the same file hash already exists (deduplication).

### Endpoint

```
POST /models
```

### Request

**Content-Type**: `multipart/form-data`

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | The 3D model file to upload |

#### Supported File Types
- `.obj` - Wavefront OBJ
- `.fbx` - Autodesk FBX  
- `.gltf` - glTF JSON
- `.glb` - glTF Binary

### Process Flow

1. **File Validation**: Validates file size (max 1GB) and type (must be renderable)
2. **Hash Calculation**: Computes SHA-256 hash of the file content
3. **Deduplication Check**: Checks if a model with the same hash already exists
4. **File Storage**: If new, stores the file using hash-based storage (prevents duplicates)
5. **Model Creation**: Creates or returns existing model entity
6. **Domain Events**: Raises `ModelUploaded` event for thumbnail generation

### Success Response

**Status Code**: `200 OK`

```json
{
  "id": 1,
  "alreadyExists": false
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| id | integer | The ID of the created or existing model |
| alreadyExists | boolean | `true` if model already existed, `false` if newly created |

### Error Responses

#### Invalid File (Empty)

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidFile",
  "message": "File is empty or invalid."
}
```

#### File Too Large

**Status Code**: `400 Bad Request`

```json
{
  "error": "FileTooLarge",
  "message": "File size cannot exceed 1GB."
}
```

#### Invalid File Type

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidFileType",
  "message": "File type 'Blender Project' is not supported for model upload. Only .obj, .fbx, .gltf, and .glb files are allowed."
}
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/models \
  -F "file=@path/to/model.obj"
```

### Example Request (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', file);

const response = await fetch('http://localhost:5009/models', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
// { "id": 1, "alreadyExists": false }
```

---

## Add File to Model

Adds an additional file to an existing model. This can include textures, materials, project files, or alternative model formats.

### Endpoint

```
POST /models/{modelId}/files
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| modelId | integer | The ID of the model |

### Request

**Content-Type**: `multipart/form-data`

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | The file to add to the model |

#### Supported File Types
- **3D Models**: `.obj`, `.fbx`, `.gltf`, `.glb`
- **Project Files**: `.blend`, `.max`, `.ma`, `.mb`
- **Textures**: `.jpg`, `.jpeg`, `.png`, `.tga`, `.bmp`
- **Materials**: `.mtl`

### Process Flow

1. **File Validation**: Validates file size (max 1GB) and type
2. **Model Existence Check**: Verifies the model exists
3. **Hash Calculation**: Computes SHA-256 hash of the file content
4. **Deduplication Check**: Checks if file already exists
5. **File Storage**: If new, stores the file using hash-based storage
6. **Model Association**: Links the file to the model (if not already linked)
7. **Update Timestamp**: Updates the model's `UpdatedAt` timestamp

### Success Response

**Status Code**: `200 OK`

```json
{
  "fileId": 5,
  "alreadyLinked": false
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| fileId | integer | The ID of the added or existing file |
| alreadyLinked | boolean | `true` if file was already linked to this model, `false` if newly linked |

### Error Responses

#### Invalid File (Empty)

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidFile",
  "message": "File is empty or invalid."
}
```

#### File Too Large

**Status Code**: `400 Bad Request`

```json
{
  "error": "FileTooLarge",
  "message": "File size cannot exceed 1GB."
}
```

#### Unsupported File Type

**Status Code**: `400 Bad Request`

```json
{
  "error": "UnsupportedFileType",
  "message": "File type '.xyz' is not supported."
}
```

#### Model Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "ModelNotFound",
  "message": "Model with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/models/1/files \
  -F "file=@path/to/texture.png"
```

### Example Request (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', textureFile);

const response = await fetch('http://localhost:5009/models/1/files', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
// { "fileId": 5, "alreadyLinked": false }
```

## Notes

### Hash-Based Deduplication

The system uses SHA-256 hash-based file storage to prevent duplicate files:

1. **Same file, different models**: If you upload the same file to different models, only one physical copy is stored
2. **Automatic detection**: The system automatically detects duplicates by computing file hash
3. **Storage efficiency**: Saves disk space by storing each unique file only once
4. **Reference counting**: Multiple models can reference the same file

### Automatic Thumbnail Generation

When a new model is created:

1. A `ModelUploaded` domain event is raised
2. The system queues a thumbnail generation job
3. A worker processes the job asynchronously
4. Thumbnail status can be checked via `/models/{id}/thumbnail`

### Model Name

If no model name is provided during creation, the system automatically uses the filename (without extension) as the model name. The name can be updated later through model update endpoints (if implemented).

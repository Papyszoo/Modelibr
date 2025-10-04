# Texture Pack Endpoints

This document describes endpoints for managing texture packs. Texture packs are collections of texture files (albedo, normal, roughness, etc.) that can be associated with 3D models.

## Get All Texture Packs

Retrieves all texture packs with their textures and associated models.

### Endpoint

```
GET /texture-packs
```

### Request

No parameters required.

### Success Response

**Status Code**: `200 OK`

```json
{
  "texturePacks": [
    {
      "id": 1,
      "name": "Metal Surface Pack",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "textureCount": 5,
      "isEmpty": false,
      "textures": [
        {
          "id": 1,
          "textureType": "Albedo",
          "fileId": 10,
          "fileName": "metal_albedo.png",
          "createdAt": "2024-01-15T10:30:00Z"
        },
        {
          "id": 2,
          "textureType": "Normal",
          "fileId": 11,
          "fileName": "metal_normal.png",
          "createdAt": "2024-01-15T10:30:00Z"
        },
        {
          "id": 3,
          "textureType": "Roughness",
          "fileId": 12,
          "fileName": "metal_roughness.png",
          "createdAt": "2024-01-15T10:30:00Z"
        },
        {
          "id": 4,
          "textureType": "Metallic",
          "fileId": 13,
          "fileName": "metal_metallic.png",
          "createdAt": "2024-01-15T10:30:00Z"
        },
        {
          "id": 5,
          "textureType": "AO",
          "fileId": 14,
          "fileName": "metal_ao.png",
          "createdAt": "2024-01-15T10:30:00Z"
        }
      ],
      "associatedModels": [
        {
          "id": 1,
          "name": "Robot Model"
        },
        {
          "id": 3,
          "name": "Spaceship Model"
        }
      ]
    },
    {
      "id": 2,
      "name": "Wood Surface Pack",
      "createdAt": "2024-01-16T14:20:00Z",
      "updatedAt": "2024-01-16T14:20:00Z",
      "textureCount": 3,
      "isEmpty": false,
      "textures": [
        {
          "id": 6,
          "textureType": "Albedo",
          "fileId": 15,
          "fileName": "wood_albedo.jpg",
          "createdAt": "2024-01-16T14:20:00Z"
        },
        {
          "id": 7,
          "textureType": "Normal",
          "fileId": 16,
          "fileName": "wood_normal.jpg",
          "createdAt": "2024-01-16T14:20:00Z"
        },
        {
          "id": 8,
          "textureType": "Roughness",
          "fileId": 17,
          "fileName": "wood_roughness.jpg",
          "createdAt": "2024-01-16T14:20:00Z"
        }
      ],
      "associatedModels": []
    }
  ]
}
```

### Response Fields

#### TexturePack Object

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique texture pack identifier |
| name | string | Texture pack name |
| createdAt | datetime | Creation timestamp (ISO 8601) |
| updatedAt | datetime | Last update timestamp (ISO 8601) |
| textureCount | integer | Number of textures in the pack |
| isEmpty | boolean | `true` if pack has no textures |
| textures | array | Array of texture objects |
| associatedModels | array | Array of model summary objects |

#### Texture Object

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique texture identifier |
| textureType | string | Type of texture (see Texture Types below) |
| fileId | integer | ID of the associated file |
| fileName | string | Original filename of the texture |
| createdAt | datetime | Creation timestamp (ISO 8601) |

#### Model Summary Object

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Model ID |
| name | string | Model name |

### Texture Types

| Type | Description |
|------|-------------|
| Albedo | Base color or diffuse map |
| Normal | Normal map for surface detail |
| Height | Height or displacement map |
| AO | Ambient Occlusion map |
| Roughness | Surface roughness map |
| Metallic | Metallic surface map |
| Diffuse | Diffuse color map (legacy) |
| Specular | Specular reflectivity map |

### Example Request (cURL)

```bash
curl http://localhost:5009/texture-packs
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs');
const data = await response.json();

console.log(`Found ${data.texturePacks.length} texture packs`);
data.texturePacks.forEach(pack => {
  console.log(`${pack.name}: ${pack.textureCount} textures, ${pack.associatedModels.length} models`);
});
```

---

## Get Texture Pack by ID

Retrieves a specific texture pack by its ID.

### Endpoint

```
GET /texture-packs/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The texture pack ID |

### Success Response

**Status Code**: `200 OK`

```json
{
  "id": 1,
  "name": "Metal Surface Pack",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "textureCount": 5,
  "isEmpty": false,
  "textures": [
    {
      "id": 1,
      "textureType": "Albedo",
      "fileId": 10,
      "fileName": "metal_albedo.png",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "associatedModels": [
    {
      "id": 1,
      "name": "Robot Model"
    }
  ]
}
```

### Error Responses

#### Texture Pack Not Found

**Status Code**: `404 Not Found`

```json
{
  "error": "TexturePackNotFound",
  "message": "Texture pack with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl http://localhost:5009/texture-packs/1
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1');
const pack = await response.json();

console.log(`Pack: ${pack.name}`);
console.log(`Textures: ${pack.textures.map(t => t.textureType).join(', ')}`);
```

---

## Create Texture Pack

Creates a new empty texture pack.

### Endpoint

```
POST /texture-packs
```

### Request

**Content-Type**: `application/json`

```json
{
  "name": "Metal Surface Pack"
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Name of the texture pack (max 200 characters) |

### Success Response

**Status Code**: `201 Created`

**Location**: `/texture-packs/{id}`

```json
{
  "id": 1,
  "name": "Metal Surface Pack",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Error Responses

#### Invalid Input

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidInput",
  "message": "Texture pack name is required."
}
```

#### Name Too Long

**Status Code**: `400 Bad Request`

```json
{
  "error": "NameTooLong",
  "message": "Texture pack name cannot exceed 200 characters."
}
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/texture-packs \
  -H "Content-Type: application/json" \
  -d '{"name": "Metal Surface Pack"}'
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Metal Surface Pack'
  })
});

const pack = await response.json();
console.log(`Created texture pack with ID: ${pack.id}`);
```

---

## Update Texture Pack

Updates the name of an existing texture pack.

### Endpoint

```
PUT /texture-packs/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The texture pack ID |

### Request

**Content-Type**: `application/json`

```json
{
  "name": "Updated Metal Pack"
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | New name for the texture pack |

### Success Response

**Status Code**: `200 OK`

```json
{
  "id": 1,
  "name": "Updated Metal Pack",
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

### Error Responses

#### Invalid Input

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidInput",
  "message": "Texture pack name is required."
}
```

#### Texture Pack Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "TexturePackNotFound",
  "message": "Texture pack with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl -X PUT http://localhost:5009/texture-packs/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Metal Pack"}'
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Updated Metal Pack'
  })
});

const pack = await response.json();
console.log(`Updated pack name to: ${pack.name}`);
```

---

## Delete Texture Pack

Deletes a texture pack. Note: This does not delete the associated texture files, only the pack itself.

### Endpoint

```
DELETE /texture-packs/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The texture pack ID |

### Success Response

**Status Code**: `204 No Content`

No response body.

### Error Responses

#### Texture Pack Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "TexturePackNotFound",
  "message": "Texture pack with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl -X DELETE http://localhost:5009/texture-packs/1
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1', {
  method: 'DELETE'
});

if (response.status === 204) {
  console.log('Texture pack deleted successfully');
}
```

---

## Add Texture to Pack

Adds a texture file to a texture pack with a specified texture type.

### Endpoint

```
POST /texture-packs/{id}/textures
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The texture pack ID |

### Request

**Content-Type**: `application/json`

```json
{
  "fileId": 10,
  "textureType": "Albedo"
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| fileId | integer | Yes | ID of the texture file to add |
| textureType | string | Yes | Type of texture (Albedo, Normal, Height, AO, Roughness, Metallic, Diffuse, Specular) |

### Success Response

**Status Code**: `200 OK`

```json
{
  "id": 1,
  "texturePackId": 1,
  "fileId": 10,
  "textureType": "Albedo",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Error Responses

#### Invalid Texture Type

**Status Code**: `400 Bad Request`

```json
{
  "error": "UnsupportedTextureType",
  "message": "Texture type 'InvalidType' is not supported."
}
```

#### File Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "FileNotFound",
  "message": "File with ID 999 was not found."
}
```

#### Texture Pack Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "TexturePackNotFound",
  "message": "Texture pack with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/texture-packs/1/textures \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": 10,
    "textureType": "Albedo"
  }'
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1/textures', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileId: 10,
    textureType: 'Albedo'
  })
});

const texture = await response.json();
console.log(`Added ${texture.textureType} texture to pack`);
```

---

## Remove Texture from Pack

Removes a texture from a texture pack.

### Endpoint

```
DELETE /texture-packs/{packId}/textures/{textureId}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| packId | integer | The texture pack ID |
| textureId | integer | The texture ID to remove |

### Success Response

**Status Code**: `204 No Content`

No response body.

### Error Responses

#### Texture Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "TextureNotFound",
  "message": "Texture with ID 999 was not found in pack."
}
```

### Example Request (cURL)

```bash
curl -X DELETE http://localhost:5009/texture-packs/1/textures/5
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1/textures/5', {
  method: 'DELETE'
});

if (response.status === 204) {
  console.log('Texture removed from pack');
}
```

---

## Associate Texture Pack with Model

Associates a texture pack with a 3D model.

### Endpoint

```
POST /texture-packs/{packId}/models/{modelId}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| packId | integer | The texture pack ID |
| modelId | integer | The model ID |

### Success Response

**Status Code**: `204 No Content`

No response body.

### Error Responses

#### Texture Pack Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "TexturePackNotFound",
  "message": "Texture pack with ID 999 was not found."
}
```

#### Model Not Found

**Status Code**: `400 Bad Request```json
{
  "error": "ModelNotFound",
  "message": "Model with ID 999 was not found."
}
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/texture-packs/1/models/5
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1/models/5', {
  method: 'POST'
});

if (response.status === 204) {
  console.log('Texture pack associated with model');
}
```

---

## Disassociate Texture Pack from Model

Removes the association between a texture pack and a model.

### Endpoint

```
DELETE /texture-packs/{packId}/models/{modelId}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| packId | integer | The texture pack ID |
| modelId | integer | The model ID |

### Success Response

**Status Code**: `204 No Content`

No response body.

### Error Responses

#### Association Not Found

**Status Code**: `400 Bad Request`

```json
{
  "error": "AssociationNotFound",
  "message": "Texture pack is not associated with model."
}
```

### Example Request (cURL)

```bash
curl -X DELETE http://localhost:5009/texture-packs/1/models/5
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/texture-packs/1/models/5', {
  method: 'DELETE'
});

if (response.status === 204) {
  console.log('Texture pack disassociated from model');
}
```

## Notes

### Texture Pack Workflow

1. **Create Pack**: Create empty texture pack with a name
2. **Upload Textures**: Upload texture image files to the model
3. **Add to Pack**: Add uploaded files to the pack with appropriate types
4. **Associate**: Link the pack to one or more models
5. **Use in Rendering**: Frontend can retrieve pack and apply textures

### Complete Example (JavaScript)

```javascript
// 1. Create texture pack
const createResponse = await fetch('http://localhost:5009/texture-packs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Metal Surface Pack' })
});
const pack = await createResponse.json();
console.log(`Created pack ID: ${pack.id}`);

// 2. Upload texture files to model (assuming model ID 1)
const textureTypes = ['Albedo', 'Normal', 'Roughness', 'Metallic', 'AO'];
const textureFiles = [albedoFile, normalFile, roughnessFile, metallicFile, aoFile];

for (let i = 0; i < textureFiles.length; i++) {
  const formData = new FormData();
  formData.append('file', textureFiles[i]);
  
  const uploadResponse = await fetch('http://localhost:5009/models/1/files', {
    method: 'POST',
    body: formData
  });
  
  const uploadResult = await uploadResponse.json();
  const fileId = uploadResult.fileId;
  
  // 3. Add texture to pack
  await fetch(`http://localhost:5009/texture-packs/${pack.id}/textures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: fileId,
      textureType: textureTypes[i]
    })
  });
  
  console.log(`Added ${textureTypes[i]} texture`);
}

// 4. Associate pack with model
await fetch(`http://localhost:5009/texture-packs/${pack.id}/models/1`, {
  method: 'POST'
});

console.log('Texture pack complete and associated with model');
```

### PBR Texture Workflow

For Physically Based Rendering (PBR), typical texture packs include:

- **Albedo**: Base color (no lighting information)
- **Normal**: Surface detail and bumps
- **Roughness**: How rough/smooth the surface is
- **Metallic**: Metallic vs. dielectric materials
- **AO**: Ambient occlusion for shadows

### Legacy Textures

For older rendering pipelines:

- **Diffuse**: Base color with baked lighting
- **Specular**: Reflectivity and shine

### File Management

- Texture files are uploaded to models first, then added to packs
- Same file can be used in multiple texture packs
- Deleting a pack doesn't delete the files
- Files can be retrieved individually via `/files/{id}`

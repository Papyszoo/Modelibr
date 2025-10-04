# Modelibr Backend API Documentation

Welcome to the Modelibr Backend API documentation. This API provides comprehensive endpoints for managing 3D models, files, thumbnails, and texture packs.

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Common Response Formats](#common-response-formats)
4. [Error Handling](#error-handling)
5. [File Type Support](#file-type-support)
6. [Validation Rules](#validation-rules)

## Overview

The Modelibr API is built using ASP.NET Core 9.0 with Clean Architecture principles. It provides RESTful endpoints for:

- **Model Management**: Upload and manage 3D models
- **File Management**: Add additional files to models and retrieve them
- **Thumbnail Management**: Generate, upload, and retrieve model thumbnails
- **Texture Pack Management**: Organize textures and associate them with models
- **Background Jobs**: Worker endpoints for thumbnail generation

## API Endpoints

### Model Management

- [POST /models](./endpoints/models.md#create-model) - Create a new model by uploading a 3D file
- [POST /models/{modelId}/files](./endpoints/models.md#add-file-to-model) - Add additional files to an existing model

### Model Queries

- [GET /models](./endpoints/models-query.md#get-all-models) - Retrieve all models with their files
- [GET /models/{id}](./endpoints/models-query.md#get-model-by-id) - Retrieve a specific model by ID
- [GET /models/{id}/file](./endpoints/models-query.md#get-model-file) - Download the primary model file

### File Management

- [GET /files/{id}](./endpoints/files.md#get-file) - Download any file by its ID

### Thumbnail Management

- [GET /models/{id}/thumbnail](./endpoints/thumbnails.md#get-thumbnail-status) - Get thumbnail status and metadata
- [POST /models/{id}/thumbnail/regenerate](./endpoints/thumbnails.md#regenerate-thumbnail) - Queue thumbnail regeneration
- [POST /models/{id}/thumbnail/upload](./endpoints/thumbnails.md#upload-thumbnail) - Upload a custom thumbnail
- [GET /models/{id}/thumbnail/file](./endpoints/thumbnails.md#get-thumbnail-file) - Download the thumbnail image

### Thumbnail Jobs (Worker API)

- [POST /api/thumbnail-jobs/dequeue](./endpoints/thumbnail-jobs.md#dequeue-job) - Dequeue a thumbnail job for processing
- [POST /api/thumbnail-jobs/{jobId}/complete](./endpoints/thumbnail-jobs.md#complete-job) - Mark a thumbnail job as completed
- [POST /api/test/thumbnail-complete/{modelId}](./endpoints/thumbnail-jobs.md#test-notification) - Test thumbnail completion notification

### Texture Pack Management

- [GET /texture-packs](./endpoints/texture-packs.md#get-all-texture-packs) - Retrieve all texture packs
- [GET /texture-packs/{id}](./endpoints/texture-packs.md#get-texture-pack-by-id) - Retrieve a specific texture pack
- [POST /texture-packs](./endpoints/texture-packs.md#create-texture-pack) - Create a new texture pack
- [PUT /texture-packs/{id}](./endpoints/texture-packs.md#update-texture-pack) - Update a texture pack
- [DELETE /texture-packs/{id}](./endpoints/texture-packs.md#delete-texture-pack) - Delete a texture pack

### Texture Management

- [POST /texture-packs/{id}/textures](./endpoints/texture-packs.md#add-texture-to-pack) - Add a texture to a pack
- [DELETE /texture-packs/{packId}/textures/{textureId}](./endpoints/texture-packs.md#remove-texture-from-pack) - Remove a texture from a pack

### Model-Texture Pack Association

- [POST /texture-packs/{packId}/models/{modelId}](./endpoints/texture-packs.md#associate-with-model) - Associate a texture pack with a model
- [DELETE /texture-packs/{packId}/models/{modelId}](./endpoints/texture-packs.md#disassociate-from-model) - Remove texture pack association

## Common Response Formats

### Success Response
```json
{
  "id": 1,
  "name": "Model Name",
  "createdAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T12:00:00Z"
}
```

### Error Response
```json
{
  "error": "ErrorCode",
  "message": "Human-readable error message"
}
```

## Error Handling

All endpoints follow a consistent error handling pattern:

- **400 Bad Request**: Validation errors, invalid input
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Unexpected server errors

Error responses include:
- `error`: A machine-readable error code
- `message`: A human-readable error description

## File Type Support

### Renderable 3D Models (Model Upload)
- `.obj` - Wavefront OBJ
- `.fbx` - Autodesk FBX
- `.gltf` - glTF JSON
- `.glb` - glTF Binary

### Additional Files (File Upload)
- **3D Models**: `.obj`, `.fbx`, `.gltf`, `.glb`
- **Project Files**: `.blend`, `.max`, `.ma`, `.mb`
- **Textures**: `.jpg`, `.jpeg`, `.png`, `.tga`, `.bmp`
- **Materials**: `.mtl`

### Thumbnail Images
- `.png`, `.jpg`, `.jpeg`, `.webp`

## Validation Rules

### Model Upload
- **File size**: Maximum 1GB (1,073,741,824 bytes)
- **File type**: Must be renderable (obj, fbx, gltf, glb)
- **File content**: Cannot be empty

### Additional File Upload
- **File size**: Maximum 1GB (1,073,741,824 bytes)
- **File type**: Must be supported (see File Type Support)
- **File content**: Cannot be empty

### Thumbnail Upload
- **File size**: Maximum 10MB (10,485,760 bytes)
- **File type**: Must be image (png, jpg, jpeg, webp)
- **File content**: Cannot be empty

### Texture Pack
- **Name**: Required, maximum 200 characters
- **Textures**: Valid texture types (Albedo, Normal, Height, AO, Roughness, Metallic, Diffuse, Specular)

## Base URL

Development: `http://localhost:5009`

Production: As configured in your deployment

## Authentication

Currently, the API does not require authentication. This may be added in future versions.

## Rate Limiting

No rate limiting is currently implemented.

## CORS

CORS is configured to allow requests from:
- `http://localhost:3000`
- `https://localhost:3000`

Additional origins can be configured in the application settings.

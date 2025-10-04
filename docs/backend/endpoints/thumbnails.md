# Thumbnail Endpoints

This document describes endpoints for managing model thumbnails. Thumbnails can be automatically generated, manually uploaded, or regenerated on demand.

## Get Thumbnail Status

Retrieves the status and metadata of a model's thumbnail. This includes information about whether the thumbnail is ready, being processed, or has failed.

### Endpoint

```
GET /models/{id}/thumbnail
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Success Response

**Status Code**: `200 OK`

**Headers** (when thumbnail is ready):
- `Cache-Control: public, max-age=3600` - Cache for 1 hour
- `ETag: "{modelId}-{processedAtTicks}"` - Entity tag for caching

```json
{
  "status": "Ready",
  "fileUrl": "/models/1/thumbnail/file",
  "sizeBytes": 45678,
  "width": 512,
  "height": 512,
  "errorMessage": null,
  "createdAt": "2024-01-15T10:30:00Z",
  "processedAt": "2024-01-15T10:30:15Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| status | string | Thumbnail status: `None`, `Pending`, `Processing`, `Ready`, `Failed` |
| fileUrl | string | URL to download thumbnail (null if not ready) |
| sizeBytes | long | File size in bytes (null if not ready) |
| width | integer | Image width in pixels (null if not ready) |
| height | integer | Image height in pixels (null if not ready) |
| errorMessage | string | Error message if failed (null otherwise) |
| createdAt | datetime | When thumbnail job was created (ISO 8601) |
| processedAt | datetime | When thumbnail was processed (ISO 8601, null if not processed) |

### Thumbnail Status Values

| Status | Description |
|--------|-------------|
| None | No thumbnail exists for this model |
| Pending | Thumbnail generation queued, waiting for worker |
| Processing | Worker is currently generating thumbnail |
| Ready | Thumbnail successfully generated and available |
| Failed | Thumbnail generation failed (see errorMessage) |

### Error Responses

#### Model Not Found

**Status Code**: `404 Not Found`

**Response Body**: Plain text error message

```
Model with ID 999 was not found.
```

### Example Request (cURL)

```bash
curl http://localhost:5009/models/1/thumbnail
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/models/1/thumbnail');
const thumbnailStatus = await response.json();

console.log(thumbnailStatus);
// {
//   "status": "Ready",
//   "fileUrl": "/models/1/thumbnail/file",
//   "sizeBytes": 45678,
//   "width": 512,
//   "height": 512,
//   ...
// }

// Check if ready and download
if (thumbnailStatus.status === 'Ready' && thumbnailStatus.fileUrl) {
  const imgResponse = await fetch(`http://localhost:5009${thumbnailStatus.fileUrl}`);
  const blob = await imgResponse.blob();
  const imageUrl = URL.createObjectURL(blob);
  
  const img = document.createElement('img');
  img.src = imageUrl;
  document.body.appendChild(img);
}
```

---

## Regenerate Thumbnail

Queues a thumbnail regeneration job. This will create a new thumbnail for the model, replacing any existing one. Useful when the model has been updated or the thumbnail generation failed.

### Endpoint

```
POST /models/{id}/thumbnail/regenerate
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Request

No request body required.

### Success Response

**Status Code**: `200 OK`

```json
{
  "message": "Thumbnail regeneration queued successfully",
  "modelId": 1
}
```

### Process Flow

1. **Model Validation**: Verifies the model exists
2. **Job Creation**: Creates or updates thumbnail job to `Pending` status
3. **Queue Notification**: Notifies workers that a new job is available
4. **Async Processing**: Worker picks up job and generates thumbnail
5. **Status Update**: Status changes from `Pending` → `Processing` → `Ready`/`Failed`

### Error Responses

#### Model Not Found

**Status Code**: `404 Not Found`

**Response Body**: Plain text error message

```
Model with ID 999 was not found.
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/models/1/thumbnail/regenerate
```

### Example Request (JavaScript)

```javascript
const response = await fetch('http://localhost:5009/models/1/thumbnail/regenerate', {
  method: 'POST'
});

const result = await response.json();
console.log(result);
// { "message": "Thumbnail regeneration queued successfully", "modelId": 1 }

// Poll for completion
async function waitForThumbnail(modelId) {
  while (true) {
    const statusResponse = await fetch(`http://localhost:5009/models/${modelId}/thumbnail`);
    const status = await statusResponse.json();
    
    if (status.status === 'Ready') {
      console.log('Thumbnail ready!');
      return status;
    } else if (status.status === 'Failed') {
      console.error('Thumbnail generation failed:', status.errorMessage);
      return null;
    }
    
    console.log(`Status: ${status.status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }
}

await waitForThumbnail(1);
```

---

## Upload Thumbnail

Uploads a custom thumbnail image for a model. This bypasses automatic generation and allows you to provide your own thumbnail.

### Endpoint

```
POST /models/{id}/thumbnail/upload
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Request

**Content-Type**: `multipart/form-data`

#### Form Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | The thumbnail image file |
| width | integer | No | Image width in pixels (auto-detected if not provided) |
| height | integer | No | Image height in pixels (auto-detected if not provided) |

#### Supported Image Formats
- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- WebP (`.webp`)

#### Validation Rules
- **File size**: Maximum 10MB (10,485,760 bytes)
- **Content type**: Must be image/png, image/jpeg, image/jpg, or image/webp
- **File content**: Cannot be empty

### Success Response

**Status Code**: `200 OK`

```json
{
  "message": "Thumbnail uploaded successfully",
  "modelId": 1,
  "thumbnailPath": "/var/lib/modelibr/uploads/thumbnails/abc123.png",
  "sizeBytes": 45678,
  "width": 512,
  "height": 512
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| message | string | Success message |
| modelId | integer | The model ID |
| thumbnailPath | string | Server path where thumbnail is stored |
| sizeBytes | long | File size in bytes |
| width | integer | Image width in pixels |
| height | integer | Image height in pixels |

### Error Responses

#### Invalid Thumbnail File

**Status Code**: `400 Bad Request`

```json
{
  "error": "InvalidThumbnailFile",
  "message": "Thumbnail file is empty or invalid."
}
```

#### Thumbnail File Too Large

**Status Code**: `400 Bad Request`

```json
{
  "error": "ThumbnailFileTooLarge",
  "message": "Thumbnail file size cannot exceed 10MB."
}
```

#### Invalid Thumbnail Format

**Status Code**: `400 Bad Request```json
{
  "error": "InvalidThumbnailFormat",
  "message": "Thumbnail must be a valid image file (png, jpg, jpeg, webp)."
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
# Upload thumbnail
curl -X POST http://localhost:5009/models/1/thumbnail/upload \
  -F "file=@thumbnail.png"

# Upload with dimensions
curl -X POST http://localhost:5009/models/1/thumbnail/upload \
  -F "file=@thumbnail.png" \
  -F "width=512" \
  -F "height=512"
```

### Example Request (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', thumbnailFile);
formData.append('width', '512');
formData.append('height', '512');

const response = await fetch('http://localhost:5009/models/1/thumbnail/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
// {
//   "message": "Thumbnail uploaded successfully",
//   "modelId": 1,
//   "thumbnailPath": "/var/lib/modelibr/uploads/thumbnails/abc123.png",
//   "sizeBytes": 45678,
//   "width": 512,
//   "height": 512
// }
```

---

## Get Thumbnail File

Downloads the actual thumbnail image file. This endpoint serves the thumbnail with appropriate caching headers for optimal performance.

### Endpoint

```
GET /models/{id}/thumbnail/file
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The model ID |

### Success Response

**Status Code**: `200 OK`

**Content-Type**: `image/png` (typically PNG format)

**Response Body**: Raw image binary data

**Headers**:
- `Accept-Ranges: bytes` - Supports partial content requests
- `Cache-Control: public, max-age=86400` - Cache for 24 hours
- `ETag: "{modelId}-{processedAtTicks}"` - Entity tag for caching

### Error Responses

#### Thumbnail Not Ready

**Status Code**: `404 Not Found`

**Response Body**: Plain text

```
Thumbnail not ready or not found
```

#### Thumbnail File Missing

**Status Code**: `404 Not Found`

**Response Body**: Plain text

```
Thumbnail file not found on disk
```

#### Model Not Found

**Status Code**: `404 Not Found`

**Response Body**: Plain text

```
Model with ID 999 was not found.
```

### Example Request (cURL)

```bash
# Download thumbnail
curl http://localhost:5009/models/1/thumbnail/file -o thumbnail.png
```

### Example Request (JavaScript)

```javascript
// Display thumbnail in page
const img = document.createElement('img');
img.src = 'http://localhost:5009/models/1/thumbnail/file';
img.alt = 'Model Thumbnail';
document.body.appendChild(img);

// Download thumbnail
const response = await fetch('http://localhost:5009/models/1/thumbnail/file');
const blob = await response.blob();
const url = URL.createObjectURL(blob);

const a = document.createElement('a');
a.href = url;
a.download = 'thumbnail.png';
a.click();

URL.revokeObjectURL(url);
```

### Example Request (React Component)

```jsx
function ModelThumbnail({ modelId }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    async function loadThumbnail() {
      try {
        // Check thumbnail status
        const statusRes = await fetch(`http://localhost:5009/models/${modelId}/thumbnail`);
        const statusData = await statusRes.json();
        
        if (statusData.status === 'Ready') {
          setThumbnail(`http://localhost:5009/models/${modelId}/thumbnail/file`);
          setStatus('ready');
        } else if (statusData.status === 'Failed') {
          setStatus('failed');
        } else {
          setStatus(statusData.status.toLowerCase());
        }
      } catch (error) {
        setStatus('error');
        console.error('Error loading thumbnail:', error);
      }
    }

    loadThumbnail();
  }, [modelId]);

  if (status === 'loading' || status === 'pending' || status === 'processing') {
    return <div>Generating thumbnail...</div>;
  }

  if (status === 'failed' || status === 'error') {
    return <div>Thumbnail not available</div>;
  }

  return (
    <img 
      src={thumbnail} 
      alt="Model Thumbnail"
      style={{ width: '256px', height: '256px', objectFit: 'cover' }}
    />
  );
}
```

## Notes

### Automatic Generation

When a new model is created:
1. A `ModelUploaded` domain event is raised
2. The system creates a thumbnail job with `Pending` status
3. A worker picks up the job and processes it
4. Thumbnail is generated and stored
5. Status updates to `Ready` or `Failed`

### Manual Upload vs Auto-Generation

- **Auto-Generation**: Automatically creates thumbnails from 3D models
- **Manual Upload**: Allows custom, pre-rendered thumbnails
- **Regeneration**: Re-creates thumbnails from the model

You can mix both approaches:
1. Let the system auto-generate initially
2. Upload a custom thumbnail if you prefer a specific view
3. Regenerate if needed

### Caching Strategy

The thumbnail endpoints implement aggressive caching:

1. **Status Endpoint**: 1-hour cache when thumbnail is ready
2. **File Endpoint**: 24-hour cache for thumbnail images
3. **ETags**: Based on model ID and processing timestamp
4. **Cache Invalidation**: ETag changes when thumbnail is regenerated

### Real-Time Updates with SignalR

The system provides real-time thumbnail status updates via SignalR:

```javascript
// Connect to SignalR hub
const connection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5009/thumbnailHub")
  .build();

// Listen for thumbnail updates
connection.on("ThumbnailStatusChanged", (modelId, status, thumbnailUrl, errorMessage) => {
  console.log(`Model ${modelId} thumbnail status: ${status}`);
  
  if (status === 'Ready') {
    // Update UI with thumbnail
    updateThumbnail(modelId, thumbnailUrl);
  } else if (status === 'Failed') {
    console.error(`Thumbnail generation failed: ${errorMessage}`);
  }
});

await connection.start();
```

### Performance Considerations

- Thumbnails are stored separately from model files
- Image format is typically PNG for quality
- Range requests supported for efficient loading
- Concurrent thumbnail generation handled by worker pool
- Failed jobs are retried with exponential backoff

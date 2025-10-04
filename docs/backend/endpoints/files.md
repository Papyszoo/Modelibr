# File Endpoints

This document describes endpoints for retrieving individual files by their ID.

## Get File

Downloads any file by its unique ID. This endpoint can be used to retrieve any file in the system, including model files, textures, materials, and project files.

### Endpoint

```
GET /files/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | The file ID |

### Success Response

**Status Code**: `200 OK`

**Content-Type**: Appropriate MIME type for the file

**Content-Disposition**: `attachment; filename="original-filename.ext"`

**Response Body**: Raw file binary data

**Headers**:
- `Accept-Ranges: bytes` - Supports partial content requests
- `Content-Length: {size}` - File size in bytes

### Process Flow

1. **File Lookup**: Retrieves file metadata by ID
2. **File Path Resolution**: Gets the physical file path from hash-based storage
3. **File Stream**: Opens file stream for reading
4. **Content Type Detection**: Determines appropriate MIME type based on file extension
5. **Range Support**: Enables range requests for large files

### MIME Types

The endpoint automatically determines the correct MIME type based on file extension:

| Extension | MIME Type |
|-----------|-----------|
| .obj | model/obj |
| .fbx | application/octet-stream |
| .gltf | model/gltf+json |
| .glb | model/gltf-binary |
| .blend | application/x-blender |
| .jpg, .jpeg | image/jpeg |
| .png | image/png |
| .tga | image/tga |
| .bmp | image/bmp |
| .mtl | text/plain |
| Others | application/octet-stream |

### Error Responses

#### File Not Found

**Status Code**: `404 Not Found`

**Response Body**: Plain text error message

```
File with ID 999 was not found.
```

#### File Missing on Disk

**Status Code**: `404 Not Found`

**Response Body**: Plain text error message

```
File not found on disk.
```

### Example Request (cURL)

```bash
# Download the file
curl http://localhost:5009/files/5 -o downloaded-file.png

# Download with range request (first 1KB)
curl http://localhost:5009/files/5 \
  -H "Range: bytes=0-1023" \
  -o partial-file.png
```

### Example Request (JavaScript)

```javascript
// Simple download
const response = await fetch('http://localhost:5009/files/5');
const blob = await response.blob();

// Create download link
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'texture.png';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
window.URL.revokeObjectURL(url);
```

### Example Request (JavaScript - Display Image)

```javascript
// Download and display image
const response = await fetch('http://localhost:5009/files/5');
const blob = await response.blob();
const imageUrl = window.URL.createObjectURL(blob);

// Display in image element
const img = document.createElement('img');
img.src = imageUrl;
document.body.appendChild(img);

// Cleanup when done
img.onload = () => {
  window.URL.revokeObjectURL(imageUrl);
};
```

### Example Request (Python)

```python
import requests

# Download file
response = requests.get('http://localhost:5009/files/5')

if response.status_code == 200:
    with open('downloaded-file.png', 'wb') as f:
        f.write(response.content)
    print('File downloaded successfully')
else:
    print(f'Error: {response.text}')
```

### Example Request (Python - Streaming Download)

```python
import requests

# Stream large file
url = 'http://localhost:5009/files/5'
response = requests.get(url, stream=True)

if response.status_code == 200:
    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0
    
    with open('large-file.obj', 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                print(f'Downloaded {downloaded}/{total_size} bytes')
    
    print('Download complete!')
else:
    print(f'Error: {response.text}')
```

## Use Cases

### Retrieving Model Textures

When you have a model with associated texture files, you can retrieve them using this endpoint:

```javascript
// Get model with files
const modelResponse = await fetch('http://localhost:5009/models/1');
const model = await modelResponse.json();

// Find texture files
const textureFiles = model.files.filter(f => 
  f.fileType.category === 'Texture'
);

// Download each texture
for (const texture of textureFiles) {
  const fileResponse = await fetch(`http://localhost:5009/files/${texture.id}`);
  const blob = await fileResponse.blob();
  
  // Use the texture...
  console.log(`Downloaded: ${texture.originalFileName}`);
}
```

### Retrieving Material Files

Download material definition files (MTL for OBJ models):

```javascript
// Get model with files
const modelResponse = await fetch('http://localhost:5009/models/1');
const model = await modelResponse.json();

// Find material files
const materialFile = model.files.find(f => 
  f.fileType.category === 'Material'
);

if (materialFile) {
  const fileResponse = await fetch(`http://localhost:5009/files/${materialFile.id}`);
  const materialContent = await fileResponse.text();
  console.log('Material definition:', materialContent);
}
```

### Bulk Download

Download all files associated with a model:

```javascript
async function downloadAllModelFiles(modelId) {
  // Get model
  const modelResponse = await fetch(`http://localhost:5009/models/${modelId}`);
  const model = await modelResponse.json();
  
  // Download all files
  const downloads = model.files.map(async (file) => {
    const response = await fetch(`http://localhost:5009/files/${file.id}`);
    const blob = await response.blob();
    
    return {
      name: file.originalFileName,
      blob: blob,
      type: file.mimeType
    };
  });
  
  const files = await Promise.all(downloads);
  console.log(`Downloaded ${files.length} files`);
  return files;
}

// Usage
const files = await downloadAllModelFiles(1);
```

## Notes

### Hash-Based Storage

- Files are stored using SHA-256 hash-based storage system
- Multiple files with identical content share the same physical file
- The endpoint abstracts this detail and serves files by their logical ID
- Original filenames are preserved in metadata

### Performance

- **Range Requests**: Supports HTTP range requests for efficient partial downloads
- **Streaming**: Files are streamed directly from disk without loading into memory
- **Large Files**: Can handle files up to 1GB efficiently
- **Concurrent Downloads**: Multiple files can be downloaded simultaneously

### Security Considerations

- Currently no authentication required
- Consider implementing access control for sensitive files
- Validate file IDs to prevent path traversal attacks (already implemented)
- Rate limiting may be beneficial for production use

### Content-Type Detection

The system uses a custom `ContentTypeProvider` to determine MIME types. If you encounter issues with specific file types, the provider can be extended to support additional formats.

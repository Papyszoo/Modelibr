# Worker Service API Integration

This document explains how to run the worker service with the new API-based thumbnail storage approach that eliminates filesystem permission issues.

## Problem Solved

The original worker service failed with:
```
error: Failed to create thumbnail storage directory {"metadata":{"basePath":"/var/lib/modelibr/thumbnails","error":"EACCES: permission denied, mkdir '/var/lib/modelibr/thumbnails'"}}
```

This solution replaces filesystem storage with HTTP API uploads to the backend.

## Architecture Changes

### Before (Filesystem)
```
Worker Service → Generate Thumbnails → Write to /var/lib/modelibr/thumbnails/ → Permission Error ❌
```

### After (API)
```
Worker Service → Generate Thumbnails → HTTP Upload to Backend API → Backend Stores via IFileStorage ✅
```

## Configuration

### Backend (.NET API)
The backend now includes a new endpoint:
- `POST /models/{id}/thumbnail/upload` - Accepts multipart form uploads

### Worker Service (Node.js)
Key environment variables:
```bash
# API connection
API_BASE_URL=http://localhost:5009  # Backend API URL

# Thumbnail storage
THUMBNAIL_STORAGE_ENABLED=true     # Enable API upload
THUMBNAIL_STORAGE_PATH=/tmp/thumbnails  # Temp path for generated files (not persistent)

# The worker no longer needs write access to persistent storage directories
```

## Running the Services

### 1. Start Backend API
```bash
cd src/WebApi
export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
dotnet run
```

### 2. Start Worker Service
```bash
cd src/worker-service
npm install
export API_BASE_URL="http://localhost:5009"
export THUMBNAIL_STORAGE_ENABLED="true"
export THUMBNAIL_STORAGE_PATH="/tmp/thumbnails"
npm start
```

### 3. Docker Compose (Recommended)
The worker service now works in Docker without special volume permissions:
```yaml
worker:
  environment:
    - API_BASE_URL=http://api:5009
    - THUMBNAIL_STORAGE_ENABLED=true
    - THUMBNAIL_STORAGE_PATH=/tmp/thumbnails  # No special permissions needed
```

## API Flow

### Thumbnail Generation Process
1. **Job Processing**: Worker receives thumbnail job for model
2. **File Fetch**: Worker downloads model file from API
3. **Rendering**: Worker generates WebP and poster thumbnails  
4. **API Upload**: Worker uploads thumbnails via `POST /models/{id}/thumbnail/upload`
5. **Backend Storage**: Backend stores files using existing `IFileStorage` infrastructure
6. **Database Update**: Backend updates `Thumbnail` entity with file details

### API Endpoint Details

#### Upload Thumbnail
```http
POST /models/{id}/thumbnail/upload
Content-Type: multipart/form-data

file: [thumbnail file]
width: [optional - thumbnail width]
height: [optional - thumbnail height]
```

**Response:**
```json
{
  "Message": "Thumbnail uploaded successfully",
  "ModelId": 123,
  "ThumbnailPath": "/path/to/stored/file",
  "SizeBytes": 45678,
  "Width": 256,
  "Height": 256
}
```

## Testing

### Integration Test
Run the included test script when database is available:
```bash
./test-thumbnail-api.sh
```

### Manual Testing
```bash
# 1. Upload a model
curl -X POST -F "file=@model.obj" http://localhost:5009/models

# 2. Upload thumbnail (use returned model ID)
curl -X POST -F "file=@thumbnail.png" -F "width=256" -F "height=256" \
     http://localhost:5009/models/1/thumbnail/upload

# 3. Check thumbnail status
curl http://localhost:5009/models/1/thumbnail

# 4. Download thumbnail
curl http://localhost:5009/models/1/thumbnail/file -o thumbnail.png
```

## Benefits

✅ **No Permission Issues**: Worker doesn't need filesystem write access  
✅ **Centralized Storage**: Backend handles all file storage consistently  
✅ **Existing Infrastructure**: Uses existing `IFileStorage` and deduplication  
✅ **Clean Architecture**: Maintains separation between worker and storage  
✅ **Docker Friendly**: Works in containers without volume mount complexity  

## Monitoring

### Worker Service Logs
```bash
# API connection test
API connection test successful

# Thumbnail upload process
Starting API-based thumbnail storage
Uploading thumbnail to API
Thumbnail uploaded successfully
API-based thumbnail storage completed
```

### Backend Logs
```bash
# Thumbnail upload received
Thumbnail uploaded successfully
Stored WebP thumbnail
```

## Troubleshooting

### Worker Can't Connect to API
- Check `API_BASE_URL` environment variable
- Verify backend is running and accessible
- Check network connectivity in Docker

### Upload Fails
- Verify model ID exists in database
- Check file format (PNG, JPG, JPEG, WebP supported)
- Check file size (max 10MB)

### Permission Issues (Should Not Occur)
If you still see permission errors, the worker may be using old filesystem storage:
- Verify `THUMBNAIL_STORAGE_ENABLED=true`
- Check worker logs for "API-based thumbnail storage" messages
- Restart worker service to reload configuration
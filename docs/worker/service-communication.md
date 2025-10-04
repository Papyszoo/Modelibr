# Service Communication

This document details how the worker service communicates with other services, focusing on the Web API integration through both HTTP REST API and SignalR real-time messaging.

## Communication Overview

The worker service uses a hybrid communication approach:

1. **SignalR (Real-time)**: Receives instant job notifications when work is available
2. **HTTP REST API**: Claims jobs, fetches data, uploads results, and reports status

This combination provides:
- **Low latency**: Immediate job processing via real-time notifications
- **Reliability**: HTTP-based job claiming prevents race conditions
- **Scalability**: Multiple workers can operate concurrently
- **Resilience**: Fallback to polling if SignalR connection fails

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      Web API (.NET Core)                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              ThumbnailQueue (Domain Service)           │ │
│  │  • Enqueues jobs when models uploaded                  │ │
│  │  • Notifies SignalR hub                                │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│                   ▼                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        ThumbnailJobHub (SignalR Hub)                   │ │
│  │  • Broadcasts JobEnqueued events                       │ │
│  │  • Receives job acknowledgments                        │ │
│  │  • Manages worker connections                          │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │ SignalR                                  │
│                   │ (WebSocket/SSE)                          │
└───────────────────┼──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│                Worker Service (Node.js)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           SignalRQueueService                          │ │
│  │  • Maintains SignalR connection                        │ │
│  │  • Receives JobEnqueued notifications                  │ │
│  │  • Sends acknowledgments                               │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│                   ▼                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              JobProcessor                              │ │
│  │  • Handles job notifications                           │ │
│  │  • Coordinates HTTP API calls                          │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│                   ▼                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        ThumbnailJobService (HTTP Client)               │ │
│  │  • Dequeues jobs (claims with worker ID)               │ │
│  │  • Fetches model files                                 │ │
│  │  • Reports completion/failure                          │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│                   ▼                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        ThumbnailApiService (HTTP Client)               │ │
│  │  • Uploads generated thumbnails                        │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
└───────────────────┼──────────────────────────────────────────┘
                    │ HTTP REST
                    ▼
┌──────────────────────────────────────────────────────────────┐
│                   Web API Endpoints                          │
│                                                              │
│  POST /api/thumbnail-jobs/dequeue                           │
│  POST /api/thumbnail-jobs/{id}/complete                     │
│  POST /api/thumbnail-jobs/{id}/fail                         │
│  GET  /models/{id}/file                                     │
│  POST /models/{id}/thumbnail/upload                         │
│  GET  /health                                               │
└──────────────────────────────────────────────────────────────┘
```

## SignalR Communication (Real-time)

### Connection Setup

The worker establishes a SignalR connection on startup:

```javascript
// signalrQueueService.js
this.connection = new HubConnectionBuilder()
  .withUrl(`${config.apiBaseUrl}/hubs/thumbnail-jobs`, {
    transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents,
  })
  .withAutomaticReconnect({
    nextRetryDelayInMilliseconds: (retryContext) => {
      // Exponential backoff: 0, 2, 10, 30 seconds
      if (retryContext.previousRetryCount === 0) return 0
      if (retryContext.previousRetryCount === 1) return 2000
      if (retryContext.previousRetryCount === 2) return 10000
      return 30000
    },
  })
  .configureLogging(LogLevel.Warning)
  .build()
```

**Hub URL**: `{API_BASE_URL}/hubs/thumbnail-jobs`

**Transports** (in order of preference):
1. WebSockets (preferred for low latency)
2. Server-Sent Events (fallback)

**Reconnection Strategy**:
- Automatic reconnect with exponential backoff
- Retry delays: 0s, 2s, 10s, 30s
- Infinite retry attempts

### SignalR Events

#### JobEnqueued (Server → Worker)

Sent when a new thumbnail job is available.

**Event Name**: `JobEnqueued`

**Payload**:
```json
{
  "JobId": 123,
  "ModelId": 456,
  "ModelHash": "abc123def456...",
  "Status": "Pending",
  "AttemptCount": 0,
  "CreatedAt": "2025-01-10T12:00:00Z"
}
```

**Worker Handler**:
```javascript
this.connection.on('JobEnqueued', jobNotification => {
  logger.debug('Received job enqueued notification', {
    jobId: jobNotification.JobId,
    modelId: jobNotification.ModelId,
  })

  if (this.jobReceivedCallback) {
    // Transform to job format
    const job = {
      id: jobNotification.JobId,
      modelId: jobNotification.ModelId,
      modelHash: jobNotification.ModelHash,
      status: jobNotification.Status,
      attemptCount: jobNotification.AttemptCount,
      createdAt: jobNotification.CreatedAt,
    }
    
    this.jobReceivedCallback(job)
  }
})
```

**Processing Flow**:
1. Worker receives notification
2. Checks if below MAX_CONCURRENT_JOBS limit
3. Attempts to claim job via HTTP API
4. If successful, processes job
5. If job already claimed, ignores notification

#### JobStatusChanged (Server → Worker)

Sent when job status changes (for coordination).

**Event Name**: `JobStatusChanged`

**Payload**:
```json
{
  "JobId": 123,
  "Status": "InProgress",
  "WorkerId": "worker-5678",
  "UpdatedAt": "2025-01-10T12:00:00Z"
}
```

**Worker Handler**:
```javascript
this.connection.on('JobStatusChanged', statusUpdate => {
  logger.debug('Job status changed', {
    jobId: statusUpdate.JobId,
    status: statusUpdate.Status,
    workerId: statusUpdate.WorkerId,
  })
  
  // Used for coordination - if job is InProgress by another worker, skip it
})
```

#### AcknowledgeJob (Worker → Server)

Worker sends acknowledgment when claiming a job.

**Method**: `acknowledgeJob(jobId, workerId)`

**Invocation**:
```javascript
await this.connection.invoke('AcknowledgeJob', {
  JobId: jobId,
  WorkerId: workerId,
})
```

**Purpose**: Notifies other workers that this job is being processed

### Connection Lifecycle

#### Connection Opened
```javascript
this.connection.onclose(error => {
  this.isConnected = false
  logger.warn('SignalR connection closed', {
    error: error?.message,
    apiBaseUrl: config.apiBaseUrl,
  })
})
```

#### Reconnecting
```javascript
this.connection.onreconnecting(error => {
  logger.warn('SignalR reconnecting', {
    error: error?.message,
    apiBaseUrl: config.apiBaseUrl,
  })
})
```

#### Reconnected
```javascript
this.connection.onreconnected(connectionId => {
  this.isConnected = true
  logger.info('SignalR reconnected successfully', {
    connectionId,
    apiBaseUrl: config.apiBaseUrl,
  })
})
```

## HTTP REST API Communication

### Job Management Endpoints

#### Dequeue Job (Claim Job)

**Endpoint**: `POST /api/thumbnail-jobs/dequeue`

**Purpose**: Claim the next available job

**Request**:
```json
{
  "workerId": "worker-1234"
}
```

**Response (200 OK)**: Job claimed
```json
{
  "id": 123,
  "modelId": 456,
  "modelHash": "abc123def456...",
  "status": "InProgress",
  "attemptCount": 1,
  "createdAt": "2025-01-10T12:00:00Z",
  "assignedWorkerId": "worker-1234",
  "assignedAt": "2025-01-10T12:00:05Z"
}
```

**Response (204 No Content)**: No jobs available

**Response (404 Not Found)**: Endpoint not implemented or no jobs

**Worker Implementation**:
```javascript
async pollForJob() {
  const response = await this.apiClient.post('/api/thumbnail-jobs/dequeue', {
    workerId: config.workerId,
  })

  if (response.status === 204) {
    return null // No jobs available
  }

  return response.data
}
```

**Backend Behavior**:
- Finds first job with status "Pending"
- Updates status to "InProgress"
- Assigns worker ID and timestamp
- Returns job details
- Thread-safe (prevents double-claiming)

#### Complete Job

**Endpoint**: `POST /api/thumbnail-jobs/{id}/complete`

**Purpose**: Mark job as successfully completed

**Request**:
```json
{
  "thumbnailPath": "/hashes/abc123/thumbnail.webp",
  "sizeBytes": 45678,
  "width": 256,
  "height": 256
}
```

**Response (200 OK)**:
```json
{
  "message": "Job completed successfully",
  "jobId": 123,
  "status": "Completed",
  "completedAt": "2025-01-10T12:00:30Z"
}
```

**Worker Implementation**:
```javascript
async markJobCompleted(jobId, metadata) {
  const response = await this.apiClient.post(
    `/api/thumbnail-jobs/${jobId}/complete`,
    metadata
  )
  return response.data
}
```

**Backend Behavior**:
- Updates job status to "Completed"
- Records completion timestamp
- Updates thumbnail metadata in database
- Links thumbnail to model

#### Fail Job

**Endpoint**: `POST /api/thumbnail-jobs/{id}/fail`

**Purpose**: Mark job as failed with error message

**Request**:
```json
{
  "errorMessage": "Failed to load model: Invalid file format"
}
```

**Response (200 OK)**:
```json
{
  "message": "Job marked as failed",
  "jobId": 123,
  "status": "Failed",
  "failedAt": "2025-01-10T12:00:30Z",
  "errorMessage": "Failed to load model: Invalid file format"
}
```

**Worker Implementation**:
```javascript
async markJobFailed(jobId, errorMessage) {
  const response = await this.apiClient.post(
    `/api/thumbnail-jobs/${jobId}/fail`,
    { errorMessage }
  )
  return response.data
}
```

**Backend Behavior**:
- Updates job status to "Failed"
- Records failure timestamp and error message
- Increments attempt count
- May re-queue job if attempts < max retries

### Model File Endpoints

#### Get Model File Metadata

**Endpoint**: `GET /models/{id}/file`

**Purpose**: Get model file information

**Query Parameters**:
- `download=false` - Get metadata only (no file download)

**Response (200 OK)**:
```json
{
  "id": 456,
  "name": "MyModel.obj",
  "hash": "abc123def456...",
  "sizeBytes": 1234567,
  "contentType": "model/obj",
  "uploadedAt": "2025-01-10T11:00:00Z"
}
```

#### Download Model File

**Endpoint**: `GET /models/{id}/file`

**Purpose**: Download model file for processing

**Response (200 OK)**:
- Content-Type: `application/octet-stream` or format-specific
- Content-Disposition: `attachment; filename="MyModel.obj"`
- Body: File stream

**Worker Implementation**:
```javascript
async fetchModelFile(modelId) {
  const response = await this.apiClient.get(`/models/${modelId}/file`, {
    responseType: 'stream',
  })

  // Extract filename from Content-Disposition header
  const contentDisposition = response.headers['content-disposition']
  const filenameMatch = /filename="(.+)"/.exec(contentDisposition)
  const originalFileName = filenameMatch ? filenameMatch[1] : 'model'

  // Extract file type from filename
  const fileType = path.extname(originalFileName).toLowerCase()

  // Save to temporary file
  const tempPath = path.join(this.tempDir, `model-${modelId}-${Date.now()}${fileType}`)
  await this._saveStreamToFile(response.data, tempPath)

  return {
    filePath: tempPath,
    originalFileName,
    fileType,
  }
}
```

### Thumbnail Upload Endpoints

#### Upload Thumbnail

**Endpoint**: `POST /models/{id}/thumbnail/upload`

**Purpose**: Upload generated thumbnail to backend

**Content-Type**: `multipart/form-data`

**Form Fields**:
- `file` (required): Thumbnail file (WebP, PNG, JPEG)
- `width` (optional): Thumbnail width in pixels
- `height` (optional): Thumbnail height in pixels

**Request (multipart/form-data)**:
```
POST /models/456/thumbnail/upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="thumbnail.webp"
Content-Type: image/webp

[binary file data]
------WebKitFormBoundary
Content-Disposition: form-data; name="width"

256
------WebKitFormBoundary
Content-Disposition: form-data; name="height"

256
------WebKitFormBoundary--
```

**Response (200 OK)**:
```json
{
  "message": "Thumbnail uploaded successfully",
  "modelId": 456,
  "thumbnailPath": "/hashes/abc123/thumbnail.webp",
  "sizeBytes": 45678,
  "width": 256,
  "height": 256,
  "contentType": "image/webp",
  "hash": "def456ghi789..."
}
```

**Worker Implementation**:
```javascript
async uploadThumbnail(modelId, filePath, width, height) {
  const formData = new FormData()
  formData.append('file', fs.createReadStream(filePath))
  
  if (width) formData.append('width', width.toString())
  if (height) formData.append('height', height.toString())

  const response = await this.client.post(
    `/models/${modelId}/thumbnail/upload`,
    formData,
    {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  )

  return response.data
}
```

**Backend Behavior**:
- Validates file format (WebP, PNG, JPEG)
- Validates file size (max 10MB)
- Calculates file hash (SHA256)
- Checks for duplicate files (deduplication)
- Stores file using IFileStorage
- Updates Thumbnail entity in database
- Returns storage metadata

#### Upload Multiple Thumbnails

**Endpoint**: `POST /models/{id}/thumbnail/upload` (same endpoint, multiple files)

**Worker Implementation**:
```javascript
async uploadMultipleThumbnails(modelId, files) {
  const uploadResults = []

  for (const file of files) {
    try {
      const result = await this.uploadThumbnail(
        modelId,
        file.path,
        file.width,
        file.height
      )
      uploadResults.push({ success: true, data: result })
    } catch (error) {
      uploadResults.push({ success: false, error: error.message })
    }
  }

  return {
    allSuccessful: uploadResults.every(r => r.success),
    results: uploadResults,
  }
}
```

**Typical Usage** (WebP + Poster):
```javascript
const files = [
  { path: webpPath, width: 256, height: 256 },
  { path: posterPath, width: 256, height: 256 },
]

const result = await thumbnailApiService.uploadMultipleThumbnails(modelId, files)
```

### Health Check Endpoints

#### API Health Check

**Endpoint**: `GET /health`

**Purpose**: Verify API is reachable

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-10T12:00:00Z",
  "version": "1.0.0"
}
```

**Worker Implementation**:
```javascript
async testConnection() {
  try {
    const response = await this.apiClient.get('/health')
    return response.status === 200
  } catch (error) {
    logger.warn('API health check failed', {
      error: error.message,
      baseURL: config.apiBaseUrl,
    })
    return false
  }
}
```

**Usage**: Called on worker startup to verify API connectivity

## Communication Flow Example

### Complete Job Processing Flow

```
1. User uploads model
   ↓
2. Backend enqueues thumbnail job
   ↓
3. Backend notifies SignalR hub
   ↓ (SignalR WebSocket)
4. Worker receives JobEnqueued notification
   {
     "JobId": 123,
     "ModelId": 456,
     "ModelHash": "abc123..."
   }
   ↓
5. Worker checks concurrent job limit
   ↓
6. Worker claims job via HTTP
   POST /api/thumbnail-jobs/dequeue
   { "workerId": "worker-1234" }
   ↓ (HTTP 200)
7. Backend marks job InProgress, assigns worker
   ↓
8. Worker acknowledges via SignalR
   connection.invoke('AcknowledgeJob', { JobId: 123, WorkerId: "worker-1234" })
   ↓
9. Worker downloads model file
   GET /models/456/file
   ↓ (HTTP 200, file stream)
10. Worker processes model
    - Load with Three.js
    - Normalize geometry
    - Render orbit frames
    - Encode to WebP/JPEG
    ↓
11. Worker uploads WebP thumbnail
    POST /models/456/thumbnail/upload
    [multipart form data: file=orbit.webp, width=256, height=256]
    ↓ (HTTP 200)
12. Backend stores thumbnail, returns metadata
    {
      "thumbnailPath": "/hashes/abc123/thumbnail.webp",
      "sizeBytes": 45678,
      "width": 256,
      "height": 256
    }
    ↓
13. Worker uploads poster thumbnail
    POST /models/456/thumbnail/upload
    [multipart form data: file=poster.jpg, width=256, height=256]
    ↓ (HTTP 200)
14. Worker marks job complete
    POST /api/thumbnail-jobs/123/complete
    {
      "thumbnailPath": "/hashes/abc123/thumbnail.webp",
      "sizeBytes": 45678,
      "width": 256,
      "height": 256
    }
    ↓ (HTTP 200)
15. Backend updates job status to Completed
    ↓
16. Worker cleans up temporary files
    ↓
17. Ready for next job
```

## Error Handling

### SignalR Connection Errors

**Connection Refused**:
```javascript
// Auto-reconnect with exponential backoff
// Logs warning but continues trying
logger.warn('SignalR connection failed, will retry', {
  error: 'ECONNREFUSED',
  nextRetryIn: '2000ms',
})
```

**Connection Timeout**:
```javascript
// Falls back to HTTP polling if SignalR unavailable
if (!connected) {
  logger.error('Failed to connect to SignalR hub')
  // Could implement polling fallback here
}
```

### HTTP API Errors

**Network Errors**:
```javascript
try {
  const job = await this.jobService.pollForJob()
} catch (error) {
  logger.error('Failed to poll for thumbnail job', {
    error: error.message,
    status: error.response?.status,
  })
  // Continue, will retry on next poll
}
```

**Job Already Claimed** (404 or 204):
```javascript
if (response.status === 204 || response.status === 404) {
  return null // No jobs available
}
```

**Upload Failures**:
```javascript
try {
  await thumbnailApiService.uploadThumbnail(modelId, filePath)
} catch (error) {
  logger.error('Thumbnail upload failed', {
    error: error.message,
    modelId,
    filePath,
  })
  // Mark job as failed
  await jobService.markJobFailed(jobId, error.message)
}
```

## Authentication & Security

### Current Implementation
- No authentication required for worker ↔ API communication
- Workers operate within trusted network
- SignalR connection uses same origin policy

### Future Considerations
- Worker authentication via API keys
- TLS/SSL for production deployments
- Role-based access control for API endpoints

## Configuration

### Worker Configuration
```bash
# API Base URL
API_BASE_URL=http://localhost:5009

# SignalR transport (optional)
# Defaults to WebSockets with SSE fallback
SIGNALR_TRANSPORT=WebSockets

# TLS certificate validation
NODE_TLS_REJECT_UNAUTHORIZED=1
```

### Backend Configuration
```csharp
// Startup.cs or Program.cs
services.AddSignalR(options => {
    options.EnableDetailedErrors = true; // Development only
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

app.MapHub<ThumbnailJobHub>("/hubs/thumbnail-jobs");
```

## Monitoring & Debugging

### Enable SignalR Debug Logging
```javascript
// signalrQueueService.js
.configureLogging(LogLevel.Debug) // Change from Warning to Debug
```

### View SignalR Traffic
```bash
# Worker logs
export LOG_LEVEL=debug
npm start
```

### Test API Connectivity
```bash
# Test health endpoint
curl http://localhost:5009/health

# Test SignalR hub
curl http://localhost:5009/hubs/thumbnail-jobs
```

### Monitor Active Connections
```bash
# Worker health endpoint
curl http://localhost:3001/status

# Check signalrConnected field
{
  "worker": {
    "signalrConnected": true
  }
}
```

## Performance Considerations

### SignalR
- **Latency**: ~10-50ms for job notifications
- **Throughput**: Handles 1000+ messages/second
- **Reconnect**: Automatic with exponential backoff
- **Resource Usage**: Minimal (persistent connection)

### HTTP API
- **Latency**: ~50-200ms per request
- **Throughput**: Limited by network and backend capacity
- **Connection Pooling**: Enabled by default in axios
- **Timeout**: 30 seconds (configurable)

### Optimization Tips
- Use SignalR for notifications (low latency)
- Use HTTP for data transfer (reliable, resumable)
- Enable HTTP/2 for multiplexing
- Implement request retries with exponential backoff
- Monitor connection pool utilization

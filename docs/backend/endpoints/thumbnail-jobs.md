# Thumbnail Job Endpoints (Worker API)

This document describes endpoints used by thumbnail generation workers to process thumbnail jobs. These endpoints are designed for background worker processes, not for direct client use.

## Dequeue Thumbnail Job

Retrieves the next available thumbnail job from the queue for processing. This endpoint is used by workers to get jobs assigned to them.

### Endpoint

```
POST /api/thumbnail-jobs/dequeue
```

### Request

**Content-Type**: `application/json`

```json
{
  "workerId": "worker-001"
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| workerId | string | Yes | Unique identifier for the worker |

### Success Response (Job Available)

**Status Code**: `200 OK`

```json
{
  "id": 15,
  "modelId": 42,
  "modelHash": "a3f5e8d9c1b2a4f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0",
  "status": "Processing",
  "attemptCount": 1,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique job identifier |
| modelId | integer | ID of the model to generate thumbnail for |
| modelHash | string | SHA-256 hash of the model file |
| status | string | Job status (will be "Processing" when dequeued) |
| attemptCount | integer | Number of processing attempts for this job |
| createdAt | datetime | When job was created (ISO 8601) |
| updatedAt | datetime | When job was last updated (ISO 8601) |

### Success Response (No Jobs Available)

**Status Code**: `204 No Content`

No response body. The worker should wait before polling again.

### Error Responses

#### Invalid Request

**Status Code**: `400 Bad Request`

**Response Body**: Plain text error message

```
WorkerId is required
```

### Process Flow

1. **Worker Polls**: Worker sends dequeue request with its ID
2. **Job Assignment**: System finds pending job and assigns to worker
3. **Status Update**: Job status changes from `Pending` to `Processing`
4. **Worker Processing**: Worker generates thumbnail from model
5. **Completion**: Worker calls complete endpoint with results

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/api/thumbnail-jobs/dequeue \
  -H "Content-Type: application/json" \
  -d '{"workerId": "worker-001"}'
```

### Example Request (JavaScript)

```javascript
async function dequeueJob(workerId) {
  const response = await fetch('http://localhost:5009/api/thumbnail-jobs/dequeue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ workerId })
  });

  if (response.status === 204) {
    // No jobs available
    return null;
  }

  if (response.ok) {
    const job = await response.json();
    return job;
  }

  throw new Error(`Failed to dequeue job: ${await response.text()}`);
}

// Usage
const job = await dequeueJob('worker-001');
if (job) {
  console.log(`Processing job ${job.id} for model ${job.modelId}`);
  // Process the job...
} else {
  console.log('No jobs available');
}
```

### Example Worker Loop (JavaScript)

```javascript
class ThumbnailWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.running = false;
  }

  async start() {
    this.running = true;
    console.log(`Worker ${this.workerId} started`);

    while (this.running) {
      try {
        const job = await this.dequeueJob();
        
        if (job) {
          await this.processJob(job);
        } else {
          // No jobs available, wait before polling again
          await this.sleep(5000); // Wait 5 seconds
        }
      } catch (error) {
        console.error('Error in worker loop:', error);
        await this.sleep(10000); // Wait 10 seconds on error
      }
    }
  }

  async dequeueJob() {
    const response = await fetch('http://localhost:5009/api/thumbnail-jobs/dequeue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: this.workerId })
    });

    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Dequeue failed: ${response.status}`);
    
    return await response.json();
  }

  async processJob(job) {
    console.log(`Processing job ${job.id} for model ${job.modelId}`);
    
    // Download model file using modelHash
    // Generate thumbnail
    // Upload thumbnail
    
    // For demo, simulate processing
    await this.sleep(2000);
    
    // Mark as complete
    await this.completeJob(job.id, {
      thumbnailPath: '/path/to/thumbnail.png',
      sizeBytes: 45678,
      width: 512,
      height: 512
    });
  }

  async completeJob(jobId, result) {
    const response = await fetch(`http://localhost:5009/api/thumbnail-jobs/${jobId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    });

    if (!response.ok) {
      throw new Error(`Failed to complete job: ${await response.text()}`);
    }

    console.log(`Job ${jobId} completed successfully`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.running = false;
    console.log(`Worker ${this.workerId} stopping...`);
  }
}

// Usage
const worker = new ThumbnailWorker('worker-001');
worker.start();

// Stop worker gracefully
// worker.stop();
```

---

## Complete Thumbnail Job

Marks a thumbnail job as completed with the generated thumbnail information. Called by workers after successfully generating a thumbnail.

### Endpoint

```
POST /api/thumbnail-jobs/{jobId}/complete
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| jobId | integer | The job ID to mark as complete |

### Request

**Content-Type**: `application/json`

```json
{
  "thumbnailPath": "/var/lib/modelibr/uploads/thumbnails/abc123def456.png",
  "sizeBytes": 45678,
  "width": 512,
  "height": 512
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| thumbnailPath | string | Yes | Full path to the generated thumbnail file |
| sizeBytes | long | Yes | File size in bytes |
| width | integer | Yes | Image width in pixels |
| height | integer | Yes | Image height in pixels |

### Success Response

**Status Code**: `200 OK`

```json
{
  "modelId": 42,
  "status": "Ready",
  "message": "Thumbnail job completed successfully"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| modelId | integer | ID of the model |
| status | string | Thumbnail status ("Ready") |
| message | string | Success message |

### Process Flow

1. **Job Validation**: Verifies job exists and is in `Processing` state
2. **Thumbnail Update**: Updates thumbnail record with file information
3. **Status Change**: Updates job and thumbnail status to completed/ready
4. **Notification**: Sends real-time notification via SignalR to connected clients
5. **Worker Release**: Frees worker to process next job

### Error Responses

#### Job Not Found

**Status Code**: `400 Bad Request`

**Response Body**: Plain text error message

```
Thumbnail job with ID 999 was not found.
```

#### Invalid State

**Status Code**: `400 Bad Request`

**Response Body**: Plain text error message

```
Job is not in processing state.
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/api/thumbnail-jobs/15/complete \
  -H "Content-Type: application/json" \
  -d '{
    "thumbnailPath": "/var/lib/modelibr/uploads/thumbnails/abc123.png",
    "sizeBytes": 45678,
    "width": 512,
    "height": 512
  }'
```

### Example Request (JavaScript)

```javascript
async function completeJob(jobId, thumbnailInfo) {
  const response = await fetch(`http://localhost:5009/api/thumbnail-jobs/${jobId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(thumbnailInfo)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to complete job: ${error}`);
  }

  const result = await response.json();
  console.log(`Job completed: Model ${result.modelId} thumbnail is ${result.status}`);
  return result;
}

// Usage
await completeJob(15, {
  thumbnailPath: '/var/lib/modelibr/uploads/thumbnails/abc123.png',
  sizeBytes: 45678,
  width: 512,
  height: 512
});
```

---

## Fail Thumbnail Job

Marks a thumbnail job as failed with an error message. Called by workers when thumbnail generation fails.

### Endpoint

```
POST /api/thumbnail-jobs/{jobId}/fail
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| jobId | integer | The job ID to mark as failed |

### Request

**Content-Type**: `application/json`

```json
{
  "errorMessage": "Failed to launch the browser process: chrome_crashpad_handler error"
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| errorMessage | string | Yes | Error message describing why the job failed (max 1000 characters) |

### Success Response

**Status Code**: `200 OK`

```json
{
  "modelId": 42,
  "status": "Failed",
  "message": "Thumbnail job marked as failed"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| modelId | integer | ID of the model |
| status | string | Thumbnail status ("Failed") |
| message | string | Success message |

### Process Flow

1. **Job Validation**: Verifies job exists
2. **Thumbnail Update**: Updates thumbnail record with error message and failed status
3. **Retry Logic**: Queue automatically handles retry logic based on attempt count
4. **Status Change**: Updates job status to failed or queues for retry
5. **Notification**: Sends real-time notification via SignalR to connected clients
6. **Worker Release**: Frees worker to process next job

### Error Responses

#### Job Not Found

**Status Code**: `400 Bad Request`

**Response Body**: Plain text error message

```
Thumbnail job with ID 999 was not found.
```

#### Invalid Error Message

**Status Code**: `400 Bad Request`

**Response Body**: Plain text error message

```
Error message cannot be null or empty.
```

### Example Request (cURL)

```bash
curl -X POST http://localhost:5009/api/thumbnail-jobs/15/fail \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "Failed to launch the browser process: chrome_crashpad_handler error"
  }'
```

### Example Request (JavaScript)

```javascript
async function failJob(jobId, errorMessage) {
  const response = await fetch(`http://localhost:5009/api/thumbnail-jobs/${jobId}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ errorMessage })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to mark job as failed: ${error}`);
  }

  const result = await response.json();
  console.log(`Job ${jobId} marked as failed for model ${result.modelId}`);
  return result;
}

// Usage
try {
  await processJob(job);
} catch (error) {
  await failJob(job.id, error.message);
  console.error(`Job ${job.id} failed:`, error.message);
}
```

### Error Handling in Worker

Workers should call this endpoint when:

1. **Rendering Errors**: Browser/renderer failures (e.g., Chrome crashpad errors)
2. **Model Loading Errors**: Unsupported formats or corrupt files
3. **Resource Errors**: Out of memory, disk space issues
4. **Timeout Errors**: Processing exceeds time limits
5. **Network Errors**: Failed to download model or upload thumbnail

```javascript
async function processJob(job) {
  try {
    // Download model
    const modelFile = await downloadModel(job.modelId);
    
    // Generate thumbnail
    const thumbnail = await generateThumbnail(modelFile);
    
    // Upload thumbnail
    const uploaded = await uploadThumbnail(thumbnail);
    
    // Mark as complete
    await completeJob(job.id, uploaded);
  } catch (error) {
    // Mark as failed with error message
    await failJob(job.id, error.message);
    throw error; // Re-throw for worker logging
  }
}
```

---

## Test Thumbnail Complete Notification

A testing endpoint to simulate thumbnail completion and test SignalR real-time notifications. This is useful for frontend development and integration testing.

### Endpoint

```
POST /api/test/thumbnail-complete/{modelId}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| modelId | integer | The model ID to send notification for |

### Request

**Content-Type**: `application/json`

```json
{
  "status": "Ready",
  "thumbnailUrl": "/models/1/thumbnail/file",
  "errorMessage": null
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | Status to broadcast ("Ready", "Failed", etc.) |
| thumbnailUrl | string | No | URL to thumbnail file (for "Ready" status) |
| errorMessage | string | No | Error message (for "Failed" status) |

### Success Response

**Status Code**: `200 OK`

```json
{
  "message": "Test notification sent successfully"
}
```

### Error Responses

#### Notification Failed

**Status Code**: `400 Bad Request`

```json
{
  "error": "Exception message details"
}
```

### Example Request (cURL)

```bash
# Test successful thumbnail
curl -X POST http://localhost:5009/api/test/thumbnail-complete/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Ready",
    "thumbnailUrl": "/models/1/thumbnail/file"
  }'

# Test failed thumbnail
curl -X POST http://localhost:5009/api/test/thumbnail-complete/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Failed",
    "errorMessage": "Unsupported model format"
  }'
```

### Example Request (JavaScript)

```javascript
async function testThumbnailNotification(modelId, status, thumbnailUrl = null, errorMessage = null) {
  const response = await fetch(`http://localhost:5009/api/test/thumbnail-complete/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status,
      thumbnailUrl,
      errorMessage
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Test notification failed: ${error.error}`);
  }

  const result = await response.json();
  console.log(result.message);
}

// Test successful completion
await testThumbnailNotification(1, 'Ready', '/models/1/thumbnail/file');

// Test failure
await testThumbnailNotification(1, 'Failed', null, 'Processing error occurred');
```

## Notes

### Worker Implementation

A complete thumbnail worker should:

1. **Poll for Jobs**: Continuously call dequeue endpoint
2. **Download Model**: Retrieve model file using hash or model ID
3. **Generate Thumbnail**: Use 3D rendering library to create thumbnail
4. **Store Thumbnail**: Save to configured upload directory
5. **Report Completion**: Call complete endpoint with results
6. **Error Handling**: Retry failed jobs with exponential backoff
7. **Graceful Shutdown**: Complete current job before stopping

### Job States

Jobs progress through these states:

1. **Pending**: Job created, waiting for worker
2. **Processing**: Worker has dequeued and is processing
3. **Completed**: Worker successfully generated thumbnail
4. **Failed**: Processing failed (after max retries)

### Retry Logic

Failed jobs are automatically retried:

- **Attempt Count**: Tracked in `attemptCount` field
- **Max Attempts**: Configurable (typically 3-5)
- **Backoff**: Exponential delay between retries
- **Final Failure**: After max attempts, marked as permanently failed

### Real-Time Notifications

When a job completes, the system:

1. Updates thumbnail status in database
2. Sends SignalR notification to all connected clients
3. Clients can immediately refresh thumbnail display
4. No polling required for status updates

### Security Considerations

- **Worker Authentication**: Consider requiring API keys for workers
- **Path Validation**: Thumbnail paths are validated to prevent path traversal
- **Rate Limiting**: Prevent dequeue spam with rate limiting
- **Worker Health**: Monitor worker heartbeat and job processing times

### Performance Optimization

- **Batch Processing**: Workers can request multiple jobs
- **Parallel Workers**: Scale horizontally with multiple worker instances
- **Priority Queue**: Implement job prioritization if needed
- **Resource Limits**: Configure worker memory and CPU limits

### Monitoring

Monitor these metrics:

- Jobs pending vs. processing vs. completed
- Average job processing time
- Worker throughput (jobs/minute)
- Failure rate and error types
- Queue depth and wait times

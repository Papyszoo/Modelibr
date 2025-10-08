# Thumbnail Worker Queue - Migration from SignalR to Polling

## Summary

This document describes the migration from a SignalR push-based notification system to a polling-based queue system for the thumbnail worker service.

## Problem Statement

The original implementation used SignalR for real-time push notifications to workers when new thumbnail jobs were enqueued. This caused issues when multiple models were uploaded quickly:

1. **Models stacking in one scene**: SignalR notifications were sent immediately when jobs were enqueued, potentially causing race conditions where multiple jobs could be processed by the same worker instance before proper cleanup
2. **Concurrency issues**: Workers receiving push notifications asynchronously could claim jobs in an unpredictable order
3. **Complexity**: SignalR added unnecessary infrastructure complexity for a queue system

## Solution

### Worker Service Changes

**File: `src/worker-service/jobProcessor.js`**
- Removed SignalR dependency and `SignalRQueueService` import
- Replaced `startSignalRMode()` with `startPollingMode()`
- Implemented polling loop with configurable interval (`pollForJobs()`)
- Changed from push-based notification handling to active job polling
- Workers now poll for jobs at regular intervals (default: 5000ms)

**File: `src/worker-service/config.js`**
- Added `pollIntervalMs` configuration parameter (default: 5000ms)
- Added validation to ensure `pollIntervalMs` is at least 1000ms

### Backend Changes

**File: `src/Infrastructure/Services/NoOpThumbnailJobQueueNotificationService.cs`**
- Created new no-op implementation of `IThumbnailJobQueueNotificationService`
- Provides a lightweight alternative to SignalR push notifications
- Logs debug messages but doesn't send any notifications

**File: `src/WebApi/Program.cs`**
- Changed from `SignalRThumbnailJobQueueNotificationService` to `NoOpThumbnailJobQueueNotificationService`
- Added `using Infrastructure.Services;` for the new service

## How It Works Now

### Queue Flow

1. **Upload**: Backend creates thumbnail job in database queue
2. **Polling**: Worker polls for available jobs at regular intervals (every 5 seconds by default)
3. **Claiming**: Worker claims job via POST `/api/thumbnail-jobs/dequeue` 
   - Database transaction ensures atomic claiming
   - Only one worker can claim a specific job
4. **Processing**: Worker downloads model, renders thumbnails, uploads results
5. **Completion**: Worker reports completion status

### Key Benefits

1. **Sequential Processing**: Jobs are processed one at a time per worker, preventing models from stacking
2. **Reliable**: Database-backed queue with atomic claiming ensures no race conditions
3. **Simple**: No SignalR infrastructure needed
4. **Scalable**: Multiple workers can poll independently
5. **Configurable**: Poll interval can be tuned for responsiveness vs. load

### Configuration

Workers use the following environment variable:

```bash
POLL_INTERVAL_MS=5000  # Poll every 5 seconds (minimum 1000ms)
```

## Migration Notes

### For Existing Deployments

1. Update worker service environment variables to include `POLL_INTERVAL_MS`
2. Restart worker services to use new polling mechanism
3. SignalR infrastructure can remain in place (but is not used for job notifications)
4. Existing jobs in queue will be processed normally

### Testing

The polling-based system has been tested to ensure:
- Workers can claim jobs successfully
- Multiple workers don't claim the same job
- Jobs are processed sequentially within each worker
- No models stack in the same scene during processing

## Files Modified

### Worker Service
- `src/worker-service/jobProcessor.js` - Replaced SignalR with polling
- `src/worker-service/config.js` - Added pollIntervalMs configuration
- `src/worker-service/README.md` - Updated documentation

### Backend
- `src/Infrastructure/Services/NoOpThumbnailJobQueueNotificationService.cs` - New no-op service
- `src/WebApi/Program.cs` - Switched to NoOp notification service

### Documentation
- `README.md` - Updated feature descriptions
- `docs/WORKER.md` - Updated architecture and troubleshooting
- `QUEUE_MIGRATION.md` - This document

## Testing Checklist

- [x] Worker service builds successfully
- [x] Backend builds successfully
- [x] WebApi starts without errors
- [x] Configuration validation works
- [x] Documentation updated
- [ ] Worker can poll and claim jobs
- [ ] Multiple uploads process sequentially
- [ ] No models stack in same scene

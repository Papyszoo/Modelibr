# Thumbnail Rendering Implementation

## Overview
Implemented actual 3D model rendering in the worker service, replacing placeholder image generation with real WebGL rendering.

## Key Components

### Database Event Tracking

**Entity**: `ThumbnailJobEvent` (`src/Domain/Models/ThumbnailJobEvent.cs`)
- Tracks: JobStarted, ModelDownloaded, FrameRendering, EncodingCompleted, JobFailed
- Migration: `20251005180622_AddThumbnailJobEvents`
- API: `POST /api/thumbnail-jobs/{jobId}/events`

### WebGL Rendering

**File**: `src/worker-service/orbitFrameRenderer.js`
- Uses `node-canvas` for headless rendering
- Captures actual pixel data via `gl.readPixels()`
- Returns RGBA pixel buffers instead of simulated data
- Flips pixels vertically (WebGL origin: bottom-left → image: top-left)

**File**: `src/worker-service/frameEncoderService.js`
- Removed `createPlaceholderImage()` method
- Converts RGBA buffers to PNG using Sharp
- Throws error if pixel data missing (no fallback to placeholders)

**File**: `src/worker-service/jobEventService.js`
- Logs events to API at each processing step
- Non-blocking (logging failures don't break jobs)

**File**: `src/worker-service/jobProcessor.js`
- Integrated event logging throughout processing pipeline
- Removed fallback to default/placeholder values
- Jobs fail explicitly on errors (no silent failures)

## Implementation Details

### Rendering Pipeline
1. Load 3D model → `ModelLoaderService`
2. Position camera in orbit → `OrbitFrameRenderer`
3. Render scene to canvas → `THREE.WebGLRenderer`
4. Capture pixels → `gl.readPixels()`
5. Convert to PNG → `Sharp` (raw RGBA buffer)
6. Encode to WebP → `FFmpeg`
7. Upload to storage → `ThumbnailStorageService`

### Error Handling
- Jobs fail when rendering/encoding/storage disabled
- All errors logged to `ThumbnailJobEvents` table
- No placeholder generation on failure

## Testing

Query event logs:
```sql
SELECT * FROM "ThumbnailJobEvents" 
WHERE "ThumbnailJobId" = <id> 
ORDER BY "OccurredAt"
```

## Files Modified
- **C#**: 7 files (entity, repository, command, endpoint, migration)
- **JavaScript**: 4 files (renderer, encoder, processor, event service)
- **Total**: +1,497 / -109 lines

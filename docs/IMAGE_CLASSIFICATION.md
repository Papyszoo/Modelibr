# Image Classification Feature

This document describes the AI-powered image classification feature added to the Modelibr thumbnail worker.

## Overview

When a 3D model is uploaded and processed, the worker now automatically:
1. Generates thumbnails (existing functionality)
2. Renders 6 orthographic views (front, back, left, right, top, bottom)
3. Runs an image classifier (MobileNet) on each view
4. Aggregates predictions into tags and a description
5. Stores the results in the database via the backend API

## Architecture

### Backend Components (.NET)

#### Domain Layer
- **Model.cs**: Added `Tags` and `Description` properties
  - `Tags`: Comma-separated list with confidence scores (e.g., "table (75.0%, 3x), chair (60.0%, 1x)")
  - `Description`: Short generated description (e.g., "Contains table, chair, and furniture")
  - `SetTagsAndDescription()`: Method to update both fields

#### Application Layer
- **UpdateModelTagsCommand.cs**: Command for updating model tags
- **UpdateModelTagsCommandHandler.cs**: Handler that:
  - Validates model exists
  - Updates tags and description
  - Persists to database via repository

#### Infrastructure Layer
- **ModelRepository.cs**: Added `UpdateAsync()` method
- **Migration**: `20251009150951_AddModelTagsAndDescription.cs`
  - Adds `Tags` column (nullable text)
  - Adds `Description` column (nullable text)

#### WebApi Layer
- **ModelEndpoints.cs**: Added POST `/models/{modelId}/tags` endpoint
  - Accepts: `{ tags: string, description: string }`
  - Returns: `{ modelId, tags, description }`

### Worker Components (Node.js)

#### Image Classification
- **imageTagger/mobilenetTagger.js**: 
  - Uses TensorFlow.js with MobileNet v2
  - Lazy-loads model on first use
  - Singleton instance reused across jobs
  - `describeImage(buffer, topK)`: Classifies an image buffer

- **imageTagger/tagAggregator.js**:
  - Aggregates predictions from multiple images
  - Deduplicates tags by name
  - Calculates average confidence
  - Counts occurrences across views
  - Generates human-readable description

#### Rendering
- **sixSideRenderer.js**:
  - Renders 6 orthographic views of the 3D model
  - Uses existing Puppeteer renderer
  - Camera positions:
    - Front: angle=0°, height=0
    - Back: angle=180°, height=0
    - Left: angle=270°, height=0
    - Right: angle=90°, height=0
    - Top: angle=0°, height=2
    - Bottom: angle=0°, height=-2

#### Integration
- **jobProcessor.js**:
  - Step 7: Runs after thumbnail upload
  - Renders 6 sides
  - Initializes classifier (if not loaded)
  - Classifies each image
  - Aggregates results
  - Posts to backend API
  - Failures logged but don't fail the job

- **thumbnailApiService.js**:
  - Added `updateModelTags(modelId, tags, description)` method
  - Posts to `/models/{modelId}/tags` endpoint

## Configuration

### Environment Variables (.env)

```bash
# Image classification settings
IMAGE_CLASSIFICATION_ENABLED=true          # Enable/disable classification
CLASSIFICATION_MIN_CONFIDENCE=0.1          # Minimum confidence threshold (0-1)
CLASSIFICATION_MAX_TAGS=10                 # Maximum number of tags to return
CLASSIFICATION_TOP_K_PER_IMAGE=5           # Top K predictions per image
```

### Default Values (config.js)

```javascript
imageClassification: {
  enabled: process.env.IMAGE_CLASSIFICATION_ENABLED !== 'false',
  minConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE) || 0.1,
  maxTags: parseInt(process.env.CLASSIFICATION_MAX_TAGS) || 10,
  topKPerImage: parseInt(process.env.CLASSIFICATION_TOP_K_PER_IMAGE) || 5,
}
```

## Example Output

### Tags Format
```
table (75.0%, 3x), chair (60.0%, 1x), furniture (50.0%, 1x), wooden object (40.0%, 1x)
```

Each tag includes:
- Class name (from ImageNet classes)
- Average confidence percentage
- Occurrence count across the 6 views

### Description Format
```
Contains table, chair, and furniture
```

Generated from the top 3 tags using natural language patterns:
- 1 tag: "Contains {tag1}"
- 2 tags: "Contains {tag1} and {tag2}"
- 3+ tags: "Contains {tag1}, {tag2}, and {tag3}"

## Workflow

1. **Model Upload** → Triggers thumbnail job
2. **Thumbnail Generation** → Existing orbit animation + WebP encoding
3. **Thumbnail Upload** → API upload with deduplication
4. **6-Side Rendering** (if classification enabled):
   - Position camera at each of 6 angles
   - Render and capture frame buffer
5. **Image Classification**:
   - Initialize MobileNet (lazy, cached)
   - Classify each of 6 images
   - Get top 5 predictions per image
6. **Tag Aggregation**:
   - Flatten all predictions (6 images × 5 predictions = 30 max)
   - Filter by minimum confidence (0.1 by default)
   - Group by class name
   - Calculate average confidence per class
   - Count occurrences across images
   - Sort by confidence, take top N (10 by default)
7. **Persistence**:
   - POST to `/models/{id}/tags`
   - Update Model record in database
8. **Job Completion** → Returns thumbnail metadata

## Error Handling

Classification failures are non-fatal:
- Model loading errors: Logged, job continues
- Network errors posting tags: Logged as warning, job continues
- Classification timeouts: Logged, job continues
- Any classification error: Wrapped in try-catch, job continues

This ensures thumbnail generation always completes even if classification fails.

## Dependencies

### NPM Packages
- `@tensorflow/tfjs-node`: TensorFlow.js for Node.js with native bindings
- `@tensorflow-models/mobilenet`: Pre-trained MobileNet model for ImageNet classification

### Native Dependencies
- TensorFlow C library (downloaded automatically during npm install)
- May require network access to Google Cloud Storage during installation

## Testing

### Unit Tests
- **test-tag-aggregator-standalone.js**: Standalone tests for TagAggregator
  - Basic aggregation
  - Confidence filtering
  - Tag limits
  - Description generation
  - Empty input handling
  - Duplicate counting

Run tests:
```bash
cd src/worker-service
node test-tag-aggregator-standalone.js
```

### Integration Testing
Requires:
1. Running PostgreSQL database
2. Backend API (WebApi) running
3. Worker service with TensorFlow.js installed
4. Valid 3D model file for upload

## Performance Considerations

1. **Model Loading**: 
   - MobileNet loads once on first job (~2-5 seconds)
   - Cached for subsequent jobs
   - Memory footprint: ~20-30 MB

2. **Classification Speed**:
   - ~100-200ms per image on CPU
   - 6 images = ~600-1200ms total
   - GPU/TPU would be faster but requires different setup

3. **Memory Usage**:
   - 6 frame buffers in memory during classification
   - Cleaned up after aggregation
   - Minimal impact on overall worker memory

4. **Network**:
   - Single POST request to backend per job
   - Payload size: ~500 bytes - 2KB

## Limitations

1. **ImageNet Classes**: MobileNet is trained on ImageNet (1000 classes)
   - Works well for common objects (furniture, vehicles, animals)
   - May not recognize domain-specific 3D models
   - Future: Could train custom model or use CLIP for better results

2. **CPU-Only**: 
   - TensorFlow.js uses CPU by default
   - GPU acceleration requires additional setup
   - Classification is fast enough for background processing

3. **Fixed Camera Angles**:
   - Uses 6 orthographic views
   - May miss details only visible from other angles
   - Future: Could add more camera positions

4. **No Context**: 
   - Classifies each view independently
   - Aggregation is statistical, not semantic
   - Future: Could use a model that understands 3D structure

## Future Enhancements

1. **Custom Model Training**:
   - Train on 3D model dataset
   - Domain-specific classes (game assets, CAD parts, etc.)
   - Better accuracy for target use case

2. **CLIP Integration**:
   - Zero-shot classification with text prompts
   - More flexible than ImageNet classes
   - Better for abstract or unusual models

3. **Semantic Aggregation**:
   - Use LLM to generate better descriptions
   - Understand relationships between tags
   - More natural language output

4. **GPU Acceleration**:
   - Use TensorFlow.js GPU backend
   - Faster inference (10-50x speedup)
   - Requires WebGL or CUDA setup

5. **Confidence Tuning**:
   - Adaptive thresholds based on model type
   - Learn from user feedback
   - Improve tag quality over time

## API Reference

### POST /models/{modelId}/tags

Updates the tags and description for a model.

**Request:**
```json
{
  "tags": "table (75.0%, 3x), chair (60.0%, 1x)",
  "description": "Contains table and chair"
}
```

**Response (200 OK):**
```json
{
  "modelId": 123,
  "tags": "table (75.0%, 3x), chair (60.0%, 1x)",
  "description": "Contains table and chair"
}
```

**Response (404 Not Found):**
```json
{
  "error": "ModelNotFound",
  "message": "Model with ID 123 was not found."
}
```

## Troubleshooting

### TensorFlow.js Installation Issues

If `npm install` fails to download TensorFlow native binaries:

1. **Network Restrictions**: Ensure access to `storage.googleapis.com`
2. **Proxy Issues**: Configure npm proxy settings
3. **Manual Download**: Download `libtensorflow` manually and place in `node_modules/@tensorflow/tfjs-node/deps/`

### Classification Not Running

1. Check `IMAGE_CLASSIFICATION_ENABLED=true` in .env
2. Check worker logs for initialization errors
3. Verify model loading succeeded (look for "MobileNet model loaded successfully")

### Low Quality Tags

1. Increase `CLASSIFICATION_MIN_CONFIDENCE` to filter low-confidence predictions
2. Decrease `CLASSIFICATION_MAX_TAGS` to show only top tags
3. Consider the model might not fit ImageNet classes well

### Performance Issues

1. Classification adds ~1-2 seconds per job
2. Reduce `CLASSIFICATION_TOP_K_PER_IMAGE` to classify fewer predictions per image
3. Disable classification for high-throughput scenarios: `IMAGE_CLASSIFICATION_ENABLED=false`

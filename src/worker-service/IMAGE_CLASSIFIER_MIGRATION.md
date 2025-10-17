# Image Classifier Migration Guide

## Overview

The image classification system has been upgraded from MobileNet to Hugging Face's BLIP-2 model.

## What Changed

### Before (MobileNet)
- ❌ Limited to 1000 ImageNet classes
- ❌ Required TensorFlow.js with heavy dependencies
- ❌ Difficult to set up on macOS containers
- ❌ Generic tags not specific to 3D models

### After (Hugging Face BLIP)
- ✅ Natural language image captions (unlimited vocabulary)
- ✅ No local dependencies - uses cloud API
- ✅ Works reliably on all platforms
- ✅ More accurate descriptions for 3D models

## Installation

### Update Dependencies

```bash
cd src/worker-service
npm install
```

The TensorFlow dependencies have been removed, making installation faster and more reliable.

### Configuration (Optional)

For production use with higher API rate limits, get a free Hugging Face API token:

1. Go to https://huggingface.co/settings/tokens
2. Create a new token (read access is sufficient)
3. Add to your `.env` file:

```bash
HF_API_TOKEN=hf_your_token_here
```

The system works without a token but may be rate-limited for high-volume usage.

## Usage

The image classification feature works automatically when enabled:

```bash
# Enable/disable image classification
IMAGE_CLASSIFICATION_ENABLED=true

# Adjust tagging parameters (optional)
CLASSIFICATION_MIN_CONFIDENCE=0.1
CLASSIFICATION_MAX_TAGS=10
CLASSIFICATION_TOP_K_PER_IMAGE=5
```

## Testing

### Test the tagger logic:
```bash
cd src/worker-service
node test-tagger-logic.js
```

### Test with real API (requires network access):
```bash
cd src/worker-service
node test-huggingface-tagger.js
```

## How It Works

1. When a 3D model is uploaded, the worker renders 4 different views
2. Each view is sent to BLIP for caption generation (e.g., "a 3d model of a chair")
3. Keywords are extracted from captions and aggregated
4. Final tags and description are saved to model metadata

## Troubleshooting

### Model Loading Time
The first API request may take 20-30 seconds as the model loads. Subsequent requests are much faster (< 1 second).

### Rate Limiting
Without an API token, you may encounter rate limits. Get a free token from Hugging Face to increase limits.

### Network Issues
The worker service needs internet access to reach `api-inference.huggingface.co`. Ensure your firewall allows outbound HTTPS connections.

## Migration Notes

### For Developers
- No code changes needed in your application
- The tagger maintains the same interface as MobileNet
- Tag format and aggregation logic unchanged

### For DevOps
- Remove any special TensorFlow.js configuration
- No model files to download or manage
- Smaller Docker images (no TensorFlow dependencies)

## Rollback

To disable image classification entirely:

```bash
IMAGE_CLASSIFICATION_ENABLED=false
```

## Support

For issues or questions:
1. Check the worker-service logs for detailed error messages
2. Verify network connectivity to Hugging Face API
3. Review the configuration in `.env.example`

# Thumbnail Rendering Update - Stage Component Alignment

## Overview
Updated the thumbnail generation service to match the frontend's 3D model preview scene setup, which uses the Stage component from React Three Drei.

## Changes Made

### 1. Updated Lighting System (`render-template.html`)
**Previous Setup:**
- Ambient light (0.3 intensity)
- Directional light (1.0 intensity)
- Point light (0.5 intensity)
- Spot light (0.8 intensity)
- Ground plane

**New Setup (Matching Stage component):**
- Ambient light (0.5 intensity) - matches Stage `intensity={0.5}`
- Main directional light (0.5 intensity) - key light with softer intensity
- Fill light (0.25 intensity) - from opposite side for balanced lighting
- Top light (0.15 intensity) - for better model definition
- Removed ground plane (not part of Stage setup)

### 2. Automatic Camera Distance Calculation
**Previous Behavior:**
- Fixed camera distance from config (`CAMERA_DISTANCE=5`)
- Fixed camera height from config (`ORBIT_CAMERA_HEIGHT=0`)
- Models of different sizes appeared inconsistently scaled

**New Behavior:**
- Automatic distance calculation based on model size
- Uses FOV-based formula: `distance = maxDimension / (2 * tan(FOV/2)) * 1.5`
- Automatic height calculation: `height = modelSize.y * 0.15` (slight elevation)
- Ensures models are properly framed regardless of size

### 3. Updated `positionCamera()` Function
```javascript
// Old signature
function positionCamera(angle, distance, height = 0)

// New signature with automatic calculation
function positionCamera(angle, distance = null, height = null)
```

The function now:
- Accepts null for distance/height to trigger automatic calculation
- Calculates optimal distance based on model bounding box
- Returns the calculated distance for logging purposes

### 4. Updated `puppeteerRenderer.js`
**Modified Methods:**
- `renderFrame()` - Now passes `null` for distance and height to enable automatic calculation
- `renderOrbitFrames()` - Removed `calculateOptimalCameraDistance()` call, now handled per-frame
- Added `cameraDistance` to frame data for logging

## Frontend Stage Configuration
The frontend Scene.tsx uses:
```tsx
<Stage
  intensity={0.5}
  environment="city"
  shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
  adjustCamera={false}
>
```

Key aspects matched:
- ✅ `intensity={0.5}` - Lighting intensity
- ✅ `adjustCamera={false}` - Camera not auto-adjusted, but positioned optimally per model
- ⚠️ `environment="city"` - HDR environment (approximated with multi-directional lighting)
- ⚠️ `shadows={{ type: 'contact', ... }}` - Contact shadows (still using standard shadow mapping)

## Benefits

1. **Consistent Rendering**: Thumbnails now match the frontend preview more closely
2. **Proper Framing**: Models are automatically framed regardless of size
3. **Better Lighting**: Softer, more balanced lighting similar to Stage component
4. **Centered Models**: Models appear properly centered in all thumbnails

## Testing Recommendations

1. Test with models of various sizes (small, medium, large)
2. Test with models at different aspect ratios (tall, wide, cubic)
3. Compare thumbnail output with frontend preview
4. Verify orbit animation shows consistent framing across all angles

## Configuration

The following environment variables are still used but have different effects:

- `CAMERA_DISTANCE=5` - Now used as fallback/base distance only
- `ORBIT_CAMERA_HEIGHT=0` - Now used as fallback only
- All other settings remain unchanged

## Future Improvements

1. Implement HDR environment map loading (matching `environment="city"`)
2. Implement contact shadows (matching `shadows={{ type: 'contact', ... }}`)
3. Add environment intensity control
4. Consider adding post-processing effects from Stage

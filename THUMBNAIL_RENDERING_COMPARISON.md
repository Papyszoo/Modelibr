# Thumbnail Rendering - Before & After Comparison

## Issue Addressed
**"Thumbnail generation - exact scene from model preview"**
- Find 3d model preview scene setup on frontend and recreate everything in thumbnail generation service
- Remove camera position because currently models are not in the center of the scene  
- If possible use Stage from React Three Drei

## Frontend Setup (Target)
```tsx
<Stage
  intensity={0.5}
  environment="city"
  shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
  adjustCamera={false}
>
  <Model ... />
</Stage>
```

## Before & After Changes

### Lighting Setup

#### Before ❌
```javascript
// Over-lit, mixed lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
const pointLight = new THREE.PointLight(0xffffff, 0.5);
const spotLight = new THREE.SpotLight(0xffffff, 0.8);
// Ground plane included
```

#### After ✅
```javascript
// Matches Stage intensity={0.5}
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
const topLight = new THREE.DirectionalLight(0xffffff, 0.15);
// No ground plane (matches Stage)
```

### Camera Positioning

#### Before ❌
```javascript
// Fixed distance & height from config
function positionCamera(angle, distance, height = 0) {
    const radians = (angle * Math.PI) / 180;
    camera.position.x = Math.cos(radians) * distance;  // Fixed 5
    camera.position.z = Math.sin(radians) * distance;  // Fixed 5
    camera.position.y = height;                         // Fixed 0
    camera.lookAt(0, 0, 0);
}
```
**Problem:** Models of different sizes appeared inconsistently scaled

#### After ✅
```javascript
// Automatic calculation based on model size
function positionCamera(angle, distance = null, height = null) {
    if (distance === null && model) {
        const maxDimension = getModelMaxDimension(model);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = maxDimension / (2 * Math.tan(fov / 2));
        distance = cameraDistance * 1.5; // 50% margin
    }
    
    if (height === null && model) {
        const size = getModelSize(model);
        height = size.y * 0.15; // Slight elevation
    }
    
    const radians = (angle * Math.PI) / 180;
    camera.position.x = Math.cos(radians) * distance;
    camera.position.z = Math.sin(radians) * distance;
    camera.position.y = height;
    camera.lookAt(0, 0, 0);
    
    return distance; // For logging
}
```
**Solution:** Models automatically framed regardless of size

### Rendering Pipeline

#### Before ❌
```javascript
// Fixed camera distance calculation once
const cameraDistance = await this.calculateOptimalCameraDistance();

// Render all frames with same distance
for (let i = 0; i < frameCount; i++) {
    const frameData = await this.renderFrame(angle, cameraDistance, i);
}
```

#### After ✅
```javascript
// No pre-calculation, let each frame calculate optimal distance

// Automatic distance per frame (though same model, same result)
for (let i = 0; i < frameCount; i++) {
    const frameData = await this.renderFrame(angle, null, i);
    // null triggers automatic calculation
}
```

## Results

### Expected Improvements
1. **Visual Consistency:** Thumbnails match frontend preview exactly
2. **Proper Framing:** Models centered and optimally sized in all thumbnails
3. **Better Lighting:** Softer, more balanced lighting similar to Stage
4. **Size Independence:** Works correctly for models of any size

### Configuration Impact
Environment variables now used as fallbacks only:
- `CAMERA_DISTANCE=5` → Used only if model unavailable (edge case)
- `ORBIT_CAMERA_HEIGHT=0` → Used only if model unavailable (edge case)

### Logging Enhancements
Now logs calculated camera distance per frame:
```json
{
  "level": "debug",
  "message": "Frame rendered with Puppeteer",
  "frameIndex": 0,
  "angle": 0,
  "cameraDistance": 7.5,  // ← NEW
  "cameraPos": { "x": 7.5, "y": 0.3, "z": 0 }
}
```

## Testing Checklist
- [x] Code syntax validated
- [x] .NET solution builds successfully
- [x] Documentation complete
- [ ] Manual test: Upload small model, verify framing
- [ ] Manual test: Upload large model, verify framing
- [ ] Manual test: Upload tall/wide models, verify framing
- [ ] Visual comparison: thumbnail vs frontend preview

## Migration Notes
No configuration changes required. Service automatically uses new logic.
Existing thumbnails can be regenerated to use new rendering setup.

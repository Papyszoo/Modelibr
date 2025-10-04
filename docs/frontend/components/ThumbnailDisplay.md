# ThumbnailDisplay

Component for displaying model thumbnails with real-time status updates and regeneration controls.

## Purpose

Provides a comprehensive thumbnail display with:
- Real-time thumbnail status via SignalR
- Loading, error, and ready states
- Thumbnail regeneration
- Animated GIF support (on hover)
- Multiple size variants
- Accessibility support

## Import

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelId` | `string` | Required | ID of the model to display thumbnail for |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Size variant of the thumbnail |
| `showAnimation` | `boolean` | `false` | Always show animated version if available |
| `className` | `string` | `''` | Additional CSS class names |
| `onError` | `(error: Error) => void \| null` | `null` | Callback when thumbnail fails to load |
| `showControls` | `boolean` | `false` | Show regeneration controls |
| `alt` | `string` | `'Thumbnail for model {modelId}'` | Alt text for the image |

## Size Variants

| Size | CSS Class | Typical Use Case |
|------|-----------|------------------|
| `small` | `thumbnail-small` | List items, compact views |
| `medium` | `thumbnail-medium` | Card views, default display |
| `large` | `thumbnail-large` | Detail views, featured items |

## Usage Examples

### Basic Thumbnail Display

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelCard({ modelId }) {
  return (
    <div className="model-card">
      <ThumbnailDisplay 
        modelId={modelId} 
        size="medium"
      />
    </div>
  )
}
```

### Small Thumbnail in List

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelListItem({ model }) {
  return (
    <div className="list-item">
      <ThumbnailDisplay
        modelId={model.id}
        size="small"
        alt={`Thumbnail for ${model.name}`}
      />
      <div className="info">
        <h3>{model.name}</h3>
        <p>{model.description}</p>
      </div>
    </div>
  )
}
```

### With Error Handling

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelThumbnail({ modelId }) {
  const handleError = (error) => {
    console.error('Thumbnail error:', error)
    // Show fallback UI, log error, etc.
  }

  return (
    <ThumbnailDisplay
      modelId={modelId}
      size="large"
      onError={handleError}
      showControls={true}
    />
  )
}
```

### With Animation on Hover

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function InteractiveThumbnail({ modelId }) {
  return (
    <ThumbnailDisplay
      modelId={modelId}
      size="large"
      showAnimation={false} // Will show on hover
      className="interactive-thumbnail"
    />
  )
}
```

### Always Animated

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function AnimatedThumbnail({ modelId }) {
  return (
    <ThumbnailDisplay
      modelId={modelId}
      size="medium"
      showAnimation={true} // Always show animated version
    />
  )
}
```

### With Regeneration Controls

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ThumbnailWithControls({ modelId }) {
  return (
    <div>
      <h3>Model Thumbnail</h3>
      <ThumbnailDisplay
        modelId={modelId}
        size="large"
        showControls={true} // Shows regenerate button
      />
    </div>
  )
}
```

## Thumbnail States

### 1. Processing/Pending

Shows a loading spinner and status text:

```typescript
<div className="thumbnail-loading">
  <div className="thumbnail-spinner" />
  <span>Generating thumbnail...</span>
</div>
```

### 2. Failed

Shows an error icon with regeneration option:

```typescript
<div className="thumbnail-error">
  <i className="pi pi-exclamation-triangle" />
  <span>Failed to generate</span>
  {showControls && <button onClick={regenerate}>Try Again</button>}
</div>
```

### 3. Ready

Shows the thumbnail image:

```typescript
<img
  src={thumbnailUrl}
  alt={alt}
  onError={handleImageError}
/>
```

### 4. Image Load Error

Shows placeholder with retry option:

```typescript
<div className="thumbnail-placeholder">
  <i className="pi pi-image" />
  <span>Image unavailable</span>
</div>
```

## Animation Behavior

The component supports animated thumbnails with smart loading:

### Static by Default, Animated on Hover

```typescript
// Component manages animation state
const [showAnimated, setShowAnimated] = useState(showAnimation)

// On mouse enter
const handleMouseEnter = () => {
  if (isReady && !showAnimation) {
    setShowAnimated(true)
  }
}

// On mouse leave
const handleMouseLeave = () => {
  if (!showAnimation) {
    setShowAnimated(false)
  }
}
```

### Always Animated

```typescript
<ThumbnailDisplay
  modelId={modelId}
  showAnimation={true}
/>
// Animated version is always displayed
```

## Status Integration

The component uses `useThumbnailManager` hook for real-time updates:

```typescript
const {
  thumbnailStatus,
  thumbnailUrl,
  isLoading,
  error,
  isProcessing,
  isReady,
  isFailed,
  regenerateThumbnail,
} = useThumbnailManager(modelId)
```

## Accessibility Features

- Proper ARIA labels for all states
- Alt text for images
- Keyboard accessible regenerate buttons
- Screen reader announcements for state changes

```typescript
<div 
  className="thumbnail-loading" 
  aria-label="Loading thumbnail"
>
  {/* Loading content */}
</div>

<img
  src={thumbnailUrl}
  alt={alt}
  role="img"
/>
```

## CSS Classes

| Class | Purpose |
|-------|---------|
| `thumbnail-display` | Container element |
| `thumbnail-small` | Small size variant |
| `thumbnail-medium` | Medium size variant |
| `thumbnail-large` | Large size variant |
| `thumbnail-loading` | Loading state |
| `thumbnail-error` | Error state |
| `thumbnail-placeholder` | Placeholder state |
| `thumbnail-spinner` | Loading spinner |
| `thumbnail-status-text` | Status text |

## Custom Styling Example

```css
/* Custom thumbnail styles */
.thumbnail-display.custom-thumbnail {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.thumbnail-display.custom-thumbnail img {
  transition: transform 0.3s ease;
}

.thumbnail-display.custom-thumbnail:hover img {
  transform: scale(1.05);
}
```

## Complete Example

```typescript
import { useState } from 'react'
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelGalleryItem({ model }) {
  const [hasError, setHasError] = useState(false)

  const handleError = (error) => {
    console.error('Thumbnail failed:', error)
    setHasError(true)
  }

  return (
    <div className="gallery-item">
      <ThumbnailDisplay
        modelId={model.id}
        size="large"
        showAnimation={false}
        showControls={true}
        onError={handleError}
        alt={`3D model thumbnail for ${model.name}`}
        className="gallery-thumbnail"
      />
      
      <div className="gallery-info">
        <h3>{model.name}</h3>
        {hasError && (
          <p className="error-notice">
            Thumbnail unavailable
          </p>
        )}
      </div>
    </div>
  )
}
```

## Performance Considerations

- Lazy loading of animated thumbnails (only on hover)
- Image loading errors are handled gracefully
- SignalR connection is managed efficiently by the hook
- Component cleanup prevents memory leaks

## Related

- [useThumbnailManager](../hooks/useThumbnailManager.md) - Underlying hook
- [ThumbnailSidebar](./ThumbnailSidebar.md) - Sidebar with thumbnail
- [ModelsDataTable](./ModelsDataTable.md) - Uses thumbnails in table
- [ApiClient](../services/ApiClient.md) - Thumbnail URL generation

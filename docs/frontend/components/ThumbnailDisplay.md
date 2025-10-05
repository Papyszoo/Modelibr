# ThumbnailDisplay

A simple, focused component for displaying 3D model thumbnails. It fetches the thumbnail status and image from the API and displays it when ready.

## Purpose

Display thumbnails for 3D models with automatic status checking and image fetching.

## Import

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `modelId` | `string` | Yes | The ID of the model to display thumbnail for |
| `className` | `string` | No | Optional CSS class for styling |

## Component Behavior

The component:
1. Fetches thumbnail status from the API using `ApiClient.getThumbnailStatus()`
2. If status is 'Ready', fetches the thumbnail image blob using `ApiClient.getThumbnailFile()`
3. Creates an object URL for the blob and displays it
4. Shows a placeholder icon if thumbnail is not ready or failed to load
5. Properly cleans up object URLs to prevent memory leaks

## Usage Examples

### Basic Thumbnail Display

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelCard({ modelId }) {
  return (
    <div className="model-card">
      <ThumbnailDisplay modelId={modelId} />
    </div>
  )
}
```

### In a List

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function ModelListItem({ model }) {
  return (
    <div className="list-item">
      <ThumbnailDisplay modelId={model.id} />
      <div className="info">
        <h3>{model.name}</h3>
        <p>{model.description}</p>
      </div>
    </div>
  )
}
```

### With Custom Styling

```typescript
import ThumbnailDisplay from '../components/ThumbnailDisplay'

function StyledThumbnail({ modelId }) {
  return (
    <ThumbnailDisplay
      modelId={modelId}
      className="custom-thumbnail-style"
    />
  )
}
```

## States

The component handles three states automatically:

1. **Ready**: Displays the thumbnail image
2. **Not Ready (Processing/Pending/Failed)**: Shows placeholder icon
3. **Error**: Shows placeholder icon if image fetch fails

## Performance Considerations

- Lazy loading attribute on images
- Object URL cleanup prevents memory leaks
- Simple, focused implementation without unnecessary complexity

## Related

- [ThumbnailSidebar](./ThumbnailSidebar.md) - Sidebar with thumbnail display and regenerate button
- [ModelsDataTable](./ModelsDataTable.md) - Uses thumbnails in table
- [ApiClient](../services/ApiClient.md) - Provides thumbnail API methods

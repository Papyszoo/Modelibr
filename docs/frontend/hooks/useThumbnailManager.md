# useThumbnailManager

Custom hook for managing thumbnail generation and status with real-time SignalR updates.

## Purpose

Provides real-time thumbnail status management with:
- SignalR connection for live updates
- Automatic thumbnail status polling
- Thumbnail regeneration
- Fallback to REST API when SignalR unavailable
- Connection state management

## Import

```typescript
import { useThumbnailManager, THUMBNAIL_STATUS } from '../hooks/useThumbnailManager'
```

## API

### useThumbnailManager(modelId)

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelId` | `string` | The ID of the model to track thumbnails for |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `thumbnailStatus` | `ThumbnailStatus \| null` | Current thumbnail status object |
| `thumbnailUrl` | `string \| null` | URL to the thumbnail image (null if not ready) |
| `isLoading` | `boolean` | Whether a thumbnail operation is in progress |
| `error` | `string \| null` | Error message if thumbnail fetch/generation failed |
| `isConnected` | `boolean` | Whether SignalR connection is established |
| `isProcessing` | `boolean` | Whether thumbnail is being generated |
| `isReady` | `boolean` | Whether thumbnail is ready for display |
| `isFailed` | `boolean` | Whether thumbnail generation failed |
| `regenerateThumbnail` | `() => Promise<void>` | Function to trigger thumbnail regeneration |
| `fetchThumbnailStatus` | `() => Promise<ThumbnailStatus>` | Function to manually fetch status |

#### ThumbnailStatus Object

```typescript
{
  Status: 'Pending' | 'Processing' | 'Ready' | 'Failed',
  FileUrl?: string,
  SizeBytes?: number,
  Width?: number,
  Height?: number,
  ErrorMessage?: string,
  CreatedAt?: string,
  ProcessedAt?: string
}
```

## Constants

### THUMBNAIL_STATUS

```typescript
{
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed'
}
```

## Usage Examples

### Basic Thumbnail Display

```typescript
import { useThumbnailManager, THUMBNAIL_STATUS } from '../hooks/useThumbnailManager'

function ThumbnailComponent({ modelId }) {
  const {
    thumbnailUrl,
    isProcessing,
    isReady,
    isFailed,
    thumbnailStatus,
  } = useThumbnailManager(modelId)

  if (isProcessing) {
    return <div>Generating thumbnail...</div>
  }

  if (isFailed) {
    return <div>Failed to generate thumbnail</div>
  }

  if (isReady && thumbnailUrl) {
    return <img src={thumbnailUrl} alt="Model thumbnail" />
  }

  return <div>No thumbnail available</div>
}
```

### With Regeneration Support

```typescript
import { useThumbnailManager } from '../hooks/useThumbnailManager'

function ThumbnailWithControls({ modelId }) {
  const {
    thumbnailUrl,
    isProcessing,
    isReady,
    isFailed,
    error,
    regenerateThumbnail,
    isLoading,
  } = useThumbnailManager(modelId)

  const handleRegenerate = async () => {
    try {
      await regenerateThumbnail()
    } catch (err) {
      console.error('Failed to regenerate:', err)
    }
  }

  return (
    <div>
      {isReady && thumbnailUrl && (
        <img src={thumbnailUrl} alt="Model thumbnail" />
      )}
      
      {isProcessing && (
        <div className="spinner">Generating...</div>
      )}
      
      {isFailed && (
        <div>
          <p>Error: {error}</p>
          <button onClick={handleRegenerate} disabled={isLoading}>
            Regenerate Thumbnail
          </button>
        </div>
      )}
    </div>
  )
}
```

### With Connection Status

```typescript
import { useThumbnailManager } from '../hooks/useThumbnailManager'

function ThumbnailWithConnectionStatus({ modelId }) {
  const {
    thumbnailUrl,
    isConnected,
    isProcessing,
    thumbnailStatus,
  } = useThumbnailManager(modelId)

  return (
    <div>
      {!isConnected && (
        <div className="warning">
          Live updates unavailable - using polling
        </div>
      )}
      
      {isProcessing && (
        <div>
          Status: {thumbnailStatus?.Status}
          {isConnected && ' (Live)'}
        </div>
      )}
      
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="Model thumbnail" />
      )}
    </div>
  )
}
```

### Advanced Status Display

```typescript
import { useThumbnailManager, THUMBNAIL_STATUS } from '../hooks/useThumbnailManager'

function DetailedThumbnailStatus({ modelId }) {
  const {
    thumbnailStatus,
    thumbnailUrl,
    isConnected,
    regenerateThumbnail,
  } = useThumbnailManager(modelId)

  const getStatusColor = (status) => {
    switch (status) {
      case THUMBNAIL_STATUS.READY:
        return 'green'
      case THUMBNAIL_STATUS.PROCESSING:
      case THUMBNAIL_STATUS.PENDING:
        return 'orange'
      case THUMBNAIL_STATUS.FAILED:
        return 'red'
      default:
        return 'gray'
    }
  }

  return (
    <div className="thumbnail-status">
      <div style={{ color: getStatusColor(thumbnailStatus?.Status) }}>
        Status: {thumbnailStatus?.Status || 'Unknown'}
        {isConnected && ' 🟢'}
      </div>
      
      {thumbnailStatus?.ProcessedAt && (
        <div>
          Processed: {new Date(thumbnailStatus.ProcessedAt).toLocaleString()}
        </div>
      )}
      
      {thumbnailStatus?.Width && thumbnailStatus?.Height && (
        <div>
          Dimensions: {thumbnailStatus.Width} x {thumbnailStatus.Height}
        </div>
      )}
      
      {thumbnailStatus?.SizeBytes && (
        <div>
          Size: {(thumbnailStatus.SizeBytes / 1024).toFixed(2)} KB
        </div>
      )}
      
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="Model thumbnail" />
      )}
      
      {thumbnailStatus?.ErrorMessage && (
        <div className="error">{thumbnailStatus.ErrorMessage}</div>
      )}
      
      <button onClick={regenerateThumbnail}>
        Regenerate
      </button>
    </div>
  )
}
```

## SignalR Integration

The hook automatically:
1. Establishes SignalR connection to `/thumbnailHub`
2. Joins a model-specific group to receive updates
3. Listens for `ThumbnailStatusChanged` events
4. Updates state in real-time when thumbnail status changes
5. Handles reconnection automatically
6. Cleans up connection on unmount

### SignalR Events

The hook listens for `ThumbnailStatusChanged` notifications with this structure:

```typescript
{
  ModelId: string,
  Status: 'Pending' | 'Processing' | 'Ready' | 'Failed',
  ThumbnailUrl?: string,
  ErrorMessage?: string,
  Timestamp: string
}
```

## Fallback Behavior

When SignalR connection fails:
- Hook falls back to REST API
- Initial status is fetched via `ApiClient.getThumbnailStatus()`
- Error is stored in `error` state
- Application continues to function with manual refresh

## Lifecycle

1. **Mount**: Connect to SignalR, join model group, fetch initial status
2. **Status Update**: Receive real-time updates via SignalR
3. **Regenerate**: Set status to Pending, wait for SignalR update
4. **Model Change**: Leave old model group, join new model group
5. **Unmount**: Leave model group, disconnect from SignalR

## Performance Considerations

- SignalR connection is shared but scoped per model
- Connection automatically reconnects on network issues
- Cleanup prevents memory leaks on component unmount
- Efficient state updates only when status actually changes

## Related

- [ThumbnailDisplay](../components/ThumbnailDisplay.md) - Main component using this hook
- [ThumbnailSidebar](../components/ThumbnailSidebar.md) - Uses thumbnail management
- [ApiClient](../services/ApiClient.md) - Provides REST API fallback

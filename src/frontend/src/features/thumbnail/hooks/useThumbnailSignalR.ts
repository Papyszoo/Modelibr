import { useEffect, useCallback, useState } from 'react'
import thumbnailSignalRService, {
  ThumbnailStatusChangedEvent,
  ActiveVersionChangedEvent,
} from '../../../services/ThumbnailSignalRService'
import { useApiCacheStore } from '../../../stores/apiCacheStore'

/**
 * Hook to subscribe to thumbnail status changes for displayed models.
 * Automatically manages SignalR connection and subscriptions.
 *
 * @param _modelIds - Currently unused, but reserved for future per-model subscriptions
 */
export function useThumbnailSignalR(_modelIds: number[]) {
  const [isConnected, setIsConnected] = useState(false)
  const store = useApiCacheStore()

  // Connect and join the all-models group for broadcast notifications
  useEffect(() => {
    let mounted = true

    const connectAndSubscribe = async () => {
      try {
        await thumbnailSignalRService.connect()
        if (mounted) {
          setIsConnected(thumbnailSignalRService.isConnected())
          // Join all models group to receive broadcasts for active version changes
          await thumbnailSignalRService.joinAllModelsGroup()
        }
      } catch (error) {
        console.error('Failed to connect to thumbnail SignalR hub:', error)
        if (mounted) {
          setIsConnected(false)
        }
      }
    }

    connectAndSubscribe()

    return () => {
      mounted = false
      // Leave the all models group when unmounting
      thumbnailSignalRService.leaveAllModelsGroup().catch(console.error)
    }
  }, [])

  // Handle thumbnail status changes
  const handleThumbnailStatusChanged = useCallback(
    (_event: ThumbnailStatusChangedEvent) => {
      // Invalidate thumbnail cache for the affected model version
      // Note: We use modelVersionId here, but our cache is keyed by modelId
      // The thumbnail endpoint uses modelId and returns the active version's thumbnail
      // So we need to invalidate based on which models have this version as active
      store.invalidateThumbnails()
    },
    [store]
  )

  // Handle active version changes
  const handleActiveVersionChanged = useCallback(
    (event: ActiveVersionChangedEvent) => {
      // Invalidate thumbnail cache for the affected model
      store.invalidateThumbnailById(event.modelId.toString())
      // Also invalidate model cache since active version changed
      store.invalidateModelById(event.modelId.toString())
    },
    [store]
  )

  // Subscribe to events
  useEffect(() => {
    const unsubscribeThumbnail =
      thumbnailSignalRService.onThumbnailStatusChanged(
        handleThumbnailStatusChanged
      )
    const unsubscribeActiveVersion =
      thumbnailSignalRService.onActiveVersionChanged(handleActiveVersionChanged)

    return () => {
      unsubscribeThumbnail()
      unsubscribeActiveVersion()
    }
  }, [handleThumbnailStatusChanged, handleActiveVersionChanged])

  return { isConnected }
}

/**
 * Hook to subscribe to thumbnail updates for a specific model.
 * Returns callbacks that can be used to trigger re-renders when thumbnails change.
 */
export function useModelThumbnailUpdates(
  modelId: number,
  onThumbnailReady?: (thumbnailUrl: string) => void,
  onActiveVersionChanged?: (event: ActiveVersionChangedEvent) => void
) {
  const store = useApiCacheStore()

  useEffect(() => {
    const handleThumbnailStatusChanged = (
      event: ThumbnailStatusChangedEvent
    ) => {
      if (event.status === 'Ready' && event.thumbnailUrl && onThumbnailReady) {
        onThumbnailReady(event.thumbnailUrl)
      }
      // Invalidate cache to trigger re-fetch
      store.invalidateThumbnailById(modelId.toString())
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      if (event.modelId === modelId) {
        // Invalidate thumbnail cache for this model
        store.invalidateThumbnailById(modelId.toString())
        // Call the callback if provided
        if (onActiveVersionChanged) {
          onActiveVersionChanged(event)
        }
      }
    }

    const unsubscribeThumbnail =
      thumbnailSignalRService.onThumbnailStatusChanged(
        handleThumbnailStatusChanged
      )
    const unsubscribeActiveVersion =
      thumbnailSignalRService.onActiveVersionChanged(handleActiveVersionChanged)

    return () => {
      unsubscribeThumbnail()
      unsubscribeActiveVersion()
    }
  }, [modelId, onThumbnailReady, onActiveVersionChanged, store])
}

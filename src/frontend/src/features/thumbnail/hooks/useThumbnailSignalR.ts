import { useEffect, useCallback, useState, useRef } from 'react'
import thumbnailSignalRService, {
  ThumbnailStatusChangedEvent,
  ActiveVersionChangedEvent,
} from '../../../services/ThumbnailSignalRService'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Hook to subscribe to thumbnail status changes for displayed models.
 * Automatically manages SignalR connection and subscriptions.
 *
 * @param _modelIds - Currently unused, but reserved for future per-model subscriptions
 */
export function useThumbnailSignalR(_modelIds: number[]) {
  const [isConnected, setIsConnected] = useState(false)
  const queryClient = useQueryClient()
  const hasConnected = useRef(false)

  // Connect and join the all-models group for broadcast notifications
  useEffect(() => {
    let mounted = true

    // Only connect once across StrictMode double-mount
    if (hasConnected.current) return
    hasConnected.current = true

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
      // Don't leave group on unmount — this is app-level, we want to stay connected
    }
  }, [])

  // Handle thumbnail status changes
  const handleThumbnailStatusChanged = useCallback(
    (_event: ThumbnailStatusChangedEvent) => {
      // Thumbnail status affects model lists and model detail views.
      // We don't have modelId here, so invalidate broadly.
      queryClient.invalidateQueries({ queryKey: ['models'] })
      queryClient.invalidateQueries({ queryKey: ['models', 'detail'] })
    },
    [queryClient]
  )

  // Handle active version changes
  const handleActiveVersionChanged = useCallback(
    (event: ActiveVersionChangedEvent) => {
      // Active version affects both model detail and model list rendering.
      queryClient.invalidateQueries({ queryKey: ['models'] })
      queryClient.invalidateQueries({
        queryKey: ['models', 'detail', event.modelId.toString()],
      })
    },
    [queryClient]
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
  modelId: number | null,
  onThumbnailReady?: (thumbnailUrl: string) => void,
  onActiveVersionChanged?: (event: ActiveVersionChangedEvent) => void,
  onThumbnailStatusChanged?: (event: ThumbnailStatusChangedEvent) => void
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (modelId == null) return

    const handleThumbnailStatusChanged = (
      event: ThumbnailStatusChangedEvent
    ) => {
      onThumbnailStatusChanged?.(event)
      if (event.status === 'Ready' && event.thumbnailUrl && onThumbnailReady) {
        onThumbnailReady(event.thumbnailUrl)
      }
      // Invalidate queries to trigger re-fetch
      queryClient.invalidateQueries({ queryKey: ['models'] })
      queryClient.invalidateQueries({
        queryKey: ['models', 'detail', modelId.toString()],
      })
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      if (event.modelId === modelId) {
        queryClient.invalidateQueries({ queryKey: ['models'] })
        queryClient.invalidateQueries({
          queryKey: ['models', 'detail', modelId.toString()],
        })
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
  }, [
    modelId,
    onThumbnailReady,
    onActiveVersionChanged,
    onThumbnailStatusChanged,
    queryClient,
  ])
}

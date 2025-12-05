import { useEffect, useState, useCallback, useRef } from 'react'
import ApiClient, { ThumbnailStatus } from '../../../services/ApiClient'
import thumbnailSignalRService, {
  ThumbnailStatusChangedEvent,
  ActiveVersionChangedEvent,
} from '../../../services/ThumbnailSignalRService'

export function useThumbnail(modelId: string) {
  const [thumbnailDetails, setThumbnailDetails] =
    useState<ThumbnailStatus | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Use a ref to store the cache-busting timestamp that only updates on SignalR events
  const cacheBustTimestamp = useRef(Date.now())

  const fetchThumbnailDetails = useCallback(async () => {
    try {
      const details = await ApiClient.getThumbnailStatus(modelId, {
        skipCache: true,
      })
      setThumbnailDetails(details)

      // Use direct URL to leverage browser caching instead of fetching blob
      // Add a cache-busting parameter only when thumbnail is updated via SignalR
      if (details?.status === 'Ready') {
        const baseUrl = ApiClient.getThumbnailUrl(modelId)
        // Use the stable timestamp that only changes on SignalR events
        setImgSrc(`${baseUrl}?t=${cacheBustTimestamp.current}`)
      } else {
        setImgSrc(null)
      }
    } catch (error) {
      console.error('Failed to fetch thumbnail status:', error)
    }
  }, [modelId])

  // Initial fetch
  useEffect(() => {
    fetchThumbnailDetails()
  }, [fetchThumbnailDetails, refreshKey])

  // Subscribe to SignalR events for real-time updates
  useEffect(() => {
    const handleThumbnailStatusChanged = (
      event: ThumbnailStatusChangedEvent
    ) => {
      // When any thumbnail status changes, we need to check if it affects this model
      // Since we're in the "all models" broadcast group, we receive all events
      // The ThumbnailStatusChangedEvent contains modelVersionId, not modelId
      // So we need to refresh to check if this affects our model
      if (event.status === 'Ready' || event.status === 'Failed') {
        // Update cache bust timestamp when we receive a SignalR event
        cacheBustTimestamp.current = Date.now()
        setRefreshKey(prev => prev + 1)
      }
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      // When active version changes for our model, refresh thumbnail
      if (event.modelId.toString() === modelId) {
        // Update cache bust timestamp when we receive a SignalR event
        cacheBustTimestamp.current = Date.now()
        setRefreshKey(prev => prev + 1)
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
  }, [modelId])

  return { thumbnailDetails, imgSrc, refreshThumbnail: fetchThumbnailDetails }
}

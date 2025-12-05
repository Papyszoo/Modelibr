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
      console.log(`useThumbnail[${modelId}]: Fetching thumbnail details...`)
      const details = await ApiClient.getThumbnailStatus(modelId, {
        skipCache: true,
      })
      console.log(`useThumbnail[${modelId}]: Got details:`, details)
      setThumbnailDetails(details)

      // Use direct URL to leverage browser caching instead of fetching blob
      // Add a cache-busting parameter only when thumbnail is updated via SignalR
      if (details?.status === 'Ready') {
        const baseUrl = ApiClient.getThumbnailUrl(modelId)
        // Use the stable timestamp that only changes on SignalR events
        const newSrc = `${baseUrl}?t=${cacheBustTimestamp.current}`
        console.log(`useThumbnail[${modelId}]: Setting imgSrc to:`, newSrc)
        setImgSrc(newSrc)
      } else {
        setImgSrc(null)
      }
    } catch (error) {
      console.error(`useThumbnail[${modelId}]: Failed to fetch:`, error)
    }
  }, [modelId])

  // Initial fetch
  useEffect(() => {
    fetchThumbnailDetails()
  }, [fetchThumbnailDetails, refreshKey])

  // Subscribe to SignalR events for real-time updates
  useEffect(() => {
    console.log(`useThumbnail[${modelId}]: Setting up SignalR subscriptions`)

    const handleThumbnailStatusChanged = (
      event: ThumbnailStatusChangedEvent
    ) => {
      console.log(
        `useThumbnail[${modelId}]: Received ThumbnailStatusChanged event:`,
        event
      )
      // When any thumbnail status changes, we need to check if it affects this model
      // Since we're in the "all models" broadcast group, we receive all events
      // The ThumbnailStatusChangedEvent contains modelVersionId, not modelId
      // So we need to refresh to check if this affects our model
      if (event.status === 'Ready' || event.status === 'Failed') {
        console.log(
          `useThumbnail[${modelId}]: Triggering refresh due to status change`
        )
        // Update cache bust timestamp when we receive a SignalR event
        cacheBustTimestamp.current = Date.now()
        setRefreshKey(prev => prev + 1)
      }
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      console.log(
        `useThumbnail[${modelId}]: Received ActiveVersionChanged event:`,
        event
      )
      // When active version changes for our model, refresh thumbnail
      if (event.modelId.toString() === modelId) {
        console.log(
          `useThumbnail[${modelId}]: Triggering refresh due to active version change`
        )
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
      console.log(`useThumbnail[${modelId}]: Cleaning up SignalR subscriptions`)
      unsubscribeThumbnail()
      unsubscribeActiveVersion()
    }
  }, [modelId])

  return { thumbnailDetails, imgSrc, refreshThumbnail: fetchThumbnailDetails }
}

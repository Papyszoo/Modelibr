import { useEffect, useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ThumbnailStatus,
  getThumbnailStatus,
  getVersionThumbnailStatus,
  getThumbnailUrl,
  getVersionThumbnailUrl,
} from '../api/thumbnailApi'
import { thumbnailSignalRService, ThumbnailStatusChangedEvent,
  ActiveVersionChangedEvent, } from '../../../services/ThumbnailSignalRService'

// Only log in development mode
const isDev = import.meta.env.DEV
const log = (message: string, ...args: unknown[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

export function useThumbnail(modelId: string, versionId?: number) {
  const queryClient = useQueryClient()
  const [thumbnailDetails, setThumbnailDetails] =
    useState<ThumbnailStatus | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Use a ref to store the cache-busting timestamp that only updates on SignalR events
  const cacheBustTimestamp = useRef(Date.now())

  const fetchThumbnailDetails = useCallback(async () => {
    try {
      const identifier = versionId ? `version:${versionId}` : `model:${modelId}`
      log(`useThumbnail[${identifier}]: Fetching thumbnail details...`)

      const details = versionId
        ? await getVersionThumbnailStatus(versionId, {
            skipCache: true,
          })
        : await getThumbnailStatus(modelId, { skipCache: true })

      log(`useThumbnail[${identifier}]: Got details:`, details)
      setThumbnailDetails(details)

      // Use direct URL to leverage browser caching instead of fetching blob
      // Add a cache-busting parameter only when thumbnail is updated via SignalR
      if (details?.status === 'Ready') {
        const baseUrl = versionId
          ? getVersionThumbnailUrl(versionId)
          : getThumbnailUrl(modelId)
        // Use the stable timestamp that only changes on SignalR events
        const newSrc = `${baseUrl}?t=${cacheBustTimestamp.current}`
        log(`useThumbnail[${identifier}]: Setting imgSrc to:`, newSrc)
        setImgSrc(newSrc)
      } else {
        setImgSrc(null)
      }
    } catch (error) {
      const identifier = versionId ? `version:${versionId}` : `model:${modelId}`
      console.error(`useThumbnail[${identifier}]: Failed to fetch:`, error)
    }
  }, [modelId, versionId])

  // Initial fetch
  useEffect(() => {
    fetchThumbnailDetails()
  }, [fetchThumbnailDetails, refreshKey])

  // Subscribe to SignalR events for real-time updates
  useEffect(() => {
    log(`useThumbnail[${modelId}]: Setting up SignalR subscriptions`)

    const handleThumbnailStatusChanged = (
      event: ThumbnailStatusChangedEvent
    ) => {
      log(
        `useThumbnail[${modelId}]: Received ThumbnailStatusChanged event:`,
        event
      )
      // When any thumbnail status changes, we need to check if it affects this model
      // Since we're in the "all models" broadcast group, we receive all events
      // The ThumbnailStatusChangedEvent contains modelVersionId, not modelId
      // So we need to refresh to check if this affects our model
      if (event.status === 'Ready' || event.status === 'Failed') {
        log(`useThumbnail[${modelId}]: Triggering refresh due to status change`)
        // Update cache bust timestamp when we receive a SignalR event
        cacheBustTimestamp.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['models'] })
        queryClient.invalidateQueries({ queryKey: ['models', 'detail'] })
        setRefreshKey(prev => prev + 1)
      }
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      log(
        `useThumbnail[${modelId}]: Received ActiveVersionChanged event:`,
        event
      )
      // When active version changes for our model, refresh thumbnail
      if (event.modelId.toString() === modelId) {
        log(
          `useThumbnail[${modelId}]: Triggering refresh due to active version change`
        )
        // Update cache bust timestamp when we receive a SignalR event
        cacheBustTimestamp.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['models'] })
        queryClient.invalidateQueries({
          queryKey: ['models', 'detail', modelId],
        })
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
      log(`useThumbnail[${modelId}]: Cleaning up SignalR subscriptions`)
      unsubscribeThumbnail()
      unsubscribeActiveVersion()
    }
  }, [modelId, queryClient])

  return { thumbnailDetails, imgSrc, refreshThumbnail: fetchThumbnailDetails }
}

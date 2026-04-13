import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type EnvironmentMapThumbnailStatus } from '@/features/environment-map/api/environmentMapApi'
import { getEnvironmentMapByIdQueryOptions } from '@/features/environment-map/api/queries'

import {
  type ActiveVersionChangedEvent,
  type EnvironmentMapThumbnailStatusChangedEvent,
  thumbnailSignalRService,
  type ThumbnailStatusChangedEvent,
} from '../../../services/ThumbnailSignalRService'
import { type ThumbnailStatus } from '../api/thumbnailApi'

/**
 * Build a partial ThumbnailStatus from a SignalR event for setQueryData.
 */
function thumbnailStatusFromEvent(
  event: ThumbnailStatusChangedEvent
): ThumbnailStatus {
  return {
    status: event.status as ThumbnailStatus['status'],
    processedAt: event.timestamp,
    errorMessage: event.errorMessage ?? undefined,
  }
}

/**
 * Hook to subscribe to thumbnail status changes for displayed models and
 * environment maps.
 * Automatically manages SignalR connection and subscriptions.
 *
 * Model thumbnail events update React Query cache directly. Environment-map
 * thumbnail events invalidate the affected list/detail queries so they refetch
 * the latest preview URL from the API.
 *
 * @param _modelIds - Currently unused, but reserved for future per-model subscriptions
 */
export function useThumbnailSignalR(_modelIds: number[]) {
  const [isConnected, setIsConnected] = useState(false)
  const queryClient = useQueryClient()
  const hasConnected = useRef(false)

  // Connect and join the broadcast groups for thumbnail notifications
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
          await Promise.all([
            thumbnailSignalRService.joinAllModelsGroup(),
            thumbnailSignalRService.joinAllEnvironmentMapsGroup(),
          ])
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
    }
  }, [])

  // Handle thumbnail status changes via setQueryData (zero network cost).
  // The backend includes modelId in the event, so we can update directly.
  const handleThumbnailStatusChanged = useCallback(
    (event: ThumbnailStatusChangedEvent) => {
      const newData = thumbnailStatusFromEvent(event)

      // Update version-level cache (used by VersionStrip detail view)
      queryClient.setQueryData<ThumbnailStatus>(
        ['thumbnail', 'version', event.modelVersionId],
        old => ({ ...old, ...newData })
      )

      // Update model-level cache (used by grid view) — modelId comes from the event
      queryClient.setQueryData<ThumbnailStatus>(
        ['thumbnail', event.modelId.toString()],
        old => ({ ...old, ...newData })
      )
    },
    [queryClient]
  )

  // Handle active version changes — targeted invalidation only
  const handleActiveVersionChanged = useCallback(
    (event: ActiveVersionChangedEvent) => {
      queryClient.invalidateQueries({
        queryKey: ['thumbnail', event.modelId.toString()],
      })
      queryClient.invalidateQueries({
        queryKey: ['models', 'detail', event.modelId.toString()],
      })
    },
    [queryClient]
  )

  const handleEnvironmentMapThumbnailStatusChanged = useCallback(
    (event: EnvironmentMapThumbnailStatusChangedEvent) => {
      const newData: EnvironmentMapThumbnailStatus = {
        status: event.status as EnvironmentMapThumbnailStatus['status'],
        previewVariantId: event.environmentMapVariantId,
        fileUrl: event.previewUrl ?? undefined,
        errorMessage: event.errorMessage ?? undefined,
        processedAt: event.timestamp,
      }
      queryClient.setQueryData(
        ['environmentMapThumbnail', event.environmentMapId],
        (old: EnvironmentMapThumbnailStatus | undefined) => ({
          ...old,
          ...newData,
        })
      )
      queryClient.invalidateQueries({
        queryKey: getEnvironmentMapByIdQueryOptions(event.environmentMapId)
          .queryKey,
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
    const unsubscribeEnvironmentMapThumbnail =
      thumbnailSignalRService.onEnvironmentMapThumbnailStatusChanged(
        handleEnvironmentMapThumbnailStatusChanged
      )

    return () => {
      unsubscribeThumbnail()
      unsubscribeActiveVersion()
      unsubscribeEnvironmentMapThumbnail()
    }
  }, [
    handleThumbnailStatusChanged,
    handleActiveVersionChanged,
    handleEnvironmentMapThumbnailStatusChanged,
  ])

  return { isConnected }
}

/**
 * Hook to subscribe to thumbnail updates for a specific model (detail view).
 * Uses setQueryData for instant cache updates. Only invalidates the model
 * detail query (not thumbnail) since setQueryData handles the thumbnail.
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
      // Only handle events for THIS model
      if (event.modelId !== modelId) return

      onThumbnailStatusChanged?.(event)
      if (event.status === 'Ready' && event.thumbnailUrl && onThumbnailReady) {
        onThumbnailReady(event.thumbnailUrl)
      }
      // Update caches via setQueryData — no network request
      queryClient.setQueryData<ThumbnailStatus>(
        ['thumbnail', 'version', event.modelVersionId],
        old => ({ ...old, ...thumbnailStatusFromEvent(event) })
      )
      queryClient.setQueryData<ThumbnailStatus>(
        ['thumbnail', modelId.toString()],
        old => ({ ...old, ...thumbnailStatusFromEvent(event) })
      )
      // Only invalidate model detail (for metadata like file list), not thumbnail
      queryClient.invalidateQueries({
        queryKey: ['models', 'detail', modelId.toString()],
      })
    }

    const handleActiveVersionChanged = (event: ActiveVersionChangedEvent) => {
      if (event.modelId === modelId) {
        // Active version changed — need to refetch thumbnail since it points to a new version
        queryClient.invalidateQueries({
          queryKey: ['thumbnail', modelId.toString()],
        })
        queryClient.invalidateQueries({
          queryKey: ['models', 'detail', modelId.toString()],
        })
        onActiveVersionChanged?.(event)
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

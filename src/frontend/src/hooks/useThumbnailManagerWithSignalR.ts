import { useState, useEffect, useCallback, useRef } from 'react'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import ApiClient from '../services/ApiClient'

const THUMBNAIL_STATUS = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed',
}

export function useThumbnailManagerWithSignalR(modelId) {
  const [thumbnailStatus, setThumbnailStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isConnected, setIsConnected] = useState(false)

  const connectionRef = useRef(null)
  const mountedRef = useRef(true)

  // Get API base URL for SignalR connection (remove /api suffix if present)
  const getSignalRUrl = useCallback(() => {
    const baseUrl = ApiClient.getBaseURL().replace(/\/api\/?$/, '')
    return `${baseUrl}/thumbnailHub`
  }, [])

  // Initialize SignalR connection
  const initializeConnection = useCallback(async () => {
    if (connectionRef.current || !modelId) return

    try {
      const connection = new HubConnectionBuilder()
        .withUrl(getSignalRUrl(), {
          withCredentials: false, // Adjust based on your CORS setup
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Information)
        .build()

      // Handle thumbnail status change events
      connection.on('ThumbnailStatusChanged', notification => {
        if (!mountedRef.current) return

        // Only update if this notification is for our model
        if (notification.ModelId === modelId) {
          console.log('Received thumbnail status update:', notification)

          setThumbnailStatus({
            Status: notification.Status,
            FileUrl: notification.ThumbnailUrl,
            // Add other fields as needed
            ProcessedAt: notification.Timestamp,
          })
        }
      })

      // Handle connection state changes
      connection.onclose(() => {
        if (mountedRef.current) {
          setIsConnected(false)
          console.log('SignalR connection closed')
        }
      })

      connection.onreconnected(() => {
        if (mountedRef.current) {
          setIsConnected(true)
          console.log('SignalR reconnected')
          // Re-join the model group after reconnection
          if (modelId) {
            connection.invoke('JoinModelGroup', modelId.toString())
          }
        }
      })

      await connection.start()

      if (!mountedRef.current) {
        await connection.stop()
        return
      }

      connectionRef.current = connection
      setIsConnected(true)

      // Join the model group to receive notifications
      await connection.invoke('JoinModelGroup', modelId.toString())

      console.log('SignalR connected and joined model group:', modelId)

      // Fetch initial thumbnail status
      await fetchThumbnailStatus()
    } catch (err) {
      console.error('SignalR connection failed:', err)
      if (mountedRef.current) {
        setError(`Failed to connect to real-time updates: ${err.message}`)
        // Fall back to initial fetch
        await fetchThumbnailStatus()
      }
    }
  }, [modelId, getSignalRUrl])

  // Clean up connection
  const cleanupConnection = useCallback(async () => {
    if (connectionRef.current) {
      try {
        if (modelId && connectionRef.current.state === 'Connected') {
          await connectionRef.current.invoke(
            'LeaveModelGroup',
            modelId.toString()
          )
        }
        await connectionRef.current.stop()
      } catch (err) {
        console.error('Error stopping SignalR connection:', err)
      }
      connectionRef.current = null
    }
    setIsConnected(false)
  }, [modelId])

  // Fetch thumbnail status (for initial load and fallback)
  const fetchThumbnailStatus = useCallback(async () => {
    if (!modelId) return null

    try {
      setError(null)
      const response = await ApiClient.getThumbnailStatus(modelId)

      if (!mountedRef.current) return null

      setThumbnailStatus(response)
      return response
    } catch (err) {
      if (!mountedRef.current) return null

      setError(`Failed to fetch thumbnail status: ${err.message}`)
      return null
    }
  }, [modelId])

  const regenerateThumbnail = useCallback(async () => {
    if (!modelId) return

    try {
      setIsLoading(true)
      setError(null)

      await ApiClient.regenerateThumbnail(modelId)

      // Reset status - SignalR will update us with new status
      setThumbnailStatus(null)
    } catch (err) {
      setError(`Failed to regenerate thumbnail: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [modelId])

  // Initialize connection when modelId changes
  useEffect(() => {
    if (modelId) {
      initializeConnection()
    }

    return () => {
      cleanupConnection()
    }
  }, [modelId, initializeConnection, cleanupConnection])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      cleanupConnection()
    }
  }, [cleanupConnection])

  const isProcessing =
    thumbnailStatus?.Status === THUMBNAIL_STATUS.PROCESSING ||
    thumbnailStatus?.Status === THUMBNAIL_STATUS.PENDING
  const isReady = thumbnailStatus?.Status === THUMBNAIL_STATUS.READY
  const isFailed = thumbnailStatus?.Status === THUMBNAIL_STATUS.FAILED
  const thumbnailUrl =
    isReady && thumbnailStatus.FileUrl
      ? ApiClient.getThumbnailUrl(modelId)
      : null

  return {
    thumbnailStatus,
    thumbnailUrl,
    isLoading,
    error,
    isConnected,
    isProcessing,
    isReady,
    isFailed,
    regenerateThumbnail,
    fetchThumbnailStatus,
  }
}

export { THUMBNAIL_STATUS }

import { useState, useEffect, useCallback, useRef } from 'react'
import ApiClient from '../services/ApiClient'

const THUMBNAIL_STATUS = {
  PENDING: 'Pending',
  PROCESSING: 'Processing', 
  READY: 'Ready',
  FAILED: 'Failed'
}

const POLL_INTERVAL = 2000 // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 150 // 5 minutes max polling (150 * 2s = 300s)

export function useThumbnailManager(modelId) {
  const [thumbnailStatus, setThumbnailStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pollAttempts, setPollAttempts] = useState(0)
  
  const pollIntervalRef = useRef(null)
  const mountedRef = useRef(true)

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  const fetchThumbnailStatus = useCallback(async () => {
    try {
      setError(null)
      const response = await ApiClient.getThumbnailStatus(modelId)
      
      if (!mountedRef.current) return
      
      setThumbnailStatus(response)
      
      // Stop polling if we reach a terminal state or max attempts
      const isTerminalState = response.Status === THUMBNAIL_STATUS.READY || 
                             response.Status === THUMBNAIL_STATUS.FAILED
      
      if (isTerminalState || pollAttempts >= MAX_POLL_ATTEMPTS) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      }
      
      return response
    } catch (err) {
      if (!mountedRef.current) return
      
      setError(`Failed to fetch thumbnail status: ${err.message}`)
      // Stop polling on error
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return null
    }
  }, [modelId, pollAttempts])

  const startPolling = useCallback(() => {
    // Don't start polling if already polling or if in terminal state
    if (pollIntervalRef.current) return
    if (thumbnailStatus?.Status === THUMBNAIL_STATUS.READY || 
        thumbnailStatus?.Status === THUMBNAIL_STATUS.FAILED) return

    setPollAttempts(0)
    
    // Initial fetch
    fetchThumbnailStatus()
    
    // Start polling
    pollIntervalRef.current = setInterval(() => {
      setPollAttempts(prev => prev + 1)
      fetchThumbnailStatus()
    }, POLL_INTERVAL)
  }, [fetchThumbnailStatus, thumbnailStatus])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const regenerateThumbnail = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      await ApiClient.regenerateThumbnail(modelId)
      
      // Reset status and start polling
      setThumbnailStatus(null)
      setPollAttempts(0)
      startPolling()
      
    } catch (err) {
      setError(`Failed to regenerate thumbnail: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [modelId, startPolling])

  // Auto-start polling when component mounts or modelId changes
  useEffect(() => {
    if (modelId) {
      startPolling()
    }
    
    return () => {
      stopPolling()
    }
  }, [modelId, startPolling, stopPolling])

  const isPolling = pollIntervalRef.current !== null
  const isProcessing = thumbnailStatus?.Status === THUMBNAIL_STATUS.PROCESSING || 
                      thumbnailStatus?.Status === THUMBNAIL_STATUS.PENDING
  const isReady = thumbnailStatus?.Status === THUMBNAIL_STATUS.READY
  const isFailed = thumbnailStatus?.Status === THUMBNAIL_STATUS.FAILED
  const thumbnailUrl = isReady && thumbnailStatus.FileUrl ? 
                      ApiClient.getThumbnailUrl(modelId) : null

  return {
    thumbnailStatus,
    thumbnailUrl,
    isLoading,
    error,
    isPolling,
    isProcessing,
    isReady,
    isFailed,
    pollAttempts,
    startPolling,
    stopPolling,
    regenerateThumbnail,
    fetchThumbnailStatus
  }
}

export { THUMBNAIL_STATUS }
import { useState, useRef, useEffect, useCallback } from 'react'
import ApiClient from '../../services/ApiClient'
import {
  isSupportedModelFormat,
  isThreeJSRenderable,
} from '../../utils/fileUtils'
import { useUploadProgress } from '../../hooks/useUploadProgress'

/**
 * Custom hook for handling file uploads with validation and progress tracking
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireThreeJSRenderable - Only allow Three.js renderable formats
 * @param {Function} options.onSuccess - Callback called on successful upload
 * @param {Function} options.onError - Callback called on upload error
 * @param {Object} options.toast - Toast reference for showing notifications
 * @param {boolean} options.useGlobalProgress - Whether to use global upload progress window (default: true)
 * @param {string} options.fileType - Type of file being uploaded: 'model' | 'texture' | 'file' (default: 'model')
 * @returns {Object} Upload state and functions
 */
export function useFileUpload(options = {}) {
  const {
    requireThreeJSRenderable = false,
    onSuccess,
    onError,
    toast,
    useGlobalProgress = true,
    fileType = 'model',
  } = options

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Always call the hook unconditionally, but only use it if enabled
  const uploadProgressContext = useUploadProgress()

  /**
   * Upload a single file
   * @param {File} file - File to upload
   * @param {string} uploadId - Optional upload ID for global progress tracking
   * @param {string} batchId - Optional batch ID for backend tracking
   * @returns {Promise<Object>} Upload result
   */
  const uploadSingleFile = async (file, uploadId = null, batchId = null) => {
    if (!file) {
      throw new Error('No file provided')
    }

    const fileExtension = '.' + file.name.split('.').pop().toLowerCase()

    // Validate file format
    if (!isSupportedModelFormat(fileExtension)) {
      const error = new Error(
        `File ${file.name} is not a supported 3D model format`
      )
      error.type = 'UNSUPPORTED_FORMAT'

      // Update global progress if enabled and available
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.failUpload(uploadId, error)
      }

      throw error
    }

    // Check Three.js renderability if required
    if (requireThreeJSRenderable && !isThreeJSRenderable(fileExtension)) {
      const error = new Error(
        `File ${file.name} (${fileExtension.toUpperCase()}) is supported but not renderable in 3D viewer. Use the upload page for this file type.`
      )
      error.type = 'NON_RENDERABLE'

      // Update global progress if enabled and available
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.failUpload(uploadId, error)
      }

      throw error
    }

    try {
      // Update global progress if enabled and available
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.updateUploadProgress(uploadId, 50)
      }

      const result = await ApiClient.uploadModel(file, { batchId })

      // Update global progress if enabled and available
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.updateUploadProgress(uploadId, 100)
        uploadProgressContext.completeUpload(uploadId, result)
      }

      return result
    } catch (error) {
      // Update global progress if enabled and available
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.failUpload(uploadId, error)
      }

      if (!error.type) {
        error.type = 'NETWORK_ERROR'
      }
      throw error
    }
  }

  /**
   * Upload multiple files with progress tracking
   * @param {FileList|File[]} files - Files to upload
   * @returns {Promise<Object>} Upload results summary
   */
  const uploadMultipleFiles = async files => {
    if (!files || files.length === 0) {
      return { succeeded: [], failed: [], total: 0 }
    }

    const fileArray = Array.from(files)
    const results = {
      succeeded: [],
      failed: [],
      total: fileArray.length,
    }

    setUploading(true)
    setUploadProgress(0)

    // Create batch for multiple files
    const batchId =
      useGlobalProgress && uploadProgressContext && fileArray.length > 1
        ? uploadProgressContext.createBatch()
        : undefined

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]

        // Add to global progress tracker if enabled and available
        const uploadId =
          useGlobalProgress && uploadProgressContext
            ? uploadProgressContext.addUpload(file, fileType, batchId)
            : null

        try {
          const result = await uploadSingleFile(file, uploadId, batchId)
          results.succeeded.push({ file, result })

          // Show success notification if toast is provided
          if (toast?.current) {
            toast.current.show({
              severity: 'success',
              summary: 'Upload Successful',
              detail: `${file.name} uploaded successfully`,
            })
          }
        } catch (error) {
          results.failed.push({ file, error })

          // Show error notification if toast is provided
          if (toast?.current) {
            const severity =
              error.type === 'UNSUPPORTED_FORMAT' ||
              error.type === 'NON_RENDERABLE'
                ? 'warn'
                : 'error'
            const summary =
              error.type === 'UNSUPPORTED_FORMAT'
                ? 'Unsupported File'
                : error.type === 'NON_RENDERABLE'
                  ? 'Non-renderable Format'
                  : 'Upload Failed'

            toast.current.show({
              severity,
              summary,
              detail: error.message,
            })
          }

          if (onError) {
            onError(file, error)
          }
        }

        // Round progress to 2 decimal places
        const progress =
          Math.round(((i + 1) / fileArray.length) * 100 * 100) / 100
        setUploadProgress(progress)
      }

      // Call onSuccess once after all uploads complete (if any succeeded)
      if (onSuccess && results.succeeded.length > 0) {
        onSuccess(null, results)
      }

      return results
    } catch (err) {
      // Handle unexpected errors
      if (toast?.current) {
        toast.current.show({
          severity: 'error',
          summary: 'Upload Error',
          detail: err.message,
        })
      }
      throw err
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  /**
   * Upload a single file with UI feedback
   * @param {File} file - File to upload
   * @returns {Promise<Object>} Upload result
   */
  const uploadFile = async file => {
    setUploading(true)
    setUploadProgress(0)

    // Add to global progress tracker if enabled and available
    const uploadId =
      useGlobalProgress && uploadProgressContext
        ? uploadProgressContext.addUpload(file, fileType)
        : null

    try {
      setUploadProgress(50)
      const result = await uploadSingleFile(file, uploadId)
      setUploadProgress(100)

      if (onSuccess) {
        onSuccess(file, result)
      }

      return result
    } catch (error) {
      if (onError) {
        onError(file, error)
      }
      throw error
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return {
    uploading,
    uploadProgress,
    uploadFile,
    uploadMultipleFiles,
    uploadSingleFile,
  }
}

/**
 * Utility function to create drag and drop handlers
 * @param {Function} onFilesDropped - Callback when files are dropped
 * @returns {Object} Drag and drop event handlers
 */
export function useDragAndDrop(onFilesDropped) {
  // Use a ref to track nested drag enter/leave events
  // This prevents flickering when dragging over child elements
  const dragCounterRef = useRef(0)
  const dragTargetRef = useRef(null)

  // Clear drag state helper function
  // Wrapped in useCallback to ensure stable reference across renders
  const clearDragState = useCallback(() => {
    dragCounterRef.current = 0
    document.body.classList.remove('dragging-file')
    if (dragTargetRef.current) {
      dragTargetRef.current.classList.remove('drag-over')
      dragTargetRef.current = null
    }
  }, [])

  // Set up global event listeners to handle edge cases where drag leaves the window
  useEffect(() => {
    const handleDragEnd = () => {
      // When drag operation ends anywhere, clear the drag state
      clearDragState()
    }

    const handleDrop = () => {
      // When drop happens anywhere in the document, clear the drag state
      clearDragState()
    }

    // Add listeners to window to catch drag operations that end outside our drop zones
    window.addEventListener('dragend', handleDragEnd)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragend', handleDragEnd)
      window.removeEventListener('drop', handleDrop)
      // Clean up any lingering drag state on unmount
      clearDragState()
    }
  }, [clearDragState])

  const onDrop = e => {
    e.preventDefault()
    e.stopPropagation()

    // Clear drag state immediately and unconditionally
    clearDragState()

    // Only process files if they are actually present
    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      const files = Array.from(e.dataTransfer.files)

      // Call the callback in a try-catch to ensure drag state is always cleared
      // even if the callback throws an error
      try {
        onFilesDropped(files)
      } catch (error) {
        // Ensure drag state is cleared even if callback fails
        clearDragState()
        throw error
      }
    }
  }

  const onDragEnter = e => {
    e.preventDefault()
    e.stopPropagation()

    // Only add drag visual feedback if files are being dragged
    // This prevents tab drags from interfering with the UI
    if (
      e.dataTransfer &&
      e.dataTransfer.types &&
      e.dataTransfer.types.includes('Files')
    ) {
      dragCounterRef.current++

      // Store reference to the drag target
      if (dragCounterRef.current === 1) {
        dragTargetRef.current = e.currentTarget
        document.body.classList.add('dragging-file')
        e.currentTarget.classList.add('drag-over')
      }
    }
  }

  const onDragLeave = e => {
    e.preventDefault()
    e.stopPropagation()

    // Only decrement for file drags
    if (
      e.dataTransfer &&
      e.dataTransfer.types &&
      e.dataTransfer.types.includes('Files')
    ) {
      dragCounterRef.current--

      // Only remove classes when we've left all nested elements (counter reaches 0)
      if (dragCounterRef.current === 0) {
        clearDragState()
      }

      // Safety check: prevent negative counter
      if (dragCounterRef.current < 0) {
        clearDragState()
      }
    }
  }

  const onDragOver = e => {
    e.preventDefault()
    e.stopPropagation()
    // Don't add any visual feedback here - it's handled in onDragEnter
  }

  return {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }
}

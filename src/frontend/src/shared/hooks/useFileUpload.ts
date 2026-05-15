import { useCallback, useEffect, useRef, useState } from 'react'

import { uploadModel } from '@/features/models/api/modelApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'

import {
  isSupportedModelFormat,
  isThreeJSRenderable,
} from '../../utils/fileUtils'

const UPLOAD_CONCURRENCY = 4

/**
 * Custom hook for handling file uploads with validation and progress tracking
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireThreeJSRenderable - Only allow Three.js renderable formats
 * @param {Function} options.onSuccess - Callback called on successful upload
 * @param {Function} options.onError - Callback called on upload error
 * @param {Object} options.toast - Toast reference for showing error notifications
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
   * Validate a file pre-upload. Returns an error object on failure, null on pass.
   */
  const validateFile = file => {
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase()

    if (!isSupportedModelFormat(fileExtension)) {
      const error = new Error(
        `File ${file.name} is not a supported 3D model format`
      )
      error.type = 'UNSUPPORTED_FORMAT'
      return error
    }

    // .blend files bypass renderability — handled by the asset-processor
    const isBlendFile = fileExtension === '.blend'
    if (
      requireThreeJSRenderable &&
      !isThreeJSRenderable(fileExtension) &&
      !isBlendFile
    ) {
      const error = new Error(
        `File ${file.name} (${fileExtension.toUpperCase()}) is supported but not renderable in 3D viewer. Use the upload page for this file type.`
      )
      error.type = 'NON_RENDERABLE'
      return error
    }

    return null
  }

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

    const validationError = validateFile(file)
    if (validationError) {
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.failUpload(uploadId, validationError)
      }
      throw validationError
    }

    try {
      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.updateUploadProgress(uploadId, 50)
      }

      const result = await uploadModel(file, { batchId })

      if (useGlobalProgress && uploadId && uploadProgressContext) {
        uploadProgressContext.updateUploadProgress(uploadId, 100)
        uploadProgressContext.completeUpload(uploadId, result)
      }

      return result
    } catch (error) {
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
   * Upload multiple files with progress tracking. Files are uploaded with bounded
   * concurrency to avoid overwhelming the server while still being faster than serial.
   * @param {FileList|File[]} files - Files to upload
   * @returns {Promise<Object>} Upload results summary
   */
  const uploadMultipleFiles = async files => {
    if (!files || files.length === 0) {
      return { succeeded: [], failed: [], total: 0 }
    }

    const fileArray = Array.from(files)
    const total = fileArray.length
    const results = {
      succeeded: [],
      failed: [],
      total,
    }

    setUploading(true)
    setUploadProgress(0)

    const useStore =
      useGlobalProgress && uploadProgressContext && total > 0

    // Create batch + reserve all upload IDs in a single store update.
    // This avoids N separate addUpload calls (each cloning state) when many
    // files are dropped.
    const batchId =
      useStore && total > 1 ? uploadProgressContext.createBatch() : undefined

    const uploadIds = useStore
      ? uploadProgressContext.addUploads(fileArray, fileType, batchId)
      : new Array(total).fill(null)

    let completed = 0
    const handleFileResult = (file, error) => {
      completed++
      const progress = Math.round((completed / total) * 100 * 100) / 100
      setUploadProgress(progress)

      if (error) {
        results.failed.push({ file, error })

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
    }

    const runOne = async index => {
      const file = fileArray[index]
      const uploadId = uploadIds[index]
      try {
        const result = await uploadSingleFile(file, uploadId, batchId)
        results.succeeded.push({ file, result })
        handleFileResult(file, null)
      } catch (error) {
        handleFileResult(file, error)
      }
    }

    try {
      // Bounded concurrency pool: keep UPLOAD_CONCURRENCY workers busy until
      // the queue is drained. Order of completion is unspecified; results
      // arrays are populated as each upload finishes.
      let next = 0
      const workers = new Array(Math.min(UPLOAD_CONCURRENCY, total))
        .fill(null)
        .map(async () => {
          while (true) {
            const index = next++
            if (index >= total) return
            await runOne(index)
          }
        })
      await Promise.all(workers)

      if (onSuccess && results.succeeded.length > 0) {
        onSuccess(null, results)
      }

      return results
    } catch (err) {
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

// ---------------------------------------------------------------------------
// Shared drag coordinator
// ---------------------------------------------------------------------------
// All instances of useDragAndDrop share a single pair of window listeners.
// When the first instance mounts we attach; when the last unmounts we detach.
// Each instance registers a clear-callback that runs on global dragend/drop.

type DragSubscriber = () => void
const dragSubscribers: Set<DragSubscriber> = new Set()
let dragListenersAttached = false
let attachedDragEndHandler: ((e: Event) => void) | null = null
let attachedDropHandler: ((e: Event) => void) | null = null

function notifyDragSubscribers() {
  dragSubscribers.forEach(fn => fn())
}

function attachDragListeners() {
  if (dragListenersAttached) return
  attachedDragEndHandler = () => notifyDragSubscribers()
  attachedDropHandler = () => notifyDragSubscribers()
  window.addEventListener('dragend', attachedDragEndHandler)
  window.addEventListener('drop', attachedDropHandler)
  dragListenersAttached = true
}

function detachDragListeners() {
  if (!dragListenersAttached) return
  if (attachedDragEndHandler) {
    window.removeEventListener('dragend', attachedDragEndHandler)
    attachedDragEndHandler = null
  }
  if (attachedDropHandler) {
    window.removeEventListener('drop', attachedDropHandler)
    attachedDropHandler = null
  }
  dragListenersAttached = false
}

/**
 * Utility function to create drag and drop handlers
 * @param {Function} onFilesDropped - Callback when files are dropped
 * @returns {Object} Drag and drop event handlers
 */
export function useDragAndDrop(onFilesDropped) {
  // Track nested drag enter/leave to prevent flickering when dragging over
  // child elements (counter-based approach).
  const dragCounterRef = useRef(0)
  const dragTargetRef = useRef(null)

  const clearDragState = useCallback(() => {
    dragCounterRef.current = 0
    document.body.classList.remove('dragging-file')
    if (dragTargetRef.current) {
      dragTargetRef.current.classList.remove('drag-over')
      dragTargetRef.current = null
    }
  }, [])

  // Subscribe this instance's clear callback to the shared coordinator.
  useEffect(() => {
    dragSubscribers.add(clearDragState)
    attachDragListeners()

    return () => {
      dragSubscribers.delete(clearDragState)
      if (dragSubscribers.size === 0) {
        detachDragListeners()
      }
      // Clean up any lingering drag state on unmount
      clearDragState()
    }
  }, [clearDragState])

  const onDrop = e => {
    e.preventDefault()
    e.stopPropagation()

    clearDragState()

    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      const files = Array.from(e.dataTransfer.files)

      try {
        onFilesDropped(files)
      } catch (error) {
        clearDragState()
        throw error
      }
    }
  }

  const onDragEnter = e => {
    e.preventDefault()
    e.stopPropagation()

    // Only add drag visual feedback if files are being dragged.
    // This prevents tab drags (text/plain, application/json) from interfering.
    if (
      e.dataTransfer &&
      e.dataTransfer.types &&
      e.dataTransfer.types.includes('Files')
    ) {
      dragCounterRef.current++

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

    if (
      e.dataTransfer &&
      e.dataTransfer.types &&
      e.dataTransfer.types.includes('Files')
    ) {
      dragCounterRef.current--

      if (dragCounterRef.current <= 0) {
        clearDragState()
      }
    }
  }

  const onDragOver = e => {
    e.preventDefault()
    e.stopPropagation()
  }

  return {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }
}

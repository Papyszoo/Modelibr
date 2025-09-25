import { useState } from 'react'
import ApiClient from '../services/ApiClient'
import { isSupportedModelFormat, isThreeJSRenderable } from '../utils/fileUtils'

/**
 * Custom hook for handling file uploads with validation and progress tracking
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireThreeJSRenderable - Only allow Three.js renderable formats
 * @param {Function} options.onSuccess - Callback called on successful upload
 * @param {Function} options.onError - Callback called on upload error
 * @param {Object} options.toast - Toast reference for showing notifications
 * @returns {Object} Upload state and functions
 */
export function useFileUpload(options = {}) {
  const {
    requireThreeJSRenderable = false,
    onSuccess,
    onError,
    toast
  } = options

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  /**
   * Upload a single file
   * @param {File} file - File to upload
   * @returns {Promise<Object>} Upload result
   */
  const uploadSingleFile = async (file) => {
    if (!file) {
      throw new Error('No file provided')
    }

    const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
    
    // Validate file format
    if (!isSupportedModelFormat(fileExtension)) {
      const error = new Error(`File ${file.name} is not a supported 3D model format`)
      error.type = 'UNSUPPORTED_FORMAT'
      throw error
    }

    // Check Three.js renderability if required
    if (requireThreeJSRenderable && !isThreeJSRenderable(fileExtension)) {
      const error = new Error(`File ${file.name} (${fileExtension.toUpperCase()}) is supported but not renderable in 3D viewer. Use the upload page for this file type.`)
      error.type = 'NON_RENDERABLE'
      throw error
    }

    try {
      const result = await ApiClient.uploadModel(file)
      
      if (!result.isSuccess) {
        const error = new Error(result.error?.message || 'Upload failed')
        error.type = 'UPLOAD_FAILED'
        throw error
      }

      return result
    } catch (error) {
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
  const uploadMultipleFiles = async (files) => {
    if (!files || files.length === 0) {
      return { succeeded: [], failed: [], total: 0 }
    }

    const fileArray = Array.from(files)
    const results = {
      succeeded: [],
      failed: [],
      total: fileArray.length
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        
        try {
          const result = await uploadSingleFile(file)
          results.succeeded.push({ file, result })
          
          // Show success notification if toast is provided
          if (toast?.current) {
            toast.current.show({
              severity: 'success', 
              summary: 'Upload Successful', 
              detail: `${file.name} uploaded successfully`
            })
          }
          
          if (onSuccess) {
            onSuccess(file, result)
          }
        } catch (error) {
          results.failed.push({ file, error })
          
          // Show error notification if toast is provided
          if (toast?.current) {
            const severity = error.type === 'UNSUPPORTED_FORMAT' || error.type === 'NON_RENDERABLE' ? 'warn' : 'error'
            const summary = error.type === 'UNSUPPORTED_FORMAT' ? 'Unsupported File' : 
                           error.type === 'NON_RENDERABLE' ? 'Non-renderable Format' : 'Upload Failed'
            
            toast.current.show({
              severity, 
              summary, 
              detail: error.message
            })
          }
          
          if (onError) {
            onError(file, error)
          }
        }

        setUploadProgress(((i + 1) / fileArray.length) * 100)
      }
      
      return results
    } catch (err) {
      // Handle unexpected errors
      if (toast?.current) {
        toast.current.show({
          severity: 'error', 
          summary: 'Upload Error', 
          detail: err.message
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
  const uploadFile = async (file) => {
    setUploading(true)
    setUploadProgress(0)
    
    try {
      setUploadProgress(50)
      const result = await uploadSingleFile(file)
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
    uploadSingleFile
  }
}

/**
 * Utility function to create drag and drop handlers
 * @param {Function} onFilesDropped - Callback when files are dropped
 * @returns {Object} Drag and drop event handlers
 */
export function useDragAndDrop(onFilesDropped) {
  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Remove drag visual feedback
    document.body.classList.remove('dragging-file')
    e.currentTarget.classList.remove('drag-over')
    
    const files = Array.from(e.dataTransfer.files)
    onFilesDropped(files)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Add drag visual feedback
    document.body.classList.add('dragging-file')
    e.currentTarget.classList.add('drag-over')
  }

  const onDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Add drag visual feedback
    document.body.classList.add('dragging-file')
    e.currentTarget.classList.add('drag-over')
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Only remove drag feedback if we're leaving the container
    if (!e.currentTarget.contains(e.relatedTarget)) {
      document.body.classList.remove('dragging-file')
      e.currentTarget.classList.remove('drag-over')
    }
  }

  return {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave
  }
}
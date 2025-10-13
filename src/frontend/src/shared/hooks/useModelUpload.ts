import { useCallback } from 'react'
import ApiClient from '../../services/ApiClient'
import { useUploadProgress } from '../../hooks/useUploadProgress'

/**
 * Custom hook for uploading model files with global progress tracking
 * @returns {Object} Upload functions
 */
export function useModelUpload() {
  // Always call the hook unconditionally - it will throw if provider is missing
  const uploadProgressContext = useUploadProgress()

  /**
   * Upload a single model file
   * @param {File} file - File to upload
   * @param {Object} options - Optional upload options
   * @returns {Promise<Object>} Upload result
   */
  const uploadModel = useCallback(
    async (file, options = {}) => {
      if (!file) {
        throw new Error('No file provided')
      }

      // Add to global progress tracker if available
      const uploadId = uploadProgressContext
        ? uploadProgressContext.addUpload(file, 'model', options.batchId)
        : null

      try {
        // Update progress
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const result = await ApiClient.uploadModel(file, {
          batchId: options.batchId,
        })

        // Complete upload
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, result)
        }

        return result
      } catch (error) {
        // Fail upload
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error)
        }
        throw error
      }
    },
    [uploadProgressContext]
  )

  /**
   * Upload multiple model files
   * @param {File[]} files - Files to upload
   * @returns {Promise<Object[]>} Upload results
   */
  const uploadModels = useCallback(
    async files => {
      if (!files || files.length === 0) {
        return []
      }

      const fileArray = Array.from(files)
      const results = []

      // Create batch for multiple files
      const batchId =
        uploadProgressContext && fileArray.length > 1
          ? uploadProgressContext.createBatch()
          : undefined

      for (const file of fileArray) {
        try {
          const result = await uploadModel(file, { batchId })
          results.push({ file, result, success: true })
        } catch (error) {
          results.push({ file, error, success: false })
        }
      }

      return results
    },
    [uploadModel, uploadProgressContext]
  )

  return {
    uploadModel,
    uploadModels,
  }
}

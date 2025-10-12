import { useCallback } from 'react'
import ApiClient from '../../services/ApiClient'
import { useUploadProgress } from '../../hooks/useUploadProgress'

/**
 * Custom hook for uploading files (non-model files like textures)
 * @param {Object} options - Configuration options
 * @param {string} options.fileType - Type of file: 'texture' | 'file'
 * @returns {Object} Upload functions
 */
export function useGenericFileUpload(options = {}) {
  const { fileType = 'file' } = options

  // Always call the hook unconditionally - it will throw if provider is missing
  const uploadProgressContext = useUploadProgress()

  /**
   * Upload a single file
   * @param {File} file - File to upload
   * @returns {Promise<Object>} Upload result
   */
  const uploadFile = useCallback(
    async file => {
      if (!file) {
        throw new Error('No file provided')
      }

      // Add to global progress tracker if available
      const uploadId = uploadProgressContext
        ? uploadProgressContext.addUpload(file, fileType)
        : null

      try {
        // Update progress
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const result = await ApiClient.uploadFile(file)

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
    [fileType, uploadProgressContext]
  )

  /**
   * Upload multiple files
   * @param {File[]} files - Files to upload
   * @returns {Promise<Object[]>} Upload results
   */
  const uploadFiles = useCallback(
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
          // Modify uploadFile to accept batchId
          const uploadId = uploadProgressContext
            ? uploadProgressContext.addUpload(file, fileType, batchId)
            : null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 50)
          }

          const result = await ApiClient.uploadFile(file)

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, result)
          }

          results.push({ file, result, success: true })
        } catch (error) {
          if (uploadProgressContext) {
            // Find the upload by file and mark as failed
            const upload = uploadProgressContext.uploads?.find(
              u => u.file === file
            )
            if (upload) {
              uploadProgressContext.failUpload(upload.id, error)
            }
          }
          results.push({ file, error, success: false })
        }
      }

      return results
    },
    [fileType, uploadProgressContext]
  )

  return {
    uploadFile,
    uploadFiles,
  }
}

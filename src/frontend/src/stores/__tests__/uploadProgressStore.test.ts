import { act, renderHook } from '@testing-library/react'
import { useUploadProgressStore } from '@/stores/uploadProgressStore'

// Helper to create a mock File
const createMockFile = (name: string): File => {
  return new File(['test content'], name, { type: 'application/octet-stream' })
}

describe('uploadProgressStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useUploadProgressStore.setState({
      uploads: [],
      batches: [],
      isVisible: false,
    })
  })

  describe('createBatch', () => {
    it('should generate unique batch IDs', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId1: string
      let batchId2: string
      let batchId3: string

      act(() => {
        batchId1 = result.current.createBatch()
        batchId2 = result.current.createBatch()
        batchId3 = result.current.createBatch()
      })

      expect(batchId1!).toBeDefined()
      expect(batchId2!).toBeDefined()
      expect(batchId3!).toBeDefined()
      expect(batchId1!).not.toBe(batchId2!)
      expect(batchId2!).not.toBe(batchId3!)
      expect(batchId1!).not.toBe(batchId3!)
    })

    it('should add batch to batches array', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      act(() => {
        result.current.createBatch()
      })

      expect(result.current.batches).toHaveLength(1)
      expect(result.current.batches[0].files).toHaveLength(0)
      expect(result.current.batches[0].collapsed).toBe(false)
    })
  })

  describe('addUpload', () => {
    it('should add upload to correct batch', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      act(() => {
        batchId = result.current.createBatch()
      })

      const mockFile = createMockFile('test-model.glb')

      act(() => {
        result.current.addUpload(mockFile, 'model', batchId!)
      })

      expect(result.current.uploads).toHaveLength(1)
      expect(result.current.uploads[0].file).toBe(mockFile)
      expect(result.current.uploads[0].batchId).toBe(batchId!)

      // Also check the batch has the file
      const batch = result.current.batches.find(b => b.id === batchId!)
      expect(batch?.files).toHaveLength(1)
      expect(batch?.files[0].file).toBe(mockFile)
    })

    it('should show upload window when adding upload', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      expect(result.current.isVisible).toBe(false)

      const mockFile = createMockFile('test-model.glb')

      act(() => {
        result.current.addUpload(mockFile, 'model')
      })

      expect(result.current.isVisible).toBe(true)
    })

    it('should set initial upload status to pending', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      const mockFile = createMockFile('test-model.glb')

      act(() => {
        result.current.addUpload(mockFile, 'model')
      })

      expect(result.current.uploads[0].status).toBe('pending')
      expect(result.current.uploads[0].progress).toBe(0)
    })
  })

  describe('updateUploadProgress', () => {
    it('should update progress in both uploads array and batches', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      let uploadId: string

      act(() => {
        batchId = result.current.createBatch()
        uploadId = result.current.addUpload(
          createMockFile('test.glb'),
          'model',
          batchId
        )
      })

      act(() => {
        result.current.updateUploadProgress(uploadId!, 50)
      })

      // Check uploads array
      expect(result.current.uploads[0].progress).toBe(50)
      expect(result.current.uploads[0].status).toBe('uploading')

      // Check batches array
      const batch = result.current.batches.find(b => b.id === batchId!)
      expect(batch?.files[0].progress).toBe(50)
      expect(batch?.files[0].status).toBe('uploading')
    })

    it('should change status from pending to uploading', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let uploadId: string

      act(() => {
        uploadId = result.current.addUpload(createMockFile('test.glb'), 'model')
      })

      expect(result.current.uploads[0].status).toBe('pending')

      act(() => {
        result.current.updateUploadProgress(uploadId!, 10)
      })

      expect(result.current.uploads[0].status).toBe('uploading')
    })
  })

  describe('completeUpload', () => {
    it('should transition status to completed with 100% progress', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let uploadId: string

      act(() => {
        uploadId = result.current.addUpload(createMockFile('test.glb'), 'model')
        result.current.updateUploadProgress(uploadId!, 50)
      })

      act(() => {
        result.current.completeUpload(uploadId!)
      })

      expect(result.current.uploads[0].status).toBe('completed')
      expect(result.current.uploads[0].progress).toBe(100)
    })

    it('should store result when provided', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let uploadId: string
      const mockResult = { modelId: 'model-123', name: 'My Model' }

      act(() => {
        uploadId = result.current.addUpload(createMockFile('test.glb'), 'model')
      })

      act(() => {
        result.current.completeUpload(uploadId!, mockResult)
      })

      expect(result.current.uploads[0].result).toEqual(mockResult)
    })

    it('should update both uploads and batches arrays', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      let uploadId: string

      act(() => {
        batchId = result.current.createBatch()
        uploadId = result.current.addUpload(
          createMockFile('test.glb'),
          'model',
          batchId
        )
      })

      act(() => {
        result.current.completeUpload(uploadId!)
      })

      // Check uploads array
      expect(result.current.uploads[0].status).toBe('completed')

      // Check batches array
      const batch = result.current.batches.find(b => b.id === batchId!)
      expect(batch?.files[0].status).toBe('completed')
    })
  })

  describe('failUpload', () => {
    it('should capture error and set status to error', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let uploadId: string
      const mockError = new Error('Upload failed: connection timeout')

      act(() => {
        uploadId = result.current.addUpload(createMockFile('test.glb'), 'model')
      })

      act(() => {
        result.current.failUpload(uploadId!, mockError)
      })

      expect(result.current.uploads[0].status).toBe('error')
      expect(result.current.uploads[0].error).toBe(mockError)
      expect(result.current.uploads[0].error?.message).toBe(
        'Upload failed: connection timeout'
      )
    })

    it('should update both uploads and batches arrays', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      let uploadId: string
      const mockError = new Error('Network error')

      act(() => {
        batchId = result.current.createBatch()
        uploadId = result.current.addUpload(
          createMockFile('test.glb'),
          'model',
          batchId
        )
      })

      act(() => {
        result.current.failUpload(uploadId!, mockError)
      })

      // Check batches array
      const batch = result.current.batches.find(b => b.id === batchId!)
      expect(batch?.files[0].status).toBe('error')
      expect(batch?.files[0].error?.message).toBe('Network error')
    })
  })

  describe('clearCompleted', () => {
    it('should remove only completed and error uploads', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let pendingId: string
      let uploadingId: string
      let completedId: string
      let errorId: string

      act(() => {
        pendingId = result.current.addUpload(
          createMockFile('pending.glb'),
          'model'
        )
        uploadingId = result.current.addUpload(
          createMockFile('uploading.glb'),
          'model'
        )
        completedId = result.current.addUpload(
          createMockFile('completed.glb'),
          'model'
        )
        errorId = result.current.addUpload(createMockFile('error.glb'), 'model')
      })

      // Set different statuses
      act(() => {
        result.current.updateUploadProgress(uploadingId!, 50) // status: uploading
        result.current.completeUpload(completedId!) // status: completed
        result.current.failUpload(errorId!, new Error('fail')) // status: error
      })

      expect(result.current.uploads).toHaveLength(4)

      act(() => {
        result.current.clearCompleted()
      })

      // Only pending and uploading should remain
      expect(result.current.uploads).toHaveLength(2)
      expect(result.current.uploads.map(u => u.id)).toContain(pendingId!)
      expect(result.current.uploads.map(u => u.id)).toContain(uploadingId!)
      expect(result.current.uploads.map(u => u.id)).not.toContain(completedId!)
      expect(result.current.uploads.map(u => u.id)).not.toContain(errorId!)
    })

    it('should also clear from batches and remove empty batches', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId1: string
      let batchId2: string
      let completedId: string
      let pendingId: string

      act(() => {
        // Batch 1 will have only completed file (should be removed)
        batchId1 = result.current.createBatch()
        completedId = result.current.addUpload(
          createMockFile('completed.glb'),
          'model',
          batchId1
        )

        // Batch 2 will have a pending file (should remain)
        batchId2 = result.current.createBatch()
        pendingId = result.current.addUpload(
          createMockFile('pending.glb'),
          'model',
          batchId2
        )
      })

      act(() => {
        result.current.completeUpload(completedId!)
      })

      expect(result.current.batches).toHaveLength(2)

      act(() => {
        result.current.clearCompleted()
      })

      // Only batch2 with pending upload should remain
      expect(result.current.batches).toHaveLength(1)
      expect(result.current.batches[0].id).toBe(batchId2!)
    })
  })

  describe('removeUpload', () => {
    it('should remove the specific upload', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let uploadId1: string
      let uploadId2: string

      act(() => {
        uploadId1 = result.current.addUpload(
          createMockFile('file1.glb'),
          'model'
        )
        uploadId2 = result.current.addUpload(
          createMockFile('file2.glb'),
          'model'
        )
      })

      expect(result.current.uploads).toHaveLength(2)

      act(() => {
        result.current.removeUpload(uploadId1!)
      })

      expect(result.current.uploads).toHaveLength(1)
      expect(result.current.uploads[0].id).toBe(uploadId2!)
    })

    it('should remove empty batches when last upload is removed', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      let uploadId: string

      act(() => {
        batchId = result.current.createBatch()
        uploadId = result.current.addUpload(
          createMockFile('test.glb'),
          'model',
          batchId
        )
      })

      expect(result.current.batches).toHaveLength(1)

      act(() => {
        result.current.removeUpload(uploadId!)
      })

      // Batch should be removed since it's now empty
      expect(result.current.batches).toHaveLength(0)
    })

    it('should keep batch if other uploads remain', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string
      let uploadId1: string
      let uploadId2: string

      act(() => {
        batchId = result.current.createBatch()
        uploadId1 = result.current.addUpload(
          createMockFile('file1.glb'),
          'model',
          batchId
        )
        uploadId2 = result.current.addUpload(
          createMockFile('file2.glb'),
          'model',
          batchId
        )
      })

      act(() => {
        result.current.removeUpload(uploadId1!)
      })

      // Batch should remain with one file
      expect(result.current.batches).toHaveLength(1)
      expect(result.current.batches[0].files).toHaveLength(1)
      expect(result.current.batches[0].files[0].id).toBe(uploadId2!)
    })
  })

  describe('window visibility', () => {
    it('should toggle visibility with showWindow and hideWindow', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      expect(result.current.isVisible).toBe(false)

      act(() => {
        result.current.showWindow()
      })
      expect(result.current.isVisible).toBe(true)

      act(() => {
        result.current.hideWindow()
      })
      expect(result.current.isVisible).toBe(false)
    })
  })

  describe('toggleBatchCollapse', () => {
    it('should toggle collapsed state of a batch', () => {
      const { result } = renderHook(() => useUploadProgressStore())

      let batchId: string

      act(() => {
        batchId = result.current.createBatch()
      })

      expect(result.current.batches[0].collapsed).toBe(false)

      act(() => {
        result.current.toggleBatchCollapse(batchId!)
      })
      expect(result.current.batches[0].collapsed).toBe(true)

      act(() => {
        result.current.toggleBatchCollapse(batchId!)
      })
      expect(result.current.batches[0].collapsed).toBe(false)
    })
  })
})

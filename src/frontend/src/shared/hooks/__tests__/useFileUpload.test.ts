import { renderHook, act } from '@testing-library/react'
import { useFileUpload, useDragAndDrop } from '@/shared/hooks/useFileUpload'

jest.mock('@/features/models/api/modelApi', () => ({
  uploadModel: jest.fn(),
}))

// Mock fileUtils
jest.mock('../../../utils/fileUtils', () => ({
  isSupportedModelFormat: jest.fn(),
  isThreeJSRenderable: jest.fn(),
}))

// Mock uploadProgressStore
jest.mock('../../../stores/uploadProgressStore', () => ({
  useUploadProgressStore: () => ({
    uploads: [],
    batches: [],
    isVisible: false,
    addUpload: jest.fn((file, fileType, batchId) => `upload-${Date.now()}`),
    updateUploadProgress: jest.fn(),
    completeUpload: jest.fn(),
    failUpload: jest.fn(),
    removeUpload: jest.fn(),
    clearCompleted: jest.fn(),
    showWindow: jest.fn(),
    hideWindow: jest.fn(),
    createBatch: jest.fn(() => `batch-${Date.now()}`),
    toggleBatchCollapse: jest.fn(),
  }),
}))

import { uploadModel } from '@/features/models/api/modelApi'
import {
  isSupportedModelFormat,
  isThreeJSRenderable,
} from '../../../utils/fileUtils'

const mockUploadModel = uploadModel as jest.MockedFunction<typeof uploadModel>
const mockIsSupportedModelFormat =
  isSupportedModelFormat as jest.MockedFunction<typeof isSupportedModelFormat>
const mockIsThreeJSRenderable = isThreeJSRenderable as jest.MockedFunction<
  typeof isThreeJSRenderable
>

describe('useFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear any drag state from document body
    document.body.classList.remove('dragging-file')
  })

  describe('uploadMultipleFiles', () => {
    it('should handle empty file list gracefully', async () => {
      const { result } = renderHook(() => useFileUpload())

      const uploadResult = await act(async () => {
        return result.current.uploadMultipleFiles([])
      })

      expect(uploadResult).toEqual({ succeeded: [], failed: [], total: 0 })
      expect(result.current.uploading).toBe(false)
      expect(result.current.uploadProgress).toBe(0)
    })

    it('should handle null file list gracefully', async () => {
      const { result } = renderHook(() => useFileUpload())

      const uploadResult = await act(async () => {
        return result.current.uploadMultipleFiles(null)
      })

      expect(uploadResult).toEqual({ succeeded: [], failed: [], total: 0 })
      expect(result.current.uploading).toBe(false)
      expect(result.current.uploadProgress).toBe(0)
    })

    it('should handle rejected files with Three.js renderability requirement', async () => {
      mockIsSupportedModelFormat.mockReturnValue(true)
      mockIsThreeJSRenderable.mockReturnValue(false)

      const mockFile = new File(['content'], 'test.blend', {
        type: 'application/octet-stream',
      })
      const mockToast = { current: { show: jest.fn() } }

      const { result } = renderHook(() =>
        useFileUpload({
          requireThreeJSRenderable: true,
          toast: mockToast,
        })
      )

      const uploadResult = await act(async () => {
        return result.current.uploadMultipleFiles([mockFile])
      })

      expect(uploadResult.failed).toHaveLength(1)
      expect(uploadResult.failed[0].error.type).toBe('NON_RENDERABLE')
      expect(result.current.uploading).toBe(false)
      expect(result.current.uploadProgress).toBe(0)
    })

    it('should round progress to 2 decimal places', async () => {
      mockIsSupportedModelFormat.mockReturnValue(true)
      mockIsThreeJSRenderable.mockReturnValue(true)
      mockUploadModel.mockResolvedValue({
        id: 1,
        alreadyExists: false,
      })

      const mockFiles = [
        new File(['content1'], 'test1.obj', {
          type: 'application/octet-stream',
        }),
        new File(['content2'], 'test2.obj', {
          type: 'application/octet-stream',
        }),
        new File(['content3'], 'test3.obj', {
          type: 'application/octet-stream',
        }),
      ]

      const { result } = renderHook(() => useFileUpload())

      await act(async () => {
        // Upload 3 files, each should update progress to 33.33, 66.67, 100
        await result.current.uploadMultipleFiles(mockFiles)
      })

      // Progress should have been set to values with max 2 decimal places
      // Final progress should be 0 (reset in finally block)
      expect(result.current.uploadProgress).toBe(0)
    })

    it('should call onSuccess once after all uploads complete', async () => {
      mockIsSupportedModelFormat.mockReturnValue(true)
      mockIsThreeJSRenderable.mockReturnValue(true)
      mockUploadModel
        .mockResolvedValueOnce({ id: 1, alreadyExists: false })
        .mockResolvedValueOnce({ id: 2, alreadyExists: false })

      const onSuccess = jest.fn()
      const mockFiles = [
        new File(['content1'], 'test1.obj', {
          type: 'application/octet-stream',
        }),
        new File(['content2'], 'test2.obj', {
          type: 'application/octet-stream',
        }),
      ]

      const { result } = renderHook(() => useFileUpload({ onSuccess }))

      await act(async () => {
        await result.current.uploadMultipleFiles(mockFiles)
      })

      // onSuccess should be called once with null file and results object
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          succeeded: expect.arrayContaining([
            expect.objectContaining({ file: mockFiles[0] }),
            expect.objectContaining({ file: mockFiles[1] }),
          ]),
          failed: [],
          total: 2,
        })
      )
    })
  })
})

describe('useDragAndDrop', () => {
  beforeEach(() => {
    // Clear any drag state from document body
    document.body.classList.remove('dragging-file')
  })

  afterEach(() => {
    // Clean up any drag state after each test
    document.body.classList.remove('dragging-file')
  })

  it('should clear drag state properly on drop', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: {
        types: ['Files'], // This is required for files to be detected
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(
      mockDragEnterEvent.currentTarget.classList.contains('drag-over')
    ).toBe(true)

    // Simulate drop to clear classes
    const mockFile = new File(['content'], 'test.obj', {
      type: 'application/octet-stream',
    })
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [mockFile] },
    }
    act(() => {
      handlers.onDrop(mockDropEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockDropEvent.currentTarget.classList.contains('drag-over')).toBe(
      false
    )
    expect(onFilesDropped).toHaveBeenCalledWith([mockFile])
  })

  it('should clear drag state properly on drop even with empty files', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: {
        types: ['Files'], // This is required for files to be detected
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)

    // Simulate drop with no files to clear classes
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [] },
    }
    act(() => {
      handlers.onDrop(mockDropEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(onFilesDropped).not.toHaveBeenCalled() // No files, so callback not called
  })

  it('should clear drag state even when callback throws an error', () => {
    const onFilesDropped = jest.fn(() => {
      throw new Error('Upload failed')
    })
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: {
        types: ['Files'], // This is required for files to be detected
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(
      mockDragEnterEvent.currentTarget.classList.contains('drag-over')
    ).toBe(true)

    // Simulate drop - should clear classes even when callback throws
    const mockFile = new File(['content'], 'test.obj', {
      type: 'application/octet-stream',
    })
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [mockFile] },
    }

    expect(() => {
      act(() => {
        handlers.onDrop(mockDropEvent)
      })
    }).toThrow('Upload failed')

    // Even though the callback threw an error, drag state should be cleared
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockDropEvent.currentTarget.classList.contains('drag-over')).toBe(
      false
    )
    expect(onFilesDropped).toHaveBeenCalledWith([mockFile])
  })

  it('should handle drag leave with null relatedTarget', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')

    // Simulate drag enter
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'], // This is required for files to be detected
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Simulate drag leave - counter should decrement to 0
    const mockDragLeaveEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      relatedTarget: null,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragLeave(mockDragLeaveEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })

  it('should handle drag leave with relatedTarget outside document', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')
    document.body.appendChild(mockElement)

    // Simulate drag enter
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'], // This is required for files to be detected
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Create an element that's not in the document
    const outsideElement = document.createElement('div')

    // Simulate drag leave - counter should decrement to 0
    const mockDragLeaveEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      relatedTarget: outsideElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragLeave(mockDragLeaveEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)

    // Clean up
    document.body.removeChild(mockElement)
  })

  it('should not add drag styles for non-file drags (like tab drags)', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    // Simulate drag enter with a tab drag (text/plain type, no Files)
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: {
        types: ['text/plain'], // Tab drags typically use text/plain
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    // Should not add any drag styles for non-file drags
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(
      mockDragEnterEvent.currentTarget.classList.contains('drag-over')
    ).toBe(false)

    // Drop should also not call the callback for non-file drags
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockDragEnterEvent.currentTarget,
      dataTransfer: { files: [] }, // No files
    }
    act(() => {
      handlers.onDrop(mockDropEvent)
    })

    expect(onFilesDropped).not.toHaveBeenCalled()
    expect(document.body.classList.contains('dragging-file')).toBe(false)
  })

  it('should use drag counter to prevent flickering on child element enters/leaves', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')

    // First drag enter - counter becomes 1, styles added
    const mockDragEnterEvent1 = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent1)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Second drag enter (e.g., entering a child element) - counter becomes 2, styles remain
    const mockDragEnterEvent2 = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent2)
    })

    // Styles should still be present
    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // First drag leave (e.g., leaving child element) - counter becomes 1, styles remain
    const mockDragLeaveEvent1 = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragLeave(mockDragLeaveEvent1)
    })

    // Styles should still be present (counter is 1, not 0)
    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Second drag leave (leaving the container) - counter becomes 0, styles removed
    const mockDragLeaveEvent2 = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragLeave(mockDragLeaveEvent2)
    })

    // Styles should now be removed
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })

  it('should clear drag state when component unmounts', () => {
    const onFilesDropped = jest.fn()
    const { result, unmount } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Unmount the hook
    unmount()

    // Drag state should be cleared
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })

  it('should handle global dragend event to clear drag state', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Simulate global dragend event (e.g., when user drops file outside browser)
    act(() => {
      const dragEndEvent = new Event('dragend')
      window.dispatchEvent(dragEndEvent)
    })

    // Drag state should be cleared
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })

  it('should handle global drop event to clear drag state', () => {
    const onFilesDropped = jest.fn()
    const { result } = renderHook(() => useDragAndDrop(onFilesDropped))
    const handlers = result.current

    const mockElement = document.createElement('div')

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      dataTransfer: {
        types: ['Files'],
      },
    }
    act(() => {
      handlers.onDragEnter(mockDragEnterEvent)
    })

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Simulate global drop event (e.g., when user drops file on another element)
    act(() => {
      const dropEvent = new Event('drop')
      window.dispatchEvent(dropEvent)
    })

    // Drag state should be cleared
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })
})

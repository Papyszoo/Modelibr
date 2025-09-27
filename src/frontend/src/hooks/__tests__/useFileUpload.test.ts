import { renderHook, act } from '@testing-library/react'
import { useFileUpload, useDragAndDrop } from '../useFileUpload'

// Mock ApiClient
jest.mock('../../services/ApiClient', () => ({
  uploadModel: jest.fn(),
}))

// Mock fileUtils
jest.mock('../../utils/fileUtils', () => ({
  isSupportedModelFormat: jest.fn(),
  isThreeJSRenderable: jest.fn(),
}))

import ApiClient from '../../services/ApiClient'
import { isSupportedModelFormat, isThreeJSRenderable } from '../../utils/fileUtils'

const mockApiClient = ApiClient as jest.Mocked<typeof ApiClient>
const mockIsSupportedModelFormat = isSupportedModelFormat as jest.MockedFunction<typeof isSupportedModelFormat>
const mockIsThreeJSRenderable = isThreeJSRenderable as jest.MockedFunction<typeof isThreeJSRenderable>

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

      const mockFile = new File(['content'], 'test.blend', { type: 'application/octet-stream' })
      const mockToast = { current: { show: jest.fn() } }

      const { result } = renderHook(() => 
        useFileUpload({ 
          requireThreeJSRenderable: true,
          toast: mockToast 
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
  })
})

describe('useDragAndDrop', () => {
  beforeEach(() => {
    // Clear any drag state from document body
    document.body.classList.remove('dragging-file')
  })

  it('should clear drag state properly on drop', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockDragEnterEvent.currentTarget.classList.contains('drag-over')).toBe(true)

    // Simulate drop to clear classes
    const mockFile = new File(['content'], 'test.obj', { type: 'application/octet-stream' })
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [mockFile] },
    }
    handlers.onDrop(mockDropEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockDropEvent.currentTarget.classList.contains('drag-over')).toBe(false)
    expect(onFilesDropped).toHaveBeenCalledWith([mockFile])
  })

  it('should clear drag state properly on drop even with empty files', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)

    // Simulate drop with no files to clear classes
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [] },
    }
    handlers.onDrop(mockDropEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(onFilesDropped).toHaveBeenCalledWith([])
  })

  it('should clear drag state even when callback throws an error', () => {
    const onFilesDropped = jest.fn(() => {
      throw new Error('Upload failed')
    })
    const handlers = useDragAndDrop(onFilesDropped)

    // Simulate drag enter to add classes
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockDragEnterEvent.currentTarget.classList.contains('drag-over')).toBe(true)

    // Simulate drop - should clear classes even when callback throws
    const mockFile = new File(['content'], 'test.obj', { type: 'application/octet-stream' })
    const mockDropEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: document.createElement('div'),
      dataTransfer: { files: [mockFile] },
    }
    
    expect(() => handlers.onDrop(mockDropEvent)).toThrow('Upload failed')
    
    // Even though the callback threw an error, drag state should be cleared
    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockDropEvent.currentTarget.classList.contains('drag-over')).toBe(false)
    expect(onFilesDropped).toHaveBeenCalledWith([mockFile])
  })

  it('should maintain drag state during dragover after drag enter', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockElement = document.createElement('div')
    
    // Simulate drag enter
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Simulate drag over - should maintain state
    const mockDragOverEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
    }
    handlers.onDragOver(mockDragOverEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)
  })

  it('should handle drag leave with null relatedTarget', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockElement = document.createElement('div')
    
    // Simulate drag enter
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Simulate drag leave with null relatedTarget (common in drop scenarios)
    const mockDragLeaveEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      relatedTarget: null,
    }
    handlers.onDragLeave(mockDragLeaveEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)
  })

  it('should handle drag leave with relatedTarget outside document', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockElement = document.createElement('div')
    document.body.appendChild(mockElement)
    
    // Simulate drag enter
    const mockDragEnterEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
    }
    handlers.onDragEnter(mockDragEnterEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(true)
    expect(mockElement.classList.contains('drag-over')).toBe(true)

    // Create an element that's not in the document
    const outsideElement = document.createElement('div')
    
    // Simulate drag leave with relatedTarget outside document
    const mockDragLeaveEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      currentTarget: mockElement,
      relatedTarget: outsideElement,
    }
    handlers.onDragLeave(mockDragLeaveEvent)

    expect(document.body.classList.contains('dragging-file')).toBe(false)
    expect(mockElement.classList.contains('drag-over')).toBe(false)

    // Clean up
    document.body.removeChild(mockElement)
  })
})
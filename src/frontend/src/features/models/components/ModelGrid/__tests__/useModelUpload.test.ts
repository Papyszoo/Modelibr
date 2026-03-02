import { act, renderHook } from '@testing-library/react'

// Mock blenderEnabledStore — control blenderEnabled value
let mockBlenderEnabled = false
jest.mock('@/stores/blenderEnabledStore', () => ({
  useBlenderEnabledStore: (
    selector: (state: { blenderEnabled: boolean }) => boolean
  ) => selector({ blenderEnabled: mockBlenderEnabled }),
}))

// Mock pack/project APIs
jest.mock('@/features/pack/api/packApi', () => ({
  addModelToPack: jest.fn(),
}))

jest.mock('@/features/project/api/projectApi', () => ({
  addModelToProject: jest.fn(),
}))

// Mock useFileUpload
const mockUploadMultipleFiles = jest.fn()
jest.mock('@/shared/hooks/useFileUpload', () => ({
  useFileUpload: () => ({
    uploading: false,
    uploadProgress: 0,
    uploadMultipleFiles: mockUploadMultipleFiles,
  }),
  useDragAndDrop: (callback: (files: File[]) => void) => ({
    onDrop: (e: {
      preventDefault: () => void
      stopPropagation: () => void
      dataTransfer: { files: File[] }
    }) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.files.length > 0) {
        callback(Array.from(e.dataTransfer.files))
      }
    },
    onDragOver: jest.fn(),
    onDragEnter: jest.fn(),
    onDragLeave: jest.fn(),
  }),
}))

import { useModelUpload } from '../useModelUpload'

describe('useModelUpload', () => {
  const mockToast = { current: { show: jest.fn() } } as any
  const mockOnUploadComplete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockBlenderEnabled = false
  })

  const renderUploadHook = (opts?: { packId?: number; projectId?: number }) =>
    renderHook(() =>
      useModelUpload({
        packId: opts?.packId,
        projectId: opts?.projectId,
        toast: mockToast,
        onUploadComplete: mockOnUploadComplete,
      })
    )

  describe('.blend filtering based on blenderEnabled', () => {
    it('should filter out .blend files when blenderEnabled is false', () => {
      mockBlenderEnabled = false
      const { result } = renderUploadHook()

      const blendFile = new File(['data'], 'model.blend', {
        type: 'application/octet-stream',
      })
      const objFile = new File(['data'], 'model.obj', {
        type: 'application/octet-stream',
      })

      act(() => {
        result.current.uploadMultipleFiles([blendFile, objFile])
      })

      // Should only pass the .obj file through (blend filtered out)
      expect(mockUploadMultipleFiles).toHaveBeenCalledWith([objFile])
    })

    it('should allow .blend files when blenderEnabled is true', () => {
      mockBlenderEnabled = true
      const { result } = renderUploadHook()

      const blendFile = new File(['data'], 'model.blend', {
        type: 'application/octet-stream',
      })
      const objFile = new File(['data'], 'model.obj', {
        type: 'application/octet-stream',
      })

      act(() => {
        result.current.uploadMultipleFiles([blendFile, objFile])
      })

      // Both files should pass through
      expect(mockUploadMultipleFiles).toHaveBeenCalledWith([blendFile, objFile])
    })

    it('should not call uploadMultipleFiles when only .blend files dropped and blenderEnabled is false', () => {
      mockBlenderEnabled = false
      const { result } = renderUploadHook()

      const blendFile = new File(['data'], 'model.blend', {
        type: 'application/octet-stream',
      })

      act(() => {
        result.current.uploadMultipleFiles([blendFile])
      })

      // Should not call the underlying upload since all files were filtered out
      expect(mockUploadMultipleFiles).not.toHaveBeenCalled()
    })

    it('should handle case-insensitive .BLEND extensions', () => {
      mockBlenderEnabled = false
      const { result } = renderUploadHook()

      const blendFile = new File(['data'], 'model.BLEND', {
        type: 'application/octet-stream',
      })

      act(() => {
        result.current.uploadMultipleFiles([blendFile])
      })

      // .BLEND should also be filtered out
      expect(mockUploadMultipleFiles).not.toHaveBeenCalled()
    })

    it('should pass all .blend files when blenderEnabled is true', () => {
      mockBlenderEnabled = true
      const { result } = renderUploadHook()

      const blend1 = new File(['data1'], 'a.blend', {
        type: 'application/octet-stream',
      })
      const blend2 = new File(['data2'], 'b.blend', {
        type: 'application/octet-stream',
      })

      act(() => {
        result.current.uploadMultipleFiles([blend1, blend2])
      })

      expect(mockUploadMultipleFiles).toHaveBeenCalledWith([blend1, blend2])
    })
  })
})

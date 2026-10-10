import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { type ReactElement } from 'react'

// Mock blenderEnabledStore - control blenderEnabled value
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
const mockUploadFolder = jest.fn()
const mockUploadZip = jest.fn()
let mockLastUploadOptions: {
  onSuccess?: (
    file: unknown,
    results: {
      succeeded: { file?: { name?: string }; result: unknown }[]
    }
  ) => Promise<void>
}
jest.mock('@/shared/hooks/useFileUpload', () => ({
  useFileUpload: (options: unknown) => {
    mockLastUploadOptions = options as typeof mockLastUploadOptions
    return {
      uploading: false,
      uploadProgress: 0,
      uploadMultipleFiles: mockUploadMultipleFiles,
      uploadFolder: mockUploadFolder,
      uploadZip: mockUploadZip,
    }
  },
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

  // Regression: useModelUpload must re-expose the multi-file glTF entry points from
  // useFileUpload. They were originally omitted from the destructure/return, so the
  // folder/zip toolbar buttons called `undefined` and crashed the grid at runtime
  // ("uploadFolder is not a function"). The buttons are wired to exactly these.
  describe('multi-file glTF import passthrough', () => {
    it('exposes uploadFolder and uploadZip from useFileUpload', () => {
      const { result } = renderUploadHook()

      expect(typeof result.current.uploadFolder).toBe('function')
      expect(typeof result.current.uploadZip).toBe('function')

      // Both are wrapped to carry the Blender gate (below), so assert delegation
      // rather than identity.
      result.current.uploadFolder([])
      expect(mockUploadFolder).toHaveBeenCalled()
      result.current.uploadZip(new File(['z'], 'kit.zip'))
      expect(mockUploadZip).toHaveBeenCalled()
    })

    // Regression: uploadFolder was passed straight through, so a picked folder
    // bypassed the renderability/.blend gates the file picker applies - .blend files
    // reached the backend with Blender disabled, and .dae/.3ds always did.
    it('refuses .blend primaries in a folder import when Blender is disabled', () => {
      mockBlenderEnabled = false
      const { result } = renderUploadHook()

      result.current.uploadFolder([])

      expect(mockUploadFolder).toHaveBeenCalledWith([], { allowBlend: false })
    })

    it('allows .blend primaries in a folder import when Blender is enabled', () => {
      mockBlenderEnabled = true
      const { result } = renderUploadHook()

      result.current.uploadFolder([])

      expect(mockUploadFolder).toHaveBeenCalledWith([], { allowBlend: true })
    })

    // A zip is expanded client-side and imported like a folder, so it must carry the
    // same gate. The old server-side unzip route applied no client gate at all.
    it('carries the Blender gate into a zip import', () => {
      mockBlenderEnabled = false
      const { result } = renderUploadHook()
      const zip = new File(['z'], 'kit.zip')

      result.current.uploadZip(zip)

      expect(mockUploadZip).toHaveBeenCalledWith(zip, { allowBlend: false })
    })
  })

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

  // Regression: a re-upload the backend deduped to an existing asset reported a
  // plain "completed" and gave no hint the file already existed.
  describe('deduped uploads', () => {
    it('reports an existing asset with an Open action, without auto-opening it', async () => {
      const onOpenModel = jest.fn()
      renderHook(() =>
        useModelUpload({
          toast: mockToast,
          onUploadComplete: mockOnUploadComplete,
          onOpenModel,
        })
      )

      await act(async () => {
        await mockLastUploadOptions.onSuccess?.(null, {
          succeeded: [
            {
              file: { name: 'chair.glb' },
              result: { id: 7, alreadyExists: true },
            },
          ],
        })
      })

      const shown = mockToast.current.show.mock.calls.at(-1)?.[0] as {
        summary: string
        content?: () => ReactElement
      }
      expect(shown.summary).toBe('Already in your library')

      // The user chooses whether to open it - the tab must not steal focus.
      expect(onOpenModel).not.toHaveBeenCalled()
      expect(mockOnUploadComplete).toHaveBeenCalled()

      // The toast's Open action opens the existing asset.
      render(shown.content?.() as ReactElement)
      fireEvent.click(screen.getByTestId('duplicate-upload-open'))
      expect(onOpenModel).toHaveBeenCalledWith(7)
    })

    it('stays quiet for a genuinely new upload', async () => {
      renderHook(() =>
        useModelUpload({
          toast: mockToast,
          onUploadComplete: mockOnUploadComplete,
        })
      )

      await act(async () => {
        await mockLastUploadOptions.onSuccess?.(null, {
          succeeded: [
            {
              file: { name: 'new.glb' },
              result: { id: 8, alreadyExists: false },
            },
          ],
        })
      })

      expect(mockToast.current.show).not.toHaveBeenCalled()
    })
  })
})

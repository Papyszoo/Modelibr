import { act, renderHook } from '@testing-library/react'

import { type ModelVersionDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

import { useFileUploadHandlers } from '../useFileUploadHandlers'

let mockBlenderEnabled = true

jest.mock('@/stores/blenderEnabledStore', () => ({
  useBlenderEnabledStore: (
    selector: (state: { blenderEnabled: boolean }) => boolean
  ) => selector({ blenderEnabled: mockBlenderEnabled }),
}))

// Mock the API
const mockCreateModelVersion = jest.fn()
const mockAddFileToVersion = jest.fn()
jest.mock('@/features/model-viewer/api/modelVersionApi', () => ({
  createModelVersion: (...args: unknown[]) => mockCreateModelVersion(...args),
  addFileToVersion: (...args: unknown[]) => mockAddFileToVersion(...args),
}))

function makeModel(id = '10'): Model {
  return {
    id,
    name: 'Test Model',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    files: [],
  } as Model
}

function makeVersion(overrides?: Partial<ModelVersionDto>): ModelVersionDto {
  return {
    id: 1,
    versionNumber: 1,
    description: '',
    createdAt: '2024-01-01T00:00:00Z',
    isActive: true,
    files: [],
    defaultTextureSetId: null,
    ...overrides,
  } as ModelVersionDto
}

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    model: makeModel(),
    versions: [makeVersion()],
    selectedVersion: makeVersion(),
    onSuccess: jest.fn().mockResolvedValue(undefined),
    showToast: jest.fn(),
    refetchVersions: jest.fn().mockResolvedValue({ data: [] }),
    ...overrides,
  }
}

describe('useFileUploadHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBlenderEnabled = true
  })

  it('should start with no drag state and modal hidden', () => {
    const { result } = renderHook(() => useFileUploadHandlers(makeDeps()))

    expect(result.current.dragOver).toBe(false)
    expect(result.current.uploadModalVisible).toBe(false)
    expect(result.current.droppedFile).toBeNull()
  })

  it('should set dragOver on dragOver event', () => {
    const { result } = renderHook(() => useFileUploadHandlers(makeDeps()))

    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as React.DragEvent

    act(() => {
      result.current.handleDragOver(event)
    })

    expect(result.current.dragOver).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('should clear dragOver on dragLeave event', () => {
    const { result } = renderHook(() => useFileUploadHandlers(makeDeps()))

    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as React.DragEvent

    act(() => {
      result.current.handleDragOver(event)
    })
    expect(result.current.dragOver).toBe(true)

    act(() => {
      result.current.handleDragLeave(event)
    })
    expect(result.current.dragOver).toBe(false)
  })

  it('should open upload modal when a file is dropped', () => {
    const { result } = renderHook(() => useFileUploadHandlers(makeDeps()))

    const file = new File(['data'], 'model.glb', {
      type: 'model/gltf-binary',
    })
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent

    act(() => {
      result.current.handleDrop(event)
    })

    expect(result.current.dragOver).toBe(false)
    expect(result.current.uploadModalVisible).toBe(true)
    expect(result.current.droppedFile).toBe(file)
  })

  it('should hide modal and clear file on hideUploadModal', () => {
    const { result } = renderHook(() => useFileUploadHandlers(makeDeps()))

    // Drop a file first
    const file = new File(['data'], 'test.obj')
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent

    act(() => {
      result.current.handleDrop(event)
    })
    expect(result.current.uploadModalVisible).toBe(true)

    act(() => {
      result.current.hideUploadModal()
    })

    expect(result.current.uploadModalVisible).toBe(false)
    expect(result.current.droppedFile).toBeNull()
  })

  it('should call createModelVersion when action is "new"', async () => {
    mockCreateModelVersion.mockResolvedValue({ id: 5, versionNumber: 2 })
    const deps = makeDeps()

    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'model.glb')

    await act(async () => {
      await result.current.handleFileUpload(
        file,
        'new',
        'New ver',
        undefined,
        true
      )
    })

    expect(mockCreateModelVersion).toHaveBeenCalledWith(
      10,
      file,
      'New ver',
      true
    )
    expect(deps.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' })
    )
    expect(deps.onSuccess).toHaveBeenCalled()
  })

  it('should call addFileToVersion when action is "current" and versions exist', async () => {
    mockAddFileToVersion.mockResolvedValue({})
    const version = makeVersion({ id: 7 })
    const deps = makeDeps({
      versions: [version],
      selectedVersion: version,
    })

    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'extra.fbx')

    await act(async () => {
      await result.current.handleFileUpload(file, 'current')
    })

    expect(mockAddFileToVersion).toHaveBeenCalledWith(10, 7, file)
    expect(deps.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' })
    )
  })

  it('should show error toast on upload failure', async () => {
    mockCreateModelVersion.mockRejectedValue(new Error('Upload failed!'))
    const deps = makeDeps()

    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'bad.glb')

    await expect(
      act(async () => {
        await result.current.handleFileUpload(file, 'new')
      })
    ).rejects.toThrow('Upload failed!')

    expect(deps.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'Upload failed!',
      })
    )
  })

  it('should not upload when model is null', async () => {
    const deps = makeDeps({ model: null })
    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'test.obj')

    await act(async () => {
      await result.current.handleFileUpload(file, 'new')
    })

    expect(mockCreateModelVersion).not.toHaveBeenCalled()
    expect(mockAddFileToVersion).not.toHaveBeenCalled()
  })

  it('should refetch and use latest version when versions are empty and action is "current"', async () => {
    const latestVersion = makeVersion({ id: 99 })
    const deps = makeDeps({
      versions: [],
      selectedVersion: null,
      refetchVersions: jest.fn().mockResolvedValue({ data: [latestVersion] }),
    })
    mockAddFileToVersion.mockResolvedValue({})

    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'model.obj')

    await act(async () => {
      await result.current.handleFileUpload(file, 'current')
    })

    expect(deps.refetchVersions).toHaveBeenCalled()
    expect(mockAddFileToVersion).toHaveBeenCalledWith(10, 99, file)
  })

  it('should create new version if refetch returns empty and action is "current"', async () => {
    const deps = makeDeps({
      versions: [],
      selectedVersion: null,
      refetchVersions: jest.fn().mockResolvedValue({ data: [] }),
    })
    mockCreateModelVersion.mockResolvedValue({ id: 1, versionNumber: 1 })

    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'first.glb')

    await act(async () => {
      await result.current.handleFileUpload(file, 'current')
    })

    expect(mockCreateModelVersion).toHaveBeenCalledWith(
      10,
      file,
      undefined,
      true
    )
  })

  it('should reject dropped .blend files when Blender is disabled', () => {
    mockBlenderEnabled = false
    const deps = makeDeps()
    const { result } = renderHook(() => useFileUploadHandlers(deps))

    const file = new File(['data'], 'model.blend')
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent

    act(() => {
      result.current.handleDrop(event)
    })

    expect(result.current.uploadModalVisible).toBe(false)
    expect(deps.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn' })
    )
  })

  it('should reject direct .blend uploads when Blender is disabled', async () => {
    mockBlenderEnabled = false
    const deps = makeDeps()
    const { result } = renderHook(() => useFileUploadHandlers(deps))
    const file = new File(['data'], 'model.blend')

    await act(async () => {
      await result.current.handleFileUpload(file, 'new')
    })

    expect(mockCreateModelVersion).not.toHaveBeenCalled()
    expect(deps.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn' })
    )
  })
})

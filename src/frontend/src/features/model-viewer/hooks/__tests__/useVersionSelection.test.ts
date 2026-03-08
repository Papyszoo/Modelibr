import { act, renderHook } from '@testing-library/react'

import { type ModelVersionDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

import { useVersionSelection } from '../useVersionSelection'

// Minimal model fixture
function makeModel(overrides?: Partial<Model>): Model {
  return {
    id: '42',
    name: 'Test Model',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    files: [],
    ...overrides,
  } as Model
}

// Minimal version fixture
function makeVersion(overrides?: Partial<ModelVersionDto>): ModelVersionDto {
  return {
    id: 1,
    modelId: 1,
    versionNumber: 1,
    description: '',
    createdAt: '2024-01-01T00:00:00Z',
    files: [],
    ...overrides,
  } as ModelVersionDto
}

describe('useVersionSelection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should return null state when model is null', () => {
    const versions: ModelVersionDto[] = []
    const { result } = renderHook(() => useVersionSelection(null, versions))

    expect(result.current.selectedVersion).toBeNull()
    expect(result.current.versionModel).toBeNull()
    expect(result.current.defaultFileId).toBeNull()
    expect(result.current.selectedTextureSetId).toBeNull()
  })

  it('should auto-select the active version when versions load', () => {
    const model = makeModel({ activeVersionId: 2 })
    const versions = [
      makeVersion({ id: 1, versionNumber: 1 }),
      makeVersion({ id: 2, versionNumber: 2 }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.selectedVersion?.id).toBe(2)
  })

  it('should fall back to last version when no active version matches', () => {
    const model = makeModel({ activeVersionId: 999 })
    const versions = [
      makeVersion({ id: 1, versionNumber: 1 }),
      makeVersion({ id: 2, versionNumber: 2 }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.selectedVersion?.id).toBe(2)
  })

  it('should clear selection when versions become empty', () => {
    const model = makeModel()
    const initialVersions = [makeVersion({ id: 1 })]
    const emptyVersions: ModelVersionDto[] = []

    const { result, rerender } = renderHook(
      ({ versions }) => useVersionSelection(model, versions),
      { initialProps: { versions: initialVersions } }
    )

    expect(result.current.selectedVersion?.id).toBe(1)

    rerender({ versions: emptyVersions })

    expect(result.current.selectedVersion).toBeNull()
    expect(result.current.versionModel).toBeNull()
  })

  it('should create a versionModel with mapped files from the selected version', () => {
    const model = makeModel()
    const versions = [
      makeVersion({
        id: 1,
        files: [
          {
            id: 100,
            originalFileName: 'model.glb',
            mimeType: 'model/gltf-binary',
            sizeBytes: 1024,
            fileType: 'Model3D',
            isRenderable: true,
          },
        ] as ModelVersionDto['files'],
      }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.versionModel).not.toBeNull()
    expect(result.current.versionModel?.files).toHaveLength(1)
    expect(result.current.versionModel?.files[0].originalFileName).toBe(
      'model.glb'
    )
  })

  it('should auto-select first renderable file', () => {
    const model = makeModel()
    const versions = [
      makeVersion({
        id: 1,
        files: [
          {
            id: 50,
            originalFileName: 'texture.png',
            mimeType: 'image/png',
            sizeBytes: 512,
            fileType: 'Texture',
            isRenderable: false,
          },
          {
            id: 51,
            originalFileName: 'model.glb',
            mimeType: 'model/gltf-binary',
            sizeBytes: 2048,
            fileType: 'Model3D',
            isRenderable: true,
          },
        ] as ModelVersionDto['files'],
      }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.defaultFileId).toBe(51)
  })

  it('should apply version defaultTextureSetId when version is selected', () => {
    const model = makeModel()
    const versions = [
      makeVersion({
        id: 1,
        defaultTextureSetId: 77,
      }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.selectedTextureSetId).toBe(77)
  })

  it('should clear texture set when selecting version with no default', () => {
    const model = makeModel()
    const v2 = makeVersion({ id: 2, defaultTextureSetId: undefined })
    const versions = [makeVersion({ id: 1, defaultTextureSetId: 77 }), v2]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    // Manually select v2 which has no default texture set
    act(() => {
      result.current.handleVersionSelect(v2)
    })

    expect(result.current.selectedTextureSetId).toBeNull()
  })

  it('should load default file from localStorage', () => {
    localStorage.setItem('model-42-default-file', '123')
    const model = makeModel()
    const versions: ModelVersionDto[] = []

    const { result } = renderHook(() => useVersionSelection(model, versions))

    expect(result.current.defaultFileId).toBe(123)
  })

  it('should save default file to localStorage on change', () => {
    const model = makeModel()
    const versions = [
      makeVersion({
        id: 1,
        files: [
          {
            id: 200,
            originalFileName: 'mesh.obj',
            mimeType: 'model/obj',
            sizeBytes: 100,
            fileType: 'Model3D',
            isRenderable: true,
          },
        ] as ModelVersionDto['files'],
      }),
    ]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    act(() => {
      result.current.handleDefaultFileChange(200)
    })

    expect(localStorage.getItem('model-42-default-file')).toBe('200')
    expect(result.current.defaultFileId).toBe(200)
  })

  it('should handle manual texture set selection', () => {
    const model = makeModel()
    const versions = [makeVersion({ id: 1 })]

    const { result } = renderHook(() => useVersionSelection(model, versions))

    act(() => {
      result.current.handleTextureSetSelect(55)
    })

    expect(result.current.selectedTextureSetId).toBe(55)

    act(() => {
      result.current.handleTextureSetSelect(null)
    })

    expect(result.current.selectedTextureSetId).toBeNull()
  })
})

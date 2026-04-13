import {
  formatInferredEnvironmentMapSizeLabel,
  getDroppedCubeFaceFiles,
  prepareEnvironmentMapUploadItems,
} from '@/features/environment-map/utils/environmentMapUploadUtils'
import {
  getEnvironmentMapPreviewOptions,
  getEnvironmentMapPrimaryPreviewUrl,
  getEnvironmentMapSizeLabels,
} from '@/features/environment-map/utils/environmentMapUtils'

jest.mock('@/features/models/api/modelApi', () => ({
  getFileUrl: (fileId: string) => `/files/${fileId}`,
}))

jest.mock('@/lib/apiBase', () => ({
  resolveApiAssetUrl: (url: string | null | undefined) => url ?? null,
}))

describe('environmentMapUtils', () => {
  it('groups complete cube face uploads and preserves single files', () => {
    const files = [
      new File(['px'], 'studio_px.hdr'),
      new File(['nx'], 'studio_nx.hdr'),
      new File(['py'], 'studio_py.hdr'),
      new File(['ny'], 'studio_ny.hdr'),
      new File(['pz'], 'studio_pz.hdr'),
      new File(['nz'], 'studio_nz.hdr'),
      new File(['single'], 'sunset.hdr'),
    ]

    const items = prepareEnvironmentMapUploadItems(files)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      kind: 'cube',
      name: 'studio',
    })
    expect(items[0].cubeFaces?.px?.name).toBe('studio_px.hdr')
    expect(items[1]).toMatchObject({
      kind: 'single',
      name: 'sunset',
    })
  })

  it('treats incomplete cube face sets as single uploads', () => {
    const files = [
      new File(['px'], 'forest_px.hdr'),
      new File(['nx'], 'forest_nx.hdr'),
      new File(['py'], 'forest_py.hdr'),
    ]

    const items = prepareEnvironmentMapUploadItems(files)

    expect(items).toHaveLength(3)
    expect(items.every(item => item.kind === 'single')).toBe(true)
  })

  it('maps dropped cube faces by filename token', () => {
    const droppedCubeFaces = getDroppedCubeFaceFiles([
      new File(['px'], 'studio_px.hdr'),
      new File(['ny'], 'studio_ny.hdr'),
      new File(['ignore'], 'notes.txt'),
    ])

    expect(droppedCubeFaces.px?.name).toBe('studio_px.hdr')
    expect(droppedCubeFaces.ny?.name).toBe('studio_ny.hdr')
    expect(droppedCubeFaces.nz).toBeUndefined()
  })

  it('formats inferred size labels for standard and custom resolutions', () => {
    expect(formatInferredEnvironmentMapSizeLabel(1024)).toBe('1K')
    expect(formatInferredEnvironmentMapSizeLabel(4096)).toBe('4K')
    expect(formatInferredEnvironmentMapSizeLabel(3000)).toBe('3000px')
  })

  it('builds preview options for cube sources and prefers custom thumbnails', () => {
    const previewOptions = getEnvironmentMapPreviewOptions({
      id: 1,
      name: 'Studio',
      variantCount: 1,
      previewVariantId: 10,
      previewFileId: 100,
      previewUrl: '/preview.jpg',
      customThumbnailUrl: '/custom-thumb.jpg',
      sourceType: 'cube',
      projectionType: 'cube',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      variants: [
        {
          id: 10,
          sizeLabel: '4K',
          fileId: 100,
          fileName: 'studio_px.hdr',
          fileSizeBytes: 1,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          isDeleted: false,
          sourceType: 'cube',
          projectionType: 'cube',
          cubeFaceUrls: {
            px: '/px.hdr',
            nx: '/nx.hdr',
            py: '/py.hdr',
            ny: '/ny.hdr',
            pz: '/pz.hdr',
            nz: '/nz.hdr',
          },
        },
      ],
      packs: [],
      projects: [],
    })

    expect(previewOptions[0]).toMatchObject({
      label: '4K',
      sourceType: 'Cube',
      projectionType: 'Cube',
    })
    expect(previewOptions[0].cubeFaceUrls?.px).toBe('/px.hdr')
    expect(
      getEnvironmentMapPrimaryPreviewUrl({
        id: 1,
        name: 'Studio',
        variantCount: 0,
        customThumbnailUrl: '/custom-thumb.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      })
    ).toBe('/custom-thumb.jpg')
  })

  it('collects filterable size labels from all variants', () => {
    expect(
      getEnvironmentMapSizeLabels({
        id: 7,
        name: 'Atrium',
        variantCount: 3,
        previewSizeLabel: '1K',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        variants: [
          {
            id: 71,
            sizeLabel: '2k',
            fileName: 'atrium-2k.hdr',
            fileSizeBytes: 1,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            isDeleted: false,
          },
          {
            id: 72,
            sizeLabel: '4096',
            fileName: 'atrium-4k.hdr',
            fileSizeBytes: 1,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            isDeleted: false,
          },
          {
            id: 73,
            sizeLabel: '1K',
            fileName: 'atrium-1k.hdr',
            fileSizeBytes: 1,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            isDeleted: false,
          },
        ],
      })
    ).toEqual(['4K', '2K', '1K'])
  })
})

import { http, HttpResponse } from 'msw'

// In demo mode, the baseURL is '__DEMO_MSW__' which is a sentinel value.
// MSW intercepts all requests to this base. We match relative paths via the
// Axios client which prepends baseURL. For robustness, we match with a wildcard prefix.

const DEMO_BASE = import.meta.env.BASE_URL ?? '/Modelibr/demo/'
const assetUrl = (file: string) => `${DEMO_BASE}demo-assets/${file}`
const thumbnailUrl = (file: string) =>
  `${DEMO_BASE}demo-assets/thumbnails/${file}`

// ─── Mock Data ──────────────────────────────────────────────────────────

const mockModels = [
  {
    id: '1',
    name: 'Test Cube',
    description: 'A simple cube model for testing',
    tags: 'test,cube,basic',
    files: [
      {
        id: '101',
        originalFileName: 'test-cube.glb',
        storedFileName: 'test-cube.glb',
        filePath: 'test-cube.glb',
        mimeType: 'model/gltf-binary',
        sizeBytes: 1024,
        sha256Hash: 'abc123',
        fileType: 'glb',
        isRenderable: true,
        createdAt: '2025-01-15T10:00:00Z',
        updatedAt: '2025-01-15T10:00:00Z',
      },
    ],
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    activeVersionId: 1,
    defaultTextureSetId: null,
    textureSets: [],
    packs: [{ id: 1, name: 'Demo Pack' }],
  },
  {
    id: '2',
    name: 'Test Cone',
    description: 'A cone model exported as FBX',
    tags: 'test,cone,fbx',
    files: [
      {
        id: '102',
        originalFileName: 'test-cone.fbx',
        storedFileName: 'test-cone.fbx',
        filePath: 'test-cone.fbx',
        mimeType: 'application/octet-stream',
        sizeBytes: 2048,
        sha256Hash: 'def456',
        fileType: 'fbx',
        isRenderable: true,
        createdAt: '2025-01-16T10:00:00Z',
        updatedAt: '2025-01-16T10:00:00Z',
      },
    ],
    createdAt: '2025-01-16T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
    activeVersionId: 2,
    defaultTextureSetId: null,
    textureSets: [],
    packs: [],
  },
  {
    id: '3',
    name: 'Test Cylinder',
    description: 'A cylinder shape',
    tags: 'test,cylinder',
    files: [
      {
        id: '103',
        originalFileName: 'test-cylinder.fbx',
        storedFileName: 'test-cylinder.fbx',
        filePath: 'test-cylinder.fbx',
        mimeType: 'application/octet-stream',
        sizeBytes: 1536,
        sha256Hash: 'ghi789',
        fileType: 'fbx',
        isRenderable: true,
        createdAt: '2025-01-17T10:00:00Z',
        updatedAt: '2025-01-17T10:00:00Z',
      },
    ],
    createdAt: '2025-01-17T10:00:00Z',
    updatedAt: '2025-01-17T10:00:00Z',
    activeVersionId: 3,
    defaultTextureSetId: null,
    textureSets: [{ id: 1, name: 'Basic Texture Set' }],
    packs: [{ id: 1, name: 'Demo Pack' }],
  },
  {
    id: '4',
    name: 'Test Icosphere',
    description: 'An icosphere model',
    tags: 'test,icosphere',
    files: [
      {
        id: '104',
        originalFileName: 'test-icosphere.fbx',
        storedFileName: 'test-icosphere.fbx',
        filePath: 'test-icosphere.fbx',
        mimeType: 'application/octet-stream',
        sizeBytes: 3072,
        sha256Hash: 'jkl012',
        fileType: 'fbx',
        isRenderable: true,
        createdAt: '2025-01-18T10:00:00Z',
        updatedAt: '2025-01-18T10:00:00Z',
      },
    ],
    createdAt: '2025-01-18T10:00:00Z',
    updatedAt: '2025-01-18T10:00:00Z',
    activeVersionId: 4,
    defaultTextureSetId: null,
    textureSets: [],
    packs: [],
  },
  {
    id: '5',
    name: 'Test Torus',
    description: 'A torus model',
    tags: 'test,torus',
    files: [
      {
        id: '105',
        originalFileName: 'test-torus.fbx',
        storedFileName: 'test-torus.fbx',
        filePath: 'test-torus.fbx',
        mimeType: 'application/octet-stream',
        sizeBytes: 4096,
        sha256Hash: 'mno345',
        fileType: 'fbx',
        isRenderable: true,
        createdAt: '2025-01-19T10:00:00Z',
        updatedAt: '2025-01-19T10:00:00Z',
      },
    ],
    createdAt: '2025-01-19T10:00:00Z',
    updatedAt: '2025-01-19T10:00:00Z',
    activeVersionId: 5,
    defaultTextureSetId: 2,
    textureSets: [{ id: 2, name: 'Color Textures' }],
    packs: [{ id: 2, name: 'Shapes Pack' }],
  },
]

const modelVersions: Record<string, object[]> = {
  '1': [
    {
      id: 1,
      modelId: 1,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: '2025-01-15T10:00:00Z',
      defaultTextureSetId: null,
      thumbnailUrl: thumbnailUrl('test-cube.png'),
      pngThumbnailUrl: thumbnailUrl('test-cube.png'),
      files: [
        {
          id: 101,
          originalFileName: 'test-cube.glb',
          mimeType: 'model/gltf-binary',
          fileType: 'glb',
          sizeBytes: 1024,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
  ],
  '2': [
    {
      id: 2,
      modelId: 2,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: '2025-01-16T10:00:00Z',
      defaultTextureSetId: null,
      thumbnailUrl: thumbnailUrl('test-cone.png'),
      pngThumbnailUrl: thumbnailUrl('test-cone.png'),
      files: [
        {
          id: 102,
          originalFileName: 'test-cone.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 2048,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
  ],
  '3': [
    {
      id: 3,
      modelId: 3,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: '2025-01-17T10:00:00Z',
      defaultTextureSetId: null,
      thumbnailUrl: thumbnailUrl('test-cylinder.png'),
      pngThumbnailUrl: thumbnailUrl('test-cylinder.png'),
      files: [
        {
          id: 103,
          originalFileName: 'test-cylinder.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 1536,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [1],
    },
  ],
  '4': [
    {
      id: 4,
      modelId: 4,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: '2025-01-18T10:00:00Z',
      defaultTextureSetId: null,
      thumbnailUrl: thumbnailUrl('test-icosphere.png'),
      pngThumbnailUrl: thumbnailUrl('test-icosphere.png'),
      files: [
        {
          id: 104,
          originalFileName: 'test-icosphere.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 3072,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
  ],
  '5': [
    {
      id: 5,
      modelId: 5,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: '2025-01-19T10:00:00Z',
      defaultTextureSetId: 2,
      thumbnailUrl: thumbnailUrl('test-torus.png'),
      pngThumbnailUrl: thumbnailUrl('test-torus.png'),
      files: [
        {
          id: 105,
          originalFileName: 'test-torus.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 4096,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [
        {
          materialName: 'Material',
          textureSetId: 2,
          variantName: 'Default',
        },
      ],
      textureSetIds: [2],
    },
  ],
}

// Map file IDs to actual asset file paths for serving
const fileIdToAsset: Record<string, string> = {
  '101': 'test-cube.glb',
  '102': 'test-cone.fbx',
  '103': 'test-cylinder.fbx',
  '104': 'test-icosphere.fbx',
  '105': 'test-torus.fbx',
  // Texture files
  '201': 'texture.png',
  '202': 'texture_albedo.png',
  '203': 'texture_blue.png',
  '204': 'texture_orm.png',
  '205': 'red_color.png',
  '206': 'blue_color.png',
  '207': 'green_color.png',
  '208': 'black_color.png',
  '209': 'pink_color.png',
  '210': 'yellow_color.png',
  // Global texture files
  '301': 'global texture/diffuse.jpg',
  '302': 'global texture/normal.exr',
  '303': 'global texture/roughness.exr',
  '304': 'global texture/displacement.png',
  // Sprite files
  '401': 'texture.png',
  '402': 'texture_albedo.png',
  // Sound files
  '501': 'test-tone.wav',
}

const mockTextureSets = [
  {
    id: 1,
    name: 'Basic Texture Set',
    kind: 0, // ModelSpecific
    tilingScaleX: 1.0,
    tilingScaleY: 1.0,
    uvMappingMode: 0,
    uvScale: 1.0,
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    textureCount: 2,
    isEmpty: false,
    thumbnailPath: null,
    pngThumbnailPath: null,
    textures: [
      {
        id: 1,
        textureType: 1, // Albedo
        sourceChannel: 5, // RGB
        fileId: 202,
        fileName: 'texture_albedo.png',
        createdAt: '2025-01-15T10:00:00Z',
        proxies: [],
      },
      {
        id: 2,
        textureType: 2, // Normal
        sourceChannel: 5, // RGB
        fileId: 201,
        fileName: 'texture.png',
        createdAt: '2025-01-15T10:00:00Z',
        proxies: [],
      },
    ],
    associatedModels: [
      {
        id: 3,
        name: 'Test Cylinder',
        versionNumber: 1,
        modelVersionId: 3,
        materialName: 'Material',
      },
    ],
    packs: [],
  },
  {
    id: 2,
    name: 'Color Textures',
    kind: 0, // ModelSpecific
    tilingScaleX: 1.0,
    tilingScaleY: 1.0,
    uvMappingMode: 0,
    uvScale: 1.0,
    createdAt: '2025-01-16T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
    textureCount: 3,
    isEmpty: false,
    thumbnailPath: null,
    pngThumbnailPath: null,
    textures: [
      {
        id: 3,
        textureType: 1, // Albedo
        sourceChannel: 5,
        fileId: 205,
        fileName: 'red_color.png',
        createdAt: '2025-01-16T10:00:00Z',
        proxies: [],
      },
      {
        id: 4,
        textureType: 5, // Roughness
        sourceChannel: 5,
        fileId: 204,
        fileName: 'texture_orm.png',
        createdAt: '2025-01-16T10:00:00Z',
        proxies: [],
      },
      {
        id: 5,
        textureType: 6, // Metallic
        sourceChannel: 5,
        fileId: 203,
        fileName: 'texture_blue.png',
        createdAt: '2025-01-16T10:00:00Z',
        proxies: [],
      },
    ],
    associatedModels: [
      {
        id: 5,
        name: 'Test Torus',
        versionNumber: 1,
        modelVersionId: 5,
        materialName: 'Material',
      },
    ],
    packs: [{ id: 2, name: 'Shapes Pack' }],
  },
  {
    id: 3,
    name: 'Global Stone Material',
    kind: 1, // Universal (Global Material)
    tilingScaleX: 2.0,
    tilingScaleY: 2.0,
    uvMappingMode: 0,
    uvScale: 1.0,
    previewGeometryType: 'sphere',
    createdAt: '2025-01-17T10:00:00Z',
    updatedAt: '2025-01-17T10:00:00Z',
    textureCount: 4,
    isEmpty: false,
    thumbnailPath: '/texture-sets/3/thumbnail/file',
    pngThumbnailPath: '/texture-sets/3/thumbnail/file',
    textures: [
      {
        id: 6,
        textureType: 1, // Albedo / Diffuse
        sourceChannel: 5,
        fileId: 301,
        fileName: 'diffuse.jpg',
        createdAt: '2025-01-17T10:00:00Z',
        proxies: [],
      },
      {
        id: 7,
        textureType: 2, // Normal
        sourceChannel: 5,
        fileId: 302,
        fileName: 'normal.exr',
        createdAt: '2025-01-17T10:00:00Z',
        proxies: [],
      },
      {
        id: 8,
        textureType: 5, // Roughness
        sourceChannel: 5,
        fileId: 303,
        fileName: 'roughness.exr',
        createdAt: '2025-01-17T10:00:00Z',
        proxies: [],
      },
      {
        id: 9,
        textureType: 12, // Displacement
        sourceChannel: 5,
        fileId: 304,
        fileName: 'displacement.png',
        createdAt: '2025-01-17T10:00:00Z',
        proxies: [],
      },
    ],
    associatedModels: [],
    packs: [],
  },
]

const mockSprites = [
  {
    id: 1,
    name: 'Demo Sprite',
    fileId: 401,
    spriteType: 0,
    categoryId: null,
    categoryName: null,
    fileName: 'texture.png',
    fileSizeBytes: 5120,
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 2,
    name: 'Albedo Sprite',
    fileId: 402,
    spriteType: 0,
    categoryId: 1,
    categoryName: 'UI Elements',
    fileName: 'texture_albedo.png',
    fileSizeBytes: 3072,
    createdAt: '2025-01-16T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
  },
]

const mockSounds = [
  {
    id: 1,
    name: 'Test Tone',
    fileId: 501,
    categoryId: null,
    categoryName: null,
    duration: 2000,
    peaks: null,
    fileName: 'test-tone.wav',
    fileSizeBytes: 88200,
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    waveformUrl: null,
  },
]

const mockPacks = [
  {
    id: 1,
    name: 'Demo Pack',
    description: 'A sample pack with various assets',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    modelCount: 2,
    textureSetCount: 0,
    spriteCount: 0,
    soundCount: 0,
    isEmpty: false,
    models: [
      { id: 1, name: 'Test Cube' },
      { id: 3, name: 'Test Cylinder' },
    ],
    textureSets: [],
    sprites: [],
  },
  {
    id: 2,
    name: 'Shapes Pack',
    description: 'Collection of basic 3D shapes',
    createdAt: '2025-01-16T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
    modelCount: 1,
    textureSetCount: 1,
    spriteCount: 0,
    soundCount: 0,
    isEmpty: false,
    models: [{ id: 5, name: 'Test Torus' }],
    textureSets: [{ id: 2, name: 'Color Textures' }],
    sprites: [],
  },
]

const mockProjects = [
  {
    id: 1,
    name: 'Demo Project',
    description: 'A demo project showcasing Modelibr',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
    modelCount: 3,
    textureSetCount: 1,
    spriteCount: 1,
    soundCount: 1,
    isEmpty: false,
    models: [
      { id: 1, name: 'Test Cube' },
      { id: 2, name: 'Test Cone' },
      { id: 4, name: 'Test Icosphere' },
    ],
    textureSets: [{ id: 1, name: 'Basic Texture Set' }],
    sprites: [{ id: 1, name: 'Demo Sprite' }],
  },
]

const mockSpriteCategories = [
  {
    id: 1,
    name: 'UI Elements',
    description: 'User interface sprites',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
  },
]

const mockSoundCategories = [
  {
    id: 1,
    name: 'Sound Effects',
    description: 'Game sound effects',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
  },
]

// ─── Pagination Helper ──────────────────────────────────────────────────

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    totalCount: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  }
}

// ─── Demo Toast message for write operations ────────────────────────────

function demoWriteResponse(message = 'This action is disabled in the demo.') {
  return HttpResponse.json({ error: message }, { status: 403 })
}

// ─── Handlers ───────────────────────────────────────────────────────────

export const demoHandlers = [
  // ── Models (paginated) ────────────────────────────────────────────────
  http.get('*/models', ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const textureSetId = url.searchParams.get('textureSetId')

    let filtered = [...mockModels]
    if (packId) {
      filtered = filtered.filter(m =>
        m.packs?.some(p => p.id === Number(packId))
      )
    }
    if (projectId) {
      // Return models from project
      const project = mockProjects.find(p => p.id === Number(projectId))
      if (project) {
        const modelIds = new Set(project.models.map(m => m.id))
        filtered = filtered.filter(m => modelIds.has(Number(m.id)))
      }
    }
    if (textureSetId) {
      filtered = filtered.filter(m =>
        m.textureSets?.some(ts => ts.id === Number(textureSetId))
      )
    }

    // If page param is present, return paginated format
    if (url.searchParams.has('page')) {
      const result = paginate(filtered, page, pageSize)
      return HttpResponse.json({
        items: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }

    // Otherwise return array
    return HttpResponse.json(filtered)
  }),

  // Single model
  http.get('*/models/:id', ({ params }) => {
    const model = mockModels.find(m => m.id === String(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(model)
  }),

  // Model file serving (redirect to static asset)
  http.get('*/models/:id/file', ({ params }) => {
    const model = mockModels.find(m => m.id === String(params.id))
    if (!model || !model.files[0])
      return new HttpResponse(null, { status: 404 })
    const fileName = fileIdToAsset[model.files[0].id]
    if (!fileName) return new HttpResponse(null, { status: 404 })
    return HttpResponse.redirect(assetUrl(fileName))
  }),

  // Model versions
  http.get('*/models/:modelId/versions', ({ params }) => {
    const versions = modelVersions[String(params.modelId)] ?? []
    return HttpResponse.json({ versions })
  }),

  // Model thumbnail status
  http.get('*/models/:id/thumbnail', ({ params }) => {
    return HttpResponse.json({
      status: 'Ready',
      fileUrl: thumbnailUrl(
        `test-${
          mockModels
            .find(m => m.id === String(params.id))
            ?.name.toLowerCase()
            .replace('test ', '') ?? 'cube'
        }.png`
      ),
      sizeBytes: 4096,
      width: 256,
      height: 256,
      createdAt: '2025-01-15T10:00:00Z',
      processedAt: '2025-01-15T10:01:00Z',
    })
  }),

  // Model thumbnail file (redirect to static thumbnail)
  http.get('*/models/:id/thumbnail/file', ({ params }) => {
    const model = mockModels.find(m => m.id === String(params.id))
    const name = model?.name.toLowerCase().replace('test ', '') ?? 'cube'
    return HttpResponse.redirect(thumbnailUrl(`test-${name}.png`))
  }),

  // Model version thumbnail
  http.get('*/model-versions/:id/thumbnail', () => {
    return HttpResponse.json({
      status: 'Ready',
      sizeBytes: 4096,
      width: 256,
      height: 256,
    })
  }),

  http.get('*/model-versions/:id/thumbnail/file', ({ params }) => {
    const versionId = String(params.id)
    // Find which model this version belongs to
    for (const [modelId, versions] of Object.entries(modelVersions)) {
      const v = versions.find(
        ver => String((ver as { id: number }).id) === versionId
      )
      if (v) {
        const model = mockModels.find(m => m.id === modelId)
        const name = model?.name.toLowerCase().replace('test ', '') ?? 'cube'
        return HttpResponse.redirect(thumbnailUrl(`test-${name}.png`))
      }
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Model version file URL
  http.get('*/model-versions/:versionId/files/:fileId', ({ params }) => {
    const fileName = fileIdToAsset[String(params.fileId)]
    if (!fileName) return new HttpResponse(null, { status: 404 })
    return HttpResponse.redirect(assetUrl(fileName))
  }),

  // ── Files ─────────────────────────────────────────────────────────────
  http.get('*/files/:id', ({ params }) => {
    const fileName = fileIdToAsset[String(params.id)]
    if (!fileName) return new HttpResponse(null, { status: 404 })
    return HttpResponse.redirect(assetUrl(fileName))
  }),

  http.get('*/files/:id/preview', ({ params }) => {
    const fileName = fileIdToAsset[String(params.id)]
    if (!fileName) return new HttpResponse(null, { status: 404 })
    return HttpResponse.redirect(assetUrl(fileName))
  }),

  // ── Texture Sets ──────────────────────────────────────────────────────
  http.get('*/texture-sets', ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const kind = url.searchParams.get('kind')

    let filtered = [...mockTextureSets]
    if (packId) {
      filtered = filtered.filter(ts =>
        ts.packs?.some(p => p.id === Number(packId))
      )
    }
    if (projectId) {
      const project = mockProjects.find(p => p.id === Number(projectId))
      if (project) {
        const tsIds = new Set(project.textureSets.map(ts => ts.id))
        filtered = filtered.filter(ts => tsIds.has(ts.id))
      }
    }
    if (kind !== null && kind !== undefined) {
      filtered = filtered.filter(ts => ts.kind === Number(kind))
    }

    if (url.searchParams.has('page')) {
      const result = paginate(filtered, page, pageSize)
      return HttpResponse.json({
        textureSets: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }

    return HttpResponse.json({ textureSets: filtered })
  }),

  http.get('*/texture-sets/:id', ({ params }) => {
    const ts = mockTextureSets.find(t => t.id === Number(params.id))
    if (!ts) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(ts)
  }),

  http.get('*/texture-sets/by-file/:fileId', () => {
    return HttpResponse.json({ textureSetId: null })
  }),

  // Texture set thumbnail (for global materials)
  http.get('*/texture-sets/:id/thumbnail/file', () => {
    return HttpResponse.redirect(thumbnailUrl('global-material.png'))
  }),

  // ── Sprites ───────────────────────────────────────────────────────────
  http.get('*/sprites', ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')

    if (url.searchParams.has('page')) {
      const result = paginate(mockSprites, page, pageSize)
      return HttpResponse.json({
        sprites: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }

    return HttpResponse.json({ sprites: mockSprites })
  }),

  http.get('*/sprites/:id', ({ params }) => {
    const sprite = mockSprites.find(s => s.id === Number(params.id))
    if (!sprite) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(sprite)
  }),

  http.get('*/sprite-categories', () => {
    return HttpResponse.json({ categories: mockSpriteCategories })
  }),

  // ── Sounds ────────────────────────────────────────────────────────────
  http.get('*/sounds', ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')

    if (url.searchParams.has('page')) {
      const result = paginate(mockSounds, page, pageSize)
      return HttpResponse.json({
        sounds: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }

    return HttpResponse.json({ sounds: mockSounds })
  }),

  http.get('*/sounds/:id', ({ params }) => {
    const sound = mockSounds.find(s => s.id === Number(params.id))
    if (!sound) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(sound)
  }),

  // Sound audio file
  http.get('*/sounds/:id/file', () => {
    return HttpResponse.redirect(assetUrl('test-tone.wav'))
  }),

  // Sound waveform
  http.get('*/sounds/:id/waveform', () => {
    return new HttpResponse(null, { status: 404 })
  }),

  http.get('*/sound-categories', () => {
    return HttpResponse.json({ categories: mockSoundCategories })
  }),

  // ── Packs ─────────────────────────────────────────────────────────────
  http.get('*/packs', () => {
    return HttpResponse.json({ packs: mockPacks })
  }),

  http.get('*/packs/:id', ({ params }) => {
    const pack = mockPacks.find(p => p.id === Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(pack)
  }),

  // ── Projects ──────────────────────────────────────────────────────────
  http.get('*/projects', () => {
    return HttpResponse.json({ projects: mockProjects })
  }),

  http.get('*/projects/:id', ({ params }) => {
    const project = mockProjects.find(p => p.id === Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(project)
  }),

  // ── Stages ────────────────────────────────────────────────────────────
  http.get('*/stages', () => {
    return HttpResponse.json({ stages: [] })
  }),

  // ── Settings ──────────────────────────────────────────────────────────
  http.get('*/settings', () => {
    return HttpResponse.json({
      maxFileSizeBytes: 104857600,
      maxThumbnailSizeBytes: 10485760,
      thumbnailFrameCount: 30,
      thumbnailCameraVerticalAngle: 25,
      thumbnailWidth: 256,
      thumbnailHeight: 256,
      generateThumbnailOnUpload: true,
      textureProxySize: 512,
      blenderPath: 'blender',
      blenderEnabled: false,
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
    })
  }),

  http.get('*/settings/blender-enabled', () => {
    return HttpResponse.json({
      enableBlender: false,
      blenderPath: 'blender',
      settingEnabled: false,
      installed: false,
      installedVersion: null,
    })
  }),

  http.get('*/settings/blender/versions', () => {
    return HttpResponse.json({
      versions: [
        { version: '5.1.0', label: 'Blender 5.1.0', isLts: false },
        { version: '5.0.0', label: 'Blender 5.0.0', isLts: false },
        { version: '4.4.3', label: 'Blender 4.4.3', isLts: false },
        { version: '4.2.9', label: 'Blender 4.2.9 LTS', isLts: true },
        { version: '3.6.16', label: 'Blender 3.6.16 LTS', isLts: true },
      ],
      isOffline: false,
    })
  }),

  http.get('*/settings/blender/status', () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: null,
    })
  }),

  http.post('*/settings/blender/install', () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: 'Not available in demo mode',
    })
  }),

  http.post('*/settings/blender/uninstall', () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: null,
    })
  }),

  // ── Recycled Files ────────────────────────────────────────────────────
  http.get('*/recycled', () => {
    return HttpResponse.json({
      models: [],
      modelVersions: [],
      files: [],
      textureSets: [],
      textures: [],
      sprites: [],
      sounds: [],
    })
  }),

  // ── Batch Uploads History ─────────────────────────────────────────────
  http.get('*/batch-uploads/history', () => {
    return HttpResponse.json({ uploads: [] })
  }),

  // ── Write Operations (all return demo-disabled message) ───────────────

  // Model uploads
  http.post('*/models', () => demoWriteResponse()),
  http.post('*/models/*/thumbnail/regenerate', () => demoWriteResponse()),
  http.put('*/models/*', () => demoWriteResponse()),
  http.delete('*/models/*', () => demoWriteResponse()),

  // File uploads
  http.post('*/files', () => demoWriteResponse()),

  // Version management
  http.post('*/models/*/versions', () => demoWriteResponse()),
  http.put('*/model-versions/*', () => demoWriteResponse()),
  http.delete('*/model-versions/*', () => demoWriteResponse()),

  // Texture set writes
  http.post('*/texture-sets', () => demoWriteResponse()),
  http.post('*/texture-sets/with-file', () => demoWriteResponse()),
  http.put('*/texture-sets/*', () => demoWriteResponse()),
  http.delete('*/texture-sets/*', () => demoWriteResponse()),
  http.post('*/texture-sets/*/textures', () => demoWriteResponse()),
  http.post('*/texture-sets/*/thumbnail/regenerate', () => demoWriteResponse()),

  // Pack writes
  http.post('*/packs', () => demoWriteResponse()),
  http.put('*/packs/*', () => demoWriteResponse()),
  http.delete('*/packs/*', () => demoWriteResponse()),

  // Project writes
  http.post('*/projects', () => demoWriteResponse()),
  http.put('*/projects/*', () => demoWriteResponse()),
  http.delete('*/projects/*', () => demoWriteResponse()),

  // Sprite writes
  http.post('*/sprites/with-file', () => demoWriteResponse()),
  http.put('*/sprites/*', () => demoWriteResponse()),
  http.delete('*/sprites/*', () => demoWriteResponse()),

  // Sound writes
  http.post('*/sounds/with-file', () => demoWriteResponse()),
  http.put('*/sounds/*', () => demoWriteResponse()),
  http.delete('*/sounds/*', () => demoWriteResponse()),

  // Category writes
  http.post('*/sprite-categories', () => demoWriteResponse()),
  http.put('*/sprite-categories/*', () => demoWriteResponse()),
  http.delete('*/sprite-categories/*', () => demoWriteResponse()),
  http.post('*/sound-categories', () => demoWriteResponse()),
  http.put('*/sound-categories/*', () => demoWriteResponse()),
  http.delete('*/sound-categories/*', () => demoWriteResponse()),

  // Settings writes
  http.put('*/settings', () => demoWriteResponse()),

  // Stage writes
  http.post('*/stages', () => demoWriteResponse()),
  http.put('*/stages/*', () => demoWriteResponse()),

  // Recycled file operations
  http.post('*/recycled/*', () => demoWriteResponse()),
  http.delete('*/recycled/*', () => demoWriteResponse()),

  // Batch uploads
  http.post('*/batch-uploads/*', () => demoWriteResponse()),
]

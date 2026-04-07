import { http, HttpResponse } from 'msw'

const BASE_URL = 'http://localhost:8080'

// Reusable mock data factories
const createModel = (id: number, name: string) => ({
  id: String(id),
  name,
  description: `Description for ${name}`,
  tags: ['test'],
  categoryId: null,
  category: null,
  categoryPath: null,
  conceptImages: [],
  conceptImageCount: 0,
  hasConceptImages: false,
  technicalMetadata: {
    latestVersionId: id,
    latestVersionNumber: 1,
    triangleCount: 1200,
    vertexCount: 700,
    meshCount: 1,
    materialCount: 1,
    updatedAt: '2025-01-15T10:00:00Z',
  },
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
  isRecycled: false,
  versions: [],
})

const createPack = (id: number, name: string) => ({
  id,
  name,
  description: `${name} description`,
  licenseType: 'Royalty Free',
  url: `https://example.com/${id}`,
  customThumbnailUrl: null,
  modelCount: 0,
  textureSetCount: 0,
  spriteCount: 0,
  soundCount: 0,
  isEmpty: true,
  models: [],
  textureSets: [],
  sprites: [],
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
})

const createProject = (id: number, name: string) => ({
  id,
  name,
  description: `${name} description`,
  notes: 'Demo project notes',
  customThumbnailUrl: null,
  conceptImageCount: 0,
  conceptImages: [],
  modelCount: 0,
  textureSetCount: 0,
  spriteCount: 0,
  soundCount: 0,
  isEmpty: true,
  models: [],
  textureSets: [],
  sprites: [],
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
})

const createSound = (id: number, name: string) => ({
  id,
  name,
  originalFileName: `${name}.wav`,
  sizeBytes: 1024000,
  durationMs: 5000,
  categoryId: null,
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
  isRecycled: false,
})

const createTextureSet = (id: number, name: string) => ({
  id,
  name,
  kind: 'Universal',
  textures: [],
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
  isRecycled: false,
})

const createModelVersion = (
  id: number,
  versionNumber: number,
  modelId: number
) => ({
  id,
  modelId,
  versionNumber,
  description: `Version ${versionNumber}`,
  isActive: versionNumber === 1,
  createdAt: '2025-01-15T10:00:00Z',
  files: [
    {
      id: id * 10,
      originalFileName: `model_v${versionNumber}.glb`,
      fileType: 'glb',
      sizeBytes: 2048000,
      isRenderable: true,
    },
  ],
})

// Default mock data
const mockModels = Array.from({ length: 12 }, (_, i) =>
  createModel(i + 1, `Model ${i + 1}`)
)
const mockPacks = [createPack(1, 'Characters'), createPack(2, 'Environments')]
const mockProjects = [
  createProject(1, 'Game Alpha'),
  createProject(2, 'Game Beta'),
]
const mockSounds = Array.from({ length: 6 }, (_, i) =>
  createSound(i + 1, `Sound ${i + 1}`)
)
const mockTextureSets = Array.from({ length: 4 }, (_, i) =>
  createTextureSet(i + 1, `Texture Set ${i + 1}`)
)
const mockModelCategories = [
  {
    id: 1,
    name: 'Environment',
    description: 'Environment',
    parentId: null,
    path: 'Environment',
  },
  {
    id: 2,
    name: 'Props',
    description: 'Props',
    parentId: 1,
    path: 'Environment / Props',
  },
]

export const handlers = [
  // Models (paginated)
  http.get(`${BASE_URL}/models`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const start = (page - 1) * pageSize
    const items = mockModels.slice(start, start + pageSize)
    return HttpResponse.json({
      items,
      totalCount: mockModels.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockModels.length / pageSize),
    })
  }),

  // Single model
  http.get(`${BASE_URL}/models/:id`, ({ params }) => {
    const model = mockModels.find(m => m.id === String(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(model)
  }),

  http.get(`${BASE_URL}/model-categories`, () => {
    return HttpResponse.json({ categories: mockModelCategories })
  }),

  http.get(`${BASE_URL}/model-tags`, () => {
    const tags = [...new Set(mockModels.flatMap(model => model.tags ?? []))]
      .sort((left, right) => left.localeCompare(right))
      .map(name => ({ name }))

    return HttpResponse.json({ tags })
  }),

  http.post(`${BASE_URL}/models/:id/concept-images`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${BASE_URL}/models/:id/concept-images/:fileId`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Model versions
  http.get(`${BASE_URL}/models/:modelId/versions`, ({ params }) => {
    const modelId = Number(params.modelId)
    return HttpResponse.json([
      createModelVersion(1, 1, modelId),
      createModelVersion(2, 2, modelId),
    ])
  }),

  // Model thumbnail
  http.get(`${BASE_URL}/models/:id/thumbnail`, () => {
    return new HttpResponse(null, { status: 404 })
  }),

  // Packs
  http.get(`${BASE_URL}/packs`, () => {
    return HttpResponse.json({ packs: mockPacks })
  }),

  http.get(`${BASE_URL}/packs/:id`, ({ params }) => {
    const pack = mockPacks.find(item => item.id === Number(params.id))
    return pack
      ? HttpResponse.json(pack)
      : new HttpResponse(null, { status: 404 })
  }),

  http.put(`${BASE_URL}/packs/:id/thumbnail`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Projects
  http.get(`${BASE_URL}/projects`, () => {
    return HttpResponse.json({ projects: mockProjects })
  }),

  http.get(`${BASE_URL}/projects/:id`, ({ params }) => {
    const project = mockProjects.find(item => item.id === Number(params.id))
    return project
      ? HttpResponse.json(project)
      : new HttpResponse(null, { status: 404 })
  }),

  http.put(`${BASE_URL}/projects/:id/thumbnail`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${BASE_URL}/projects/:id/concept-images`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${BASE_URL}/projects/:id/concept-images/:fileId`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Sounds (paginated)
  http.get(`${BASE_URL}/sounds`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const start = (page - 1) * pageSize
    const items = mockSounds.slice(start, start + pageSize)
    return HttpResponse.json({
      sounds: items,
      totalCount: mockSounds.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockSounds.length / pageSize),
    })
  }),

  // Sound categories
  http.get(`${BASE_URL}/sound-categories`, () => {
    return HttpResponse.json({ categories: [] })
  }),

  // Sprites (paginated)
  http.get(`${BASE_URL}/sprites`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    return HttpResponse.json({
      sprites: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    })
  }),

  // Sprite categories
  http.get(`${BASE_URL}/sprite-categories`, () => {
    return HttpResponse.json({ categories: [] })
  }),

  // Texture sets (paginated)
  http.get(`${BASE_URL}/texture-sets`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const start = (page - 1) * pageSize
    const items = mockTextureSets.slice(start, start + pageSize)
    return HttpResponse.json({
      items,
      totalCount: mockTextureSets.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockTextureSets.length / pageSize),
    })
  }),

  // Stages
  http.get(`${BASE_URL}/stages`, () => {
    return HttpResponse.json([])
  }),

  // Settings / theme
  http.get(`${BASE_URL}/settings/theme`, () => {
    return HttpResponse.json({ theme: 'dark' })
  }),
]

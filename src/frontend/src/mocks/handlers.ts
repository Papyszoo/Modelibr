import { http, HttpResponse } from 'msw'

const BASE_URL = 'http://localhost:8080'

// Reusable mock data factories
const createModel = (id: number, name: string) => ({
  id: String(id),
  name,
  description: `Description for ${name}`,
  tags: ['test'],
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
  isRecycled: false,
  versions: [],
})

const createPack = (id: number, name: string) => ({
  id,
  name,
  description: `${name} description`,
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
})

const createProject = (id: number, name: string) => ({
  id,
  name,
  description: `${name} description`,
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
    return HttpResponse.json(mockPacks)
  }),

  // Projects
  http.get(`${BASE_URL}/projects`, () => {
    return HttpResponse.json(mockProjects)
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
    })
  }),

  // Sound categories
  http.get(`${BASE_URL}/sounds/categories`, () => {
    return HttpResponse.json({ categories: [] })
  }),

  // Sprites (paginated)
  http.get(`${BASE_URL}/sprites`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    return HttpResponse.json({
      items: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    })
  }),

  // Sprite categories
  http.get(`${BASE_URL}/sprites/categories`, () => {
    return HttpResponse.json([])
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

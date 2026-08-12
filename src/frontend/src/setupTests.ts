import '@testing-library/jest-dom'

// Mock Vite environment variables for Jest (import.meta.env -> process.env)
process.env.VITE_API_BASE_URL = 'http://localhost:8080'
process.env.VITE_STORE_URL = 'https://store.test'
process.env.DEV = 'true'
process.env.PROD = 'false'
process.env.MODE = 'test'

// Mock services that use import.meta.env at module level
jest.mock('@/lib/apiBase', () => {
  const makeMockClient = () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })

  const mockClient = makeMockClient()

  class MockApiClientError extends Error {
    status?: number
    code?: string
    details?: unknown
    requestId?: string
    requestConfig?: unknown
    isNetworkError = false
    isTimeout = false
    isOffline = false

    // Mirrors the real constructor so tests can build errors with status/
    // isNetworkError/etc. and code under test can branch on them.
    constructor(message: string, normalized: Record<string, unknown> = {}) {
      super(message)
      this.name = 'ApiClientError'
      Object.assign(this, normalized)
    }
  }

  return {
    __esModule: true,
    client: mockClient,
    // Each call gets a fresh mock instance - modules that build their own
    // client (e.g. the asset-store feature) export it for tests to grab.
    createApiClient: jest.fn(() => makeMockClient()),
    baseURL: 'http://localhost:8080',
    UPLOAD_TIMEOUT: 120000,
    ApiClientError: MockApiClientError,
  }
})

// storeEnv reads import.meta at module scope (Jest can't parse it) - back
// the asset-store feature's env read with process.env instead.
jest.mock('@/features/asset-store/lib/storeEnv', () => ({
  readStoreUrlEnv: () => process.env.VITE_STORE_URL,
}))

jest.mock('./services/ApiClient', () => ({
  __esModule: true,
  apiClient: {
    getBaseURL: jest.fn(() => 'http://localhost:8080'),
    uploadModel: jest.fn(),
    uploadFile: jest.fn(),
    getModels: jest.fn().mockResolvedValue([]),
    getModelById: jest.fn(),
    getModelFileUrl: jest.fn(
      (modelId: string) => `http://localhost:8080/models/${modelId}/file`
    ),
    getFileUrl: jest.fn(
      (fileId: string) => `http://localhost:8080/files/${fileId}`
    ),
    getThumbnailStatus: jest.fn(),
    getThumbnailUrl: jest.fn(
      (modelId: string) =>
        `http://localhost:8080/models/${modelId}/thumbnail/file`
    ),
    getThumbnailFile: jest.fn(),
    regenerateThumbnail: jest.fn(),
    getAllTextureSets: jest.fn().mockResolvedValue([]),
    getTextureSetById: jest.fn(),
    createTextureSet: jest.fn(),
    updateTextureSet: jest.fn(),
    deleteTextureSet: jest.fn(),
    addTextureToSetEndpoint: jest.fn(),
    removeTextureFromSet: jest.fn(),
    changeTextureType: jest.fn(),
    changeTextureChannel: jest.fn(),
    associateTextureSetWithModelVersion: jest.fn(),
    disassociateTextureSetFromModelVersion: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    updateModelTags: jest.fn(),
    getAllPacks: jest.fn().mockResolvedValue([]),
    getPackById: jest.fn(),
    createPack: jest.fn(),
    updatePack: jest.fn(),
    deletePack: jest.fn(),
    addModelToPack: jest.fn(),
    removeModelFromPack: jest.fn(),
    addTextureSetToPack: jest.fn(),
    removeTextureSetFromPack: jest.fn(),
    getAllProjects: jest.fn().mockResolvedValue([]),
    getProjectById: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    addModelToProject: jest.fn(),
    removeModelFromProject: jest.fn(),
    addTextureSetToProject: jest.fn(),
    removeTextureSetFromProject: jest.fn(),
    getAllSprites: jest.fn().mockResolvedValue([]),
    createSprite: jest.fn(),
    updateSprite: jest.fn(),
    deleteSprite: jest.fn(),
    getRecycledFiles: jest.fn().mockResolvedValue([]),
    restoreRecycledFile: jest.fn(),
  },
}))

jest.mock('./services/ThumbnailSignalRService', () => ({
  __esModule: true,
  thumbnailSignalRService: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    joinAllModelsGroup: jest.fn(),
    leaveAllModelsGroup: jest.fn(),
    joinAllEnvironmentMapsGroup: jest.fn(),
    leaveAllEnvironmentMapsGroup: jest.fn(),
    joinModelVersionGroup: jest.fn(),
    leaveModelVersionGroup: jest.fn(),
    joinModelActiveVersionGroup: jest.fn(),
    leaveModelActiveVersionGroup: jest.fn(),
    onThumbnailStatusChanged: jest.fn(() => jest.fn()),
    onActiveVersionChanged: jest.fn(() => jest.fn()),
    onEnvironmentMapThumbnailStatusChanged: jest.fn(() => jest.fn()),
    isConnected: jest.fn(() => false),
  },
  ThumbnailStatusChangedEvent: {},
  ActiveVersionChangedEvent: {},
  EnvironmentMapThumbnailStatusChangedEvent: {},
}))

jest.mock('@/shared/thumbnail/hooks/useThumbnail', () => ({
  useThumbnail: () => ({
    status: 'ready',
    thumbnailUrl: 'http://localhost:8080/mock-thumbnail',
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}))

// Mock webdavUtils (uses import.meta.env which Jest/Babel cannot transform)
jest.mock('./utils/webdavUtils', () => ({
  __esModule: true,
  detectOS: jest.fn(() => 'windows'),
  getWebDavBaseUrl: jest.fn(() => 'http://localhost:8080/modelibr'),
  getWebDavPath: jest.fn((virtualPath: string) => ({
    nativePath: `\\\\localhost@8080\\modelibr\\${virtualPath}`,
    displayPath: `\\\\localhost@8080\\modelibr\\${virtualPath}`,
    webDavUrl: `http://localhost:8080/modelibr/${virtualPath}`,
  })),
  getProjectAssetPath: jest.fn(),
  getSoundCategoryPath: jest.fn(),
  openInFileExplorer: jest.fn(),
  copyPathToClipboard: jest.fn(),
  getMountInstructions: jest.fn(() => ({ windows: '', macos: '', linux: '' })),
}))

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mocked-url')
global.URL.revokeObjectURL = jest.fn()

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// jsdom does not implement Blob.arrayBuffer(), which every browser we target has.
// Needed by anything that reads an uploaded File's bytes (e.g. client-side .zip
// extraction on the import path).
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

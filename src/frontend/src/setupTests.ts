import '@testing-library/jest-dom'

// Mock Vite environment variables for Jest (import.meta.env -> process.env)
process.env.VITE_API_BASE_URL = 'http://localhost:5009'
process.env.DEV = 'true'
process.env.PROD = 'false'
process.env.MODE = 'test'

// Mock services that use import.meta.env at module level
jest.mock('./services/ApiClient', () => ({
  __esModule: true,
  default: {
    getBaseURL: jest.fn(() => 'http://localhost:5009'),
    uploadModel: jest.fn(),
    uploadFile: jest.fn(),
    getModels: jest.fn().mockResolvedValue([]),
    getModelById: jest.fn(),
    getModelFileUrl: jest.fn((modelId: string) => `http://localhost:5009/models/${modelId}/file`),
    getFileUrl: jest.fn((fileId: string) => `http://localhost:5009/files/${fileId}`),
    getThumbnailStatus: jest.fn(),
    getThumbnailUrl: jest.fn((modelId: string) => `http://localhost:5009/models/${modelId}/thumbnail/file`),
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
  default: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    joinAllModelsGroup: jest.fn(),
    leaveAllModelsGroup: jest.fn(),
    joinModelVersionGroup: jest.fn(),
    leaveModelVersionGroup: jest.fn(),
    joinModelActiveVersionGroup: jest.fn(),
    leaveModelActiveVersionGroup: jest.fn(),
    onThumbnailStatusChanged: jest.fn(() => jest.fn()),
    onActiveVersionChanged: jest.fn(() => jest.fn()),
    isConnected: jest.fn(() => false),
  },
  thumbnailSignalRService: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    joinAllModelsGroup: jest.fn(),
    leaveAllModelsGroup: jest.fn(),
    joinModelVersionGroup: jest.fn(),
    leaveModelVersionGroup: jest.fn(),
    joinModelActiveVersionGroup: jest.fn(),
    leaveModelActiveVersionGroup: jest.fn(),
    onThumbnailStatusChanged: jest.fn(() => jest.fn()),
    onActiveVersionChanged: jest.fn(() => jest.fn()),
    isConnected: jest.fn(() => false),
  },
  ThumbnailStatusChangedEvent: {},
  ActiveVersionChangedEvent: {},
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

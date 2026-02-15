import { Tab } from '@/types'
import {
  getTabLabel,
  parseCompactTabFormat,
  serializeToCompactFormat,
} from '@/utils/tabSerialization'

// Mock apiBase to prevent import.meta.env error in Jest
jest.mock('@/lib/apiBase', () => ({
  client: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  baseURL: 'http://localhost:8080',
  UPLOAD_TIMEOUT: 300000,
}))

// Mock individual API modules to prevent import.meta.env chain
jest.mock('@/features/models/api/modelApi', () => ({
  getModelById: jest.fn(),
}))
jest.mock('@/features/texture-set/api/textureSetApi', () => ({
  getTextureSetById: jest.fn(),
}))
jest.mock('@/features/pack/api/packApi', () => ({
  getPackById: jest.fn(),
}))
jest.mock('@/features/project/api/projectApi', () => ({
  getProjectById: jest.fn(),
}))
jest.mock('@/features/stage-editor/api/stageApi', () => ({
  getStageById: jest.fn(),
}))

describe('SplitterLayout URL Serialization', () => {
  describe('getTabLabel', () => {
    it('should return correct labels for different tab types', () => {
      expect(getTabLabel('modelList')).toBe('Models')
      expect(getTabLabel('textureSets')).toBe('Texture Sets')
      expect(getTabLabel('modelViewer')).toBe('Model Viewer')
      expect(getTabLabel('modelViewer', { modelId: '123' })).toBe('Model 123')
      expect(getTabLabel('modelViewer', { modelName: 'My Model' })).toBe(
        'My Model'
      )
    })

    it('should return correct labels for pack and project types', () => {
      expect(getTabLabel('packs')).toBe('Packs')
      expect(getTabLabel('packViewer', { packId: '5' })).toBe('Pack 5')
      expect(getTabLabel('projects')).toBe('Projects')
      expect(getTabLabel('projectViewer', { projectId: '10' })).toBe(
        'Project 10'
      )
    })

    it('should return Unknown for invalid types', () => {
      expect(getTabLabel('invalidType' as Tab['type'])).toBe('Unknown')
    })
  })

  describe('parseCompactTabFormat', () => {
    it('should parse single tab type without ID', () => {
      const result = parseCompactTabFormat('modelList')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelList')
      expect(result[0].label).toBe('Models')
      expect(result[0].modelId).toBeUndefined()
    })

    it('should parse model viewer tab with ID', () => {
      const result = parseCompactTabFormat('model-123')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelViewer')
      expect(result[0].label).toBe('Model 123')
      expect(result[0].modelId).toBe('123')
    })

    it('should parse texture set viewer tab with ID', () => {
      const result = parseCompactTabFormat('set-456')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('textureSetViewer')
      expect(result[0].setId).toBe('456')
    })

    it('should parse multiple tabs', () => {
      const result = parseCompactTabFormat('modelList,textureSets,model-456')
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('textureSets')
      expect(result[2].type).toBe('modelViewer')
      expect(result[2].modelId).toBe('456')
    })

    it('should handle legacy JSON format', () => {
      const legacyFormat = JSON.stringify([
        { id: 'models', type: 'modelList' },
        { id: 'model-123', type: 'modelViewer', modelId: '123' },
      ])
      const result = parseCompactTabFormat(legacyFormat)
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('modelViewer')
      expect(result[1].modelId).toBe('123')
    })

    it('should return default value for invalid formats', () => {
      const customDefault = [
        {
          id: 'default',
          type: 'modelList',
          label: 'Default',
          params: {},
          internalUiState: {},
        },
      ] as Tab[]
      expect(parseCompactTabFormat('invalidType', customDefault)).toEqual(
        customDefault
      )
      expect(parseCompactTabFormat('', customDefault)).toEqual(customDefault)

      // Default behavior without custom default
      expect(parseCompactTabFormat('invalidType')).toEqual([])
      expect(parseCompactTabFormat('')).toEqual([])
    })

    it('should deduplicate tabs', () => {
      const result = parseCompactTabFormat('modelList,modelList,modelList')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelList')
    })
  })

  describe('serializeToCompactFormat', () => {
    it('should serialize basic tabs using their IDs', () => {
      const tabs: Tab[] = [
        {
          id: 'modelList',
          type: 'modelList',
          label: 'Models',
          params: {},
          internalUiState: {},
        },
        {
          id: 'textureSets',
          type: 'textureSets',
          label: 'Texture Sets',
          params: {},
          internalUiState: {},
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,textureSets')
    })

    it('should serialize viewer tabs with IDs', () => {
      const tabs: Tab[] = [
        {
          id: 'modelList',
          type: 'modelList',
          label: 'Models',
          params: {},
          internalUiState: {},
        },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
          params: { modelId: '123' },
          internalUiState: {},
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,model-123')
    })

    it('should handle empty array', () => {
      expect(serializeToCompactFormat([])).toBe('')
    })

    it('should deduplicate tabs during serialization', () => {
      const tabs: Tab[] = [
        {
          id: 'modelList',
          type: 'modelList',
          label: 'Models',
          params: {},
          internalUiState: {},
        },
        {
          id: 'modelList',
          type: 'modelList',
          label: 'Models',
          params: {},
          internalUiState: {},
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList')
    })
  })
})

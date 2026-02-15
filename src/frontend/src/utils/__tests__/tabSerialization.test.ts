import { Tab } from '@/types'
import {
  getTabLabel,
  parseCompactTabFormat,
  parseCompactTabFormatAsync,
  serializeToCompactFormat,
} from '../tabSerialization'

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

// Mock ApiClient with properly typed mock functions
const mockGetModelById = jest.fn()
const mockGetTextureSetById = jest.fn()
const mockGetPackById = jest.fn()
const mockGetProjectById = jest.fn()
const mockGetStageById = jest.fn()

jest.mock('../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getModelById: (...args: unknown[]) => mockGetModelById(...args),
    getTextureSetById: (...args: unknown[]) => mockGetTextureSetById(...args),
    getPackById: (...args: unknown[]) => mockGetPackById(...args),
    getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
    getStageById: (...args: unknown[]) => mockGetStageById(...args),
  },
}))

// Mock individual API modules to prevent import.meta.env chain
jest.mock('@/features/models/api/modelApi', () => ({
  getModelById: (...args: unknown[]) => mockGetModelById(...args),
}))
jest.mock('@/features/texture-set/api/textureSetApi', () => ({
  getTextureSetById: (...args: unknown[]) => mockGetTextureSetById(...args),
}))
jest.mock('@/features/pack/api/packApi', () => ({
  getPackById: (...args: unknown[]) => mockGetPackById(...args),
}))
jest.mock('@/features/project/api/projectApi', () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}))
jest.mock('@/features/stage-editor/api/stageApi', () => ({
  getStageById: (...args: unknown[]) => mockGetStageById(...args),
}))

describe('Tab Serialization (Browser Refresh Compatibility)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getTabLabel', () => {
    it('should return correct labels for different tab types', () => {
      expect(getTabLabel('modelList')).toBe('Models')
      expect(getTabLabel('textureSets')).toBe('Texture Sets')
      expect(getTabLabel('packs')).toBe('Packs')
      expect(getTabLabel('modelViewer')).toBe('Model Viewer')
      expect(getTabLabel('modelViewer', { modelId: '123' })).toBe('Model 123')
    })

    it('should use name when provided', () => {
      expect(
        getTabLabel('modelViewer', { modelId: '123', modelName: 'My Model' })
      ).toBe('My Model')
      expect(
        getTabLabel('textureSetViewer', { setId: '456', setName: 'My Set' })
      ).toBe('My Set')
      expect(
        getTabLabel('packViewer', { packId: '789', packName: 'My Pack' })
      ).toBe('My Pack')
      expect(
        getTabLabel('projectViewer', {
          projectId: '111',
          projectName: 'My Project',
        })
      ).toBe('My Project')
      expect(
        getTabLabel('stageEditor', { stageId: '222', stageName: 'My Stage' })
      ).toBe('My Stage')
    })
  })

  describe('parseCompactTabFormat', () => {
    it('should parse single tab type without modelId', () => {
      const result = parseCompactTabFormat('modelList')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelList')
      expect(result[0].label).toBe('Models')
      expect(result[0].modelId).toBeUndefined()
    })

    it('should parse tab type with modelId', () => {
      const result = parseCompactTabFormat('model-123')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelViewer')
      expect(result[0].label).toBe('Model 123')
      expect(result[0].modelId).toBe('123')
    })

    it('should parse multiple tabs', () => {
      const result = parseCompactTabFormat('modelList,textureSets,model-456')
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('textureSets')
      expect(result[2].type).toBe('modelViewer')
      expect(result[2].modelId).toBe('456')
    })

    it('should generate deterministic IDs for same input', () => {
      const result1 = parseCompactTabFormat('modelList,textureSets')
      const result2 = parseCompactTabFormat('modelList,textureSets')

      expect(result1[0].id).toBe(result2[0].id)
      expect(result1[1].id).toBe(result2[1].id)
    })

    it('should generate deterministic IDs for tabs with modelId', () => {
      const result1 = parseCompactTabFormat('model-123')
      const result2 = parseCompactTabFormat('model-123')

      expect(result1[0].id).toBe(result2[0].id)
    })

    it('should handle legacy JSON format', () => {
      const legacyFormat = JSON.stringify([
        { id: 'modelList', type: 'modelList' },
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
        { id: 'default', type: 'modelList', label: 'Default' },
      ] as Tab[]
      expect(parseCompactTabFormat('invalidType', customDefault)).toEqual(
        customDefault
      )
      expect(
        parseCompactTabFormat('modelList,invalidType', customDefault)
      ).toEqual(customDefault)
      expect(parseCompactTabFormat('', customDefault)).toEqual(customDefault)

      // Default behavior without custom default
      expect(parseCompactTabFormat('invalidType')).toEqual([])
      expect(parseCompactTabFormat('')).toEqual([])
    })

    it('should deduplicate tabs with same id when parsing', () => {
      // This tests the fix for the bug where duplicate tabs appear in the UI
      // If the URL somehow contains duplicates (e.g., modelList,textureSets,set-1,model-1,model-1)
      // the parser should deduplicate them to prevent rendering duplicate tabs
      const result = parseCompactTabFormat(
        'modelList,model-123,model-123,textureSets'
      )
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('modelList')
      expect(result[1].id).toBe('model-123')
      expect(result[2].id).toBe('textureSets')

      // Ensure no duplicates exist
      const ids = result.map(tab => tab.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })
  })

  describe('serializeToCompactFormat', () => {
    it('should serialize basic tabs without modelId', () => {
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

    it('should serialize tabs with modelId', () => {
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

    it('should deduplicate tabs with same id', () => {
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
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
          params: { modelId: '123' },
          internalUiState: {},
        }, // duplicate
        {
          id: 'textureSets',
          type: 'textureSets',
          label: 'Texture Sets',
          params: {},
          internalUiState: {},
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe(
        'modelList,model-123,textureSets'
      )
    })

    it('should keep first occurrence when deduplicating', () => {
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
          label: 'First',
          modelId: '123',
          params: { modelId: '123' },
          internalUiState: {},
        },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Second',
          modelId: '123',
          params: { modelId: '123' },
          internalUiState: {},
        }, // duplicate with different label
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,model-123')
    })
  })

  describe('roundtrip compatibility (critical for browser refresh)', () => {
    it('should preserve tab functionality after serialization and parsing', () => {
      const originalTabs: Tab[] = [
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
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
          params: { modelId: '123' },
          internalUiState: {},
        },
      ]

      // Serialize tabs to URL format
      const serialized = serializeToCompactFormat(originalTabs)
      expect(serialized).toBe('modelList,textureSets,model-123')

      // Parse back from URL format (simulating browser refresh)
      const parsedTabs = parseCompactTabFormat(serialized)

      // Verify that parsed tabs have consistent structure
      expect(parsedTabs).toHaveLength(3)
      expect(parsedTabs[0].type).toBe('modelList')
      expect(parsedTabs[1].type).toBe('textureSets')
      expect(parsedTabs[2].type).toBe('modelViewer')
      expect(parsedTabs[2].modelId).toBe('123')

      // CRITICAL: IDs should be deterministic for the same content
      const parsedAgain = parseCompactTabFormat(serialized)
      expect(parsedTabs[0].id).toBe(parsedAgain[0].id)
      expect(parsedTabs[1].id).toBe(parsedAgain[1].id)
      expect(parsedTabs[2].id).toBe(parsedAgain[2].id)
    })
  })

  describe('parseCompactTabFormatAsync', () => {
    it('should fetch model name from API', async () => {
      mockGetModelById.mockResolvedValue({ id: 123, name: 'My Model' })

      const result = await parseCompactTabFormatAsync('model-123')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelViewer')
      expect(result[0].label).toBe('My Model')
      expect(result[0].modelId).toBe('123')
      expect(mockGetModelById).toHaveBeenCalledWith('123')
    })

    it('should fetch texture set name from API', async () => {
      mockGetTextureSetById.mockResolvedValue({
        id: 456,
        name: 'My Texture Set',
      })

      const result = await parseCompactTabFormatAsync('set-456')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('textureSetViewer')
      expect(result[0].label).toBe('My Texture Set')
      expect(result[0].setId).toBe('456')
      expect(mockGetTextureSetById).toHaveBeenCalledWith(456)
    })

    it('should fetch pack name from API', async () => {
      mockGetPackById.mockResolvedValue({ id: 789, name: 'My Pack' })

      const result = await parseCompactTabFormatAsync('pack-789')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('packViewer')
      expect(result[0].label).toBe('My Pack')
      expect(result[0].packId).toBe('789')
      expect(mockGetPackById).toHaveBeenCalledWith(789)
    })

    it('should fetch project name from API', async () => {
      mockGetProjectById.mockResolvedValue({ id: 111, name: 'My Project' })

      const result = await parseCompactTabFormatAsync('project-111')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('projectViewer')
      expect(result[0].label).toBe('My Project')
      expect(result[0].projectId).toBe('111')
      expect(mockGetProjectById).toHaveBeenCalledWith(111)
    })

    it('should fetch stage name from API', async () => {
      mockGetStageById.mockResolvedValue({ id: 222, name: 'My Stage' })

      const result = await parseCompactTabFormatAsync('stage-222')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('stageEditor')
      expect(result[0].label).toBe('My Stage')
      expect(result[0].stageId).toBe('222')
      expect(mockGetStageById).toHaveBeenCalledWith(222)
    })

    it('should fall back to ID-based label when API fails', async () => {
      mockGetModelById.mockRejectedValue(new Error('Not found'))

      const result = await parseCompactTabFormatAsync('model-999')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelViewer')
      expect(result[0].label).toBe('Model 999')
      expect(result[0].modelId).toBe('999')
    })

    it('should handle mixed tab types', async () => {
      mockGetModelById.mockResolvedValue({ id: 123, name: 'My Model' })

      const result = await parseCompactTabFormatAsync(
        'modelList,model-123,textureSets'
      )
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('modelList')
      expect(result[0].label).toBe('Models')
      expect(result[1].type).toBe('modelViewer')
      expect(result[1].label).toBe('My Model')
      expect(result[2].type).toBe('textureSets')
      expect(result[2].label).toBe('Texture Sets')
    })

    it('should handle legacy JSON format', async () => {
      const legacyFormat = JSON.stringify([
        { id: 'modelList', type: 'modelList' },
        { id: 'model-123', type: 'modelViewer', modelId: '123' },
      ])
      const result = await parseCompactTabFormatAsync(legacyFormat)
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('modelViewer')
      expect(result[1].modelId).toBe('123')
    })

    it('should return default value for empty input', async () => {
      const result = await parseCompactTabFormatAsync('')
      expect(result).toEqual([])

      const customDefault = [
        { id: 'default', type: 'modelList', label: 'Default' },
      ] as Tab[]
      const resultWithDefault = await parseCompactTabFormatAsync(
        '',
        customDefault
      )
      expect(resultWithDefault).toEqual(customDefault)
    })
  })
})

import { Tab } from '../../types'
import {
  getTabLabel,
  parseCompactTabFormat,
  serializeToCompactFormat,
} from '../tabSerialization'

describe('Tab Serialization (Browser Refresh Compatibility)', () => {
  describe('getTabLabel', () => {
    it('should return correct labels for different tab types', () => {
      expect(getTabLabel('modelList')).toBe('Models')
      expect(getTabLabel('texture')).toBe('Textures')
      expect(getTabLabel('animation')).toBe('Animations')
      expect(getTabLabel('modelViewer')).toBe('Model Viewer')
      expect(getTabLabel('modelViewer', '123')).toBe('Model 123')
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
      const result = parseCompactTabFormat('modelList,texture,model-456')
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('texture')
      expect(result[2].type).toBe('modelViewer')
      expect(result[2].modelId).toBe('456')
    })

    it('should generate deterministic IDs for same input', () => {
      const result1 = parseCompactTabFormat('modelList,texture')
      const result2 = parseCompactTabFormat('modelList,texture')

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
        'modelList,model-123,model-123,texture'
      )
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('modelList')
      expect(result[1].id).toBe('model-123')
      expect(result[2].id).toBe('texture')

      // Ensure no duplicates exist
      const ids = result.map(tab => tab.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })
  })

  describe('serializeToCompactFormat', () => {
    it('should serialize basic tabs without modelId', () => {
      const tabs: Tab[] = [
        { id: 'modelList', type: 'modelList', label: 'Models' },
        { id: 'texture', type: 'texture', label: 'Textures' },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,texture')
    })

    it('should serialize tabs with modelId', () => {
      const tabs: Tab[] = [
        { id: 'modelList', type: 'modelList', label: 'Models' },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,model-123')
    })

    it('should handle empty array', () => {
      expect(serializeToCompactFormat([])).toBe('')
    })

    it('should deduplicate tabs with same id', () => {
      const tabs: Tab[] = [
        { id: 'modelList', type: 'modelList', label: 'Models' },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
        },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
        }, // duplicate
        { id: 'texture', type: 'texture', label: 'Textures' },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,model-123,texture')
    })

    it('should keep first occurrence when deduplicating', () => {
      const tabs: Tab[] = [
        { id: 'modelList', type: 'modelList', label: 'Models' },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'First',
          modelId: '123',
        },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Second',
          modelId: '123',
        }, // duplicate with different label
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,model-123')
    })
  })

  describe('roundtrip compatibility (critical for browser refresh)', () => {
    it('should preserve tab functionality after serialization and parsing', () => {
      const originalTabs: Tab[] = [
        { id: 'modelList', type: 'modelList', label: 'Models' },
        { id: 'texture', type: 'texture', label: 'Textures' },
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
        },
      ]

      // Serialize tabs to URL format
      const serialized = serializeToCompactFormat(originalTabs)
      expect(serialized).toBe('modelList,texture,model-123')

      // Parse back from URL format (simulating browser refresh)
      const parsedTabs = parseCompactTabFormat(serialized)

      // Verify that parsed tabs have consistent structure
      expect(parsedTabs).toHaveLength(3)
      expect(parsedTabs[0].type).toBe('modelList')
      expect(parsedTabs[1].type).toBe('texture')
      expect(parsedTabs[2].type).toBe('modelViewer')
      expect(parsedTabs[2].modelId).toBe('123')

      // CRITICAL: IDs should be deterministic for the same content
      const parsedAgain = parseCompactTabFormat(serialized)
      expect(parsedTabs[0].id).toBe(parsedAgain[0].id)
      expect(parsedTabs[1].id).toBe(parsedAgain[1].id)
      expect(parsedTabs[2].id).toBe(parsedAgain[2].id)
    })
  })
})

import { Tab } from '../../../types'

// Extract the getTabLabel function for testing
function getTabLabel(type: Tab['type'], modelId?: string): string {
  switch (type) {
    case 'modelList':
      return 'Models'
    case 'modelViewer':
      return modelId ? `Model ${modelId}` : 'Model Viewer'
    case 'texture':
      return 'Textures'
    case 'animation':
      return 'Animations'
    default:
      return 'Unknown'
  }
}

// Extract parsing logic for testing
function parseCompactTabFormat(value: string): Tab[] {
  if (!value) return []
  
  // Support legacy JSON format for backward compatibility
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  
  // Parse compact format: "type" or "type:modelId", separated by commas
  try {
    return value.split(',').map((tabSpec, index) => {
      const [type, modelId] = tabSpec.split(':')
      const tabType = type as Tab['type']
      
      // Validate tab type
      if (!['modelList', 'modelViewer', 'texture', 'animation'].includes(tabType)) {
        throw new Error(`Invalid tab type: ${type}`)
      }
      
      return {
        id: modelId ? `model-${modelId}-${Date.now() + index}` : `${tabType}-${Date.now() + index}`,
        type: tabType,
        label: getTabLabel(tabType, modelId),
        modelId: modelId || undefined,
      }
    })
  } catch {
    return []
  }
}

// Extract serialization logic for testing
function serializeToCompactFormat(tabs: Tab[]): string {
  return tabs.map(tab => 
    tab.modelId ? `${tab.type}:${tab.modelId}` : tab.type
  ).join(',')
}

describe('SplitterLayout URL Serialization', () => {
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
      const result = parseCompactTabFormat('modelViewer:123')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('modelViewer')
      expect(result[0].label).toBe('Model 123')
      expect(result[0].modelId).toBe('123')
    })

    it('should parse multiple tabs', () => {
      const result = parseCompactTabFormat('modelList,texture,modelViewer:456')
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('modelList')
      expect(result[1].type).toBe('texture')
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

    it('should return empty array for invalid formats', () => {
      expect(parseCompactTabFormat('invalidType')).toEqual([])
      expect(parseCompactTabFormat('modelList,invalidType')).toEqual([])
      expect(parseCompactTabFormat('')).toEqual([])
    })
  })

  describe('serializeToCompactFormat', () => {
    it('should serialize basic tabs without modelId', () => {
      const tabs: Tab[] = [
        { id: 'models', type: 'modelList', label: 'Models' },
        { id: 'textures', type: 'texture', label: 'Textures' },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,texture')
    })

    it('should serialize tabs with modelId', () => {
      const tabs: Tab[] = [
        { id: 'models', type: 'modelList', label: 'Models' },
        { id: 'model-123', type: 'modelViewer', label: 'Model 123', modelId: '123' },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,modelViewer:123')
    })

    it('should handle empty array', () => {
      expect(serializeToCompactFormat([])).toBe('')
    })
  })
})
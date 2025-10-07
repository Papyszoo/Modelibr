import { Tab } from '../../../types'
import {
  getTabLabel,
  parseCompactTabFormat,
  serializeToCompactFormat,
} from '../../../utils/tabSerialization'

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
        {
          id: 'model-123',
          type: 'modelViewer',
          label: 'Model 123',
          modelId: '123',
        },
      ]
      expect(serializeToCompactFormat(tabs)).toBe('modelList,modelViewer:123')
    })

    it('should handle empty array', () => {
      expect(serializeToCompactFormat([])).toBe('')
    })
  })
})

describe('SplitterLayout Toggle Logic', () => {
  describe('edge detection', () => {
    it('should detect when splitter is at left edge', () => {
      const leftSize = 1
      const isAtLeftEdge = leftSize <= 1
      expect(isAtLeftEdge).toBe(true)
    })

    it('should detect when splitter is at right edge', () => {
      const leftSize = 99
      const isAtRightEdge = leftSize >= 99
      expect(isAtRightEdge).toBe(true)
    })

    it('should detect when splitter is at center', () => {
      const leftSize = 50
      const isAtLeftEdge = leftSize <= 1
      const isAtRightEdge = leftSize >= 99
      const isAtCenter = !isAtLeftEdge && !isAtRightEdge
      expect(isAtCenter).toBe(true)
    })
  })

  describe('toggle behavior', () => {
    it('should move to left edge when at center and left arrow clicked', () => {
      const currentSize = 50
      const isAtLeftEdge = currentSize <= 1
      const newSize = isAtLeftEdge ? '50' : '1'
      expect(newSize).toBe('1')
    })

    it('should return to center when at left edge and left arrow clicked', () => {
      const currentSize = 1
      const isAtLeftEdge = currentSize <= 1
      const newSize = isAtLeftEdge ? '50' : '1'
      expect(newSize).toBe('50')
    })

    it('should move to right edge when at center and right arrow clicked', () => {
      const currentSize = 50
      const isAtRightEdge = currentSize >= 99
      const newSize = isAtRightEdge ? '50' : '99'
      expect(newSize).toBe('99')
    })

    it('should return to center when at right edge and right arrow clicked', () => {
      const currentSize = 99
      const isAtRightEdge = currentSize >= 99
      const newSize = isAtRightEdge ? '50' : '99'
      expect(newSize).toBe('50')
    })
  })

  describe('button visibility', () => {
    it('should show both buttons when at center', () => {
      const leftSize = 50
      const isAtLeftEdge = leftSize <= 1
      const isAtRightEdge = leftSize >= 99
      const isAtCenter = !isAtLeftEdge && !isAtRightEdge

      const showLeftButton = isAtCenter || isAtLeftEdge
      const showRightButton = isAtCenter || isAtRightEdge

      expect(showLeftButton).toBe(true)
      expect(showRightButton).toBe(true)
    })

    it('should show only left button when at left edge', () => {
      const leftSize = 1
      const isAtLeftEdge = leftSize <= 1
      const isAtRightEdge = leftSize >= 99
      const isAtCenter = !isAtLeftEdge && !isAtRightEdge

      const showLeftButton = isAtCenter || isAtLeftEdge
      const showRightButton = isAtCenter || isAtRightEdge

      expect(showLeftButton).toBe(true)
      expect(showRightButton).toBe(false)
    })

    it('should show only right button when at right edge', () => {
      const leftSize = 99
      const isAtLeftEdge = leftSize <= 1
      const isAtRightEdge = leftSize >= 99
      const isAtCenter = !isAtLeftEdge && !isAtRightEdge

      const showLeftButton = isAtCenter || isAtLeftEdge
      const showRightButton = isAtCenter || isAtRightEdge

      expect(showLeftButton).toBe(false)
      expect(showRightButton).toBe(true)
    })
  })
})

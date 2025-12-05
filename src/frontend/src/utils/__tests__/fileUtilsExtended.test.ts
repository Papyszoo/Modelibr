import {
  formatFileSize,
  getSpriteTypeName,
  getModelDisplayName,
} from '../fileUtils'

describe('fileUtils', () => {
  describe('formatFileSize', () => {
    it('should format zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
    })

    it('should format bytes', () => {
      expect(formatFileSize(100)).toBe('100 Bytes')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(2048)).toBe('2 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(2097152)).toBe('2 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB')
    })
  })

  describe('getSpriteTypeName', () => {
    it('should return Static for type 1', () => {
      expect(getSpriteTypeName(1)).toBe('Static')
    })

    it('should return Sprite Sheet for type 2', () => {
      expect(getSpriteTypeName(2)).toBe('Sprite Sheet')
    })

    it('should return GIF for type 3', () => {
      expect(getSpriteTypeName(3)).toBe('GIF')
    })

    it('should return APNG for type 4', () => {
      expect(getSpriteTypeName(4)).toBe('APNG')
    })

    it('should return Animated WebP for type 5', () => {
      expect(getSpriteTypeName(5)).toBe('Animated WebP')
    })

    it('should return Unknown for unknown type', () => {
      expect(getSpriteTypeName(99)).toBe('Unknown')
    })
  })

  describe('getModelDisplayName', () => {
    it('should return the first file original name when available', () => {
      const model = {
        id: '1',
        name: 'ModelName',
        files: [
          {
            id: '1',
            originalFileName: 'test-model.obj',
            storedFileName: 'stored',
            filePath: '/path',
            mimeType: 'model/obj',
            sizeBytes: 1000,
            sha256Hash: 'hash',
            fileType: 'obj',
            isRenderable: true,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      expect(getModelDisplayName(model)).toBe('test-model.obj')
    })

    it('should return model name when no files', () => {
      const model = {
        id: '1',
        name: 'ModelName',
        files: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      expect(getModelDisplayName(model)).toBe('ModelName')
    })

    it('should return Model {id} as fallback', () => {
      const model = {
        id: '123',
        name: '',
        files: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      expect(getModelDisplayName(model)).toBe('Model 123')
    })
  })
})

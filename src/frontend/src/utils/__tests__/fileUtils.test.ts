import {
  getFileExtension,
  getFileName,
  getModelFileFormat,
  formatFileSize,
  isThreeJSRenderable,
  isSupportedModelFormat,
  THREEJS_SUPPORTED_FORMATS,
  ALL_SUPPORTED_FORMATS,
} from '../fileUtils'

describe('fileUtils', () => {
  describe('getFileExtension', () => {
    it('should return file extension in lowercase', () => {
      expect(getFileExtension('model.OBJ')).toBe('obj')
      expect(getFileExtension('test.GLB')).toBe('glb')
      expect(getFileExtension('path/to/file.FBX')).toBe('fbx')
    })

    it('should return "unknown" for files without extension', () => {
      expect(getFileExtension('')).toBe('unknown')
    })

    it('should handle paths with multiple dots', () => {
      expect(getFileExtension('file.backup.obj')).toBe('obj')
      expect(getFileExtension('my.model.v2.gltf')).toBe('gltf')
    })
  })

  describe('getFileName', () => {
    it('should extract filename from path', () => {
      expect(getFileName('/path/to/model.obj')).toBe('model.obj')
      expect(getFileName('model.fbx')).toBe('model.fbx')
      expect(getFileName('/deep/nested/path/file.gltf')).toBe('file.gltf')
    })

    it('should return "unknown" for empty or invalid paths', () => {
      expect(getFileName('')).toBe('unknown')
      expect(getFileName('/')).toBe('unknown')
    })
  })

  describe('getModelFileFormat', () => {
    it('should return formatted file extension from model object', () => {
      const model = {
        files: [{ originalFileName: 'test.obj' }],
      }
      expect(getModelFileFormat(model)).toBe('OBJ')
    })

    it('should return UNKNOWN for models without files', () => {
      expect(getModelFileFormat({})).toBe('UNKNOWN')
      expect(getModelFileFormat({ files: [] })).toBe('UNKNOWN')
      expect(getModelFileFormat({ files: null })).toBe('UNKNOWN')
    })

    it('should handle multiple files and return first file format', () => {
      const model = {
        files: [
          { originalFileName: 'model.gltf' },
          { originalFileName: 'texture.jpg' },
        ],
      }
      expect(getModelFileFormat(model)).toBe('GLTF')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
      expect(formatFileSize(512)).toBe('512 Bytes')
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(1073741824)).toBe('1 GB')
    })

    it('should handle large file sizes within supported range', () => {
      expect(formatFileSize(2147483648)).toBe('2 GB')
    })

    it('should format decimal places correctly', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(2621440)).toBe('2.5 MB')
    })
  })

  describe('isThreeJSRenderable', () => {
    it('should return true for Three.js supported formats', () => {
      expect(isThreeJSRenderable('.obj')).toBe(true)
      expect(isThreeJSRenderable('.fbx')).toBe(true)
      expect(isThreeJSRenderable('.gltf')).toBe(true)
      expect(isThreeJSRenderable('.glb')).toBe(true)
    })

    it('should handle formats without leading dot', () => {
      expect(isThreeJSRenderable('obj')).toBe(true)
      expect(isThreeJSRenderable('fbx')).toBe(true)
      expect(isThreeJSRenderable('gltf')).toBe(true)
      expect(isThreeJSRenderable('glb')).toBe(true)
    })

    it('should handle case insensitive formats', () => {
      expect(isThreeJSRenderable('OBJ')).toBe(true)
      expect(isThreeJSRenderable('.FBX')).toBe(true)
      expect(isThreeJSRenderable('.GLTF')).toBe(true)
      expect(isThreeJSRenderable('GLB')).toBe(true)
    })

    it('should return false for non-Three.js formats', () => {
      expect(isThreeJSRenderable('.dae')).toBe(false)
      expect(isThreeJSRenderable('.3ds')).toBe(false)
      expect(isThreeJSRenderable('.blend')).toBe(false)
    })

    it('should return false for unsupported formats', () => {
      expect(isThreeJSRenderable('.txt')).toBe(false)
      expect(isThreeJSRenderable('.jpg')).toBe(false)
      expect(isThreeJSRenderable('.unknown')).toBe(false)
    })
  })

  describe('isSupportedModelFormat', () => {
    it('should return true for all supported formats', () => {
      ALL_SUPPORTED_FORMATS.forEach(format => {
        expect(isSupportedModelFormat(format)).toBe(true)
      })
    })

    it('should handle formats without leading dot', () => {
      expect(isSupportedModelFormat('obj')).toBe(true)
      expect(isSupportedModelFormat('fbx')).toBe(true)
      expect(isSupportedModelFormat('gltf')).toBe(true)
    })

    it('should handle case insensitive formats', () => {
      expect(isSupportedModelFormat('OBJ')).toBe(true)
      expect(isSupportedModelFormat('.FBX')).toBe(true)
      expect(isSupportedModelFormat('BLEND')).toBe(true)
    })

    it('should return false for unsupported formats', () => {
      expect(isSupportedModelFormat('.txt')).toBe(false)
      expect(isSupportedModelFormat('.jpg')).toBe(false)
      expect(isSupportedModelFormat('.mp4')).toBe(false)
      expect(isSupportedModelFormat('.unknown')).toBe(false)
    })
  })

  describe('constants', () => {
    it('should have correct Three.js supported formats', () => {
      expect(THREEJS_SUPPORTED_FORMATS).toEqual([
        '.obj',
        '.fbx',
        '.gltf',
        '.glb',
      ])
    })

    it('should have correct all supported formats', () => {
      expect(ALL_SUPPORTED_FORMATS).toEqual([
        '.obj',
        '.fbx',
        '.dae',
        '.3ds',
        '.blend',
        '.gltf',
        '.glb',
      ])
    })

    it('should have Three.js formats be a subset of all formats', () => {
      THREEJS_SUPPORTED_FORMATS.forEach(format => {
        expect(ALL_SUPPORTED_FORMATS).toContain(format)
      })
    })
  })
})

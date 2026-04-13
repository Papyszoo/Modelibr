import {
  buildDownloadName,
  getExtensionFromContentType,
  getFileExtension,
  sanitizeFileStem,
} from '@/features/environment-map/utils/downloadUtils'

describe('downloadUtils', () => {
  describe('getFileExtension', () => {
    it('returns the extension from a simple filename', () => {
      expect(getFileExtension('photo.png')).toBe('png')
    })

    it('returns the extension from a URL path', () => {
      expect(getFileExtension('/assets/thumbnails/image.jpg')).toBe('jpg')
    })

    it('strips query parameters before extracting extension', () => {
      expect(getFileExtension('/files/map.hdr?token=abc')).toBe('hdr')
    })

    it('returns extension in lowercase', () => {
      expect(getFileExtension('texture.EXR')).toBe('exr')
    })

    it('returns empty string for null input', () => {
      expect(getFileExtension(null)).toBe('')
    })

    it('returns empty string for undefined input', () => {
      expect(getFileExtension(undefined)).toBe('')
    })

    it('returns empty string for empty string input', () => {
      expect(getFileExtension('')).toBe('')
    })

    it('handles filenames with multiple dots', () => {
      expect(getFileExtension('my.environment.map.hdr')).toBe('hdr')
    })
  })

  describe('getExtensionFromContentType', () => {
    it('maps image/png to png', () => {
      expect(getExtensionFromContentType('image/png')).toBe('png')
    })

    it('maps image/jpeg to jpg', () => {
      expect(getExtensionFromContentType('image/jpeg')).toBe('jpg')
    })

    it('maps image/webp to webp', () => {
      expect(getExtensionFromContentType('image/webp')).toBe('webp')
    })

    it('maps image/vnd.radiance to hdr', () => {
      expect(getExtensionFromContentType('image/vnd.radiance')).toBe('hdr')
    })

    it('maps image/x-exr to exr', () => {
      expect(getExtensionFromContentType('image/x-exr')).toBe('exr')
    })

    it('maps application/octet-stream to exr', () => {
      expect(getExtensionFromContentType('application/octet-stream')).toBe(
        'exr'
      )
    })

    it('returns empty string for unknown content type', () => {
      expect(getExtensionFromContentType('text/html')).toBe('')
    })

    it('returns empty string for null', () => {
      expect(getExtensionFromContentType(null)).toBe('')
    })

    it('is case-insensitive', () => {
      expect(getExtensionFromContentType('IMAGE/PNG')).toBe('png')
      expect(getExtensionFromContentType('Image/Jpeg')).toBe('jpg')
    })
  })

  describe('sanitizeFileStem', () => {
    it('passes through simple alphanumeric names', () => {
      expect(sanitizeFileStem('studio-sunset')).toBe('studio-sunset')
    })

    it('replaces spaces with hyphens', () => {
      expect(sanitizeFileStem('my environment map')).toBe('my-environment-map')
    })

    it('replaces special characters with hyphens', () => {
      expect(sanitizeFileStem('file@name#v2!')).toBe('file-name-v2')
    })

    it('collapses consecutive hyphens', () => {
      expect(sanitizeFileStem('a---b')).toBe('a-b')
    })

    it('removes leading and trailing hyphens', () => {
      expect(sanitizeFileStem('-hello-world-')).toBe('hello-world')
    })

    it('preserves underscores', () => {
      expect(sanitizeFileStem('env_map_01')).toBe('env_map_01')
    })

    it('handles all-special-character input', () => {
      expect(sanitizeFileStem('!!!@@@###')).toBe('')
    })
  })

  describe('buildDownloadName', () => {
    it('combines base name, variant label, and extension', () => {
      expect(buildDownloadName('Studio Sunset', '4K', 'hdr')).toBe(
        'Studio-Sunset-4K.hdr'
      )
    })

    it('uses "environment" as suffix when variant label is empty', () => {
      expect(buildDownloadName('Studio', '', 'exr')).toBe(
        'Studio-environment.exr'
      )
    })

    it('sanitizes special characters in both base name and variant label', () => {
      expect(buildDownloadName('My Map!', 'Hi Res #2', 'hdr')).toBe(
        'My-Map-Hi-Res-2.hdr'
      )
    })

    it('omits extension dot when extension is empty', () => {
      expect(buildDownloadName('Studio', '4K', '')).toBe('Studio-4K')
    })
  })
})

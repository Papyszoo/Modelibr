import { getAlbedoTextureUrl } from '../textureTypeUtils'
import { TextureType } from '../../types'

describe('textureTypeUtils', () => {
  describe('getAlbedoTextureUrl', () => {
    const mockGetFileUrl = (fileId: string) =>
      `https://example.com/files/${fileId}`

    it('should return albedo texture URL when available', () => {
      const textureSet = {
        textures: [
          { textureType: TextureType.Albedo, fileId: 123 },
          { textureType: TextureType.Normal, fileId: 456 },
        ],
      }

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBe('https://example.com/files/123')
    })

    it('should return diffuse texture URL as fallback when no albedo', () => {
      const textureSet = {
        textures: [
          { textureType: TextureType.Diffuse, fileId: 789 },
          { textureType: TextureType.Normal, fileId: 456 },
        ],
      }

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBe('https://example.com/files/789')
    })

    it('should prefer albedo over diffuse', () => {
      const textureSet = {
        textures: [
          { textureType: TextureType.Diffuse, fileId: 789 },
          { textureType: TextureType.Albedo, fileId: 123 },
        ],
      }

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBe('https://example.com/files/123')
    })

    it('should return null when no albedo or diffuse texture', () => {
      const textureSet = {
        textures: [
          { textureType: TextureType.Normal, fileId: 456 },
          { textureType: TextureType.Roughness, fileId: 999 },
        ],
      }

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBeNull()
    })

    it('should return null when textures array is empty', () => {
      const textureSet = {
        textures: [],
      }

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBeNull()
    })

    it('should return null when textures is undefined', () => {
      const textureSet = {}

      const result = getAlbedoTextureUrl(textureSet, mockGetFileUrl)
      expect(result).toBeNull()
    })
  })
})

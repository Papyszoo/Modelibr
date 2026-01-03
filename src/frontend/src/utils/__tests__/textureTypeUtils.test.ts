import { TextureType } from '../../types'
import {
  TEXTURE_TYPE_INFO,
  getAllTextureTypes,
  getTextureTypeColor,
  getTextureTypeIcon,
  getTextureTypeInfo,
  getTextureTypeLabel,
  getTextureTypeOptions,
} from '../textureTypeUtils'

describe('textureTypeUtils', () => {
  describe('TEXTURE_TYPE_INFO constant', () => {
    it('should have info for all TextureType enum values', () => {
      const allTextureTypes = [
        TextureType.Albedo,
        TextureType.Normal,
        TextureType.Height,
        TextureType.AO,
        TextureType.Roughness,
        TextureType.Metallic,
        TextureType.Diffuse,
        TextureType.Specular,
        TextureType.Emissive,
        TextureType.Bump,
        TextureType.Alpha,
        TextureType.Displacement,
      ]

      allTextureTypes.forEach(type => {
        expect(TEXTURE_TYPE_INFO[type]).toBeDefined()
        expect(TEXTURE_TYPE_INFO[type].label).toBeDefined()
        expect(TEXTURE_TYPE_INFO[type].description).toBeDefined()
        expect(TEXTURE_TYPE_INFO[type].color).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(TEXTURE_TYPE_INFO[type].icon).toMatch(/^pi-/)
      })
    })
  })

  describe('getTextureTypeInfo', () => {
    it('should return info for valid texture types', () => {
      const albedoInfo = getTextureTypeInfo(TextureType.Albedo)

      expect(albedoInfo.label).toBe('Albedo (Color)')
      expect(albedoInfo.description).toContain('Base color')
      expect(albedoInfo.color).toBe('#3b82f6')
      expect(albedoInfo.icon).toBe('pi-palette')
    })

    it('should return info for all texture types', () => {
      const allTypes = getAllTextureTypes()

      allTypes.forEach(type => {
        const info = getTextureTypeInfo(type)
        expect(info).toBeDefined()
        expect(info.label.length).toBeGreaterThan(0)
      })
    })
  })

  describe('getTextureTypeLabel', () => {
    it('should return correct labels for known types', () => {
      expect(getTextureTypeLabel(TextureType.Albedo)).toBe('Albedo (Color)')
      expect(getTextureTypeLabel(TextureType.Normal)).toBe('Normal')
      expect(getTextureTypeLabel(TextureType.Roughness)).toBe('Roughness')
      expect(getTextureTypeLabel(TextureType.Metallic)).toBe('Metallic')
      expect(getTextureTypeLabel(TextureType.AO)).toBe('AO')
    })

    it('should return "Unknown" for invalid types', () => {
      expect(getTextureTypeLabel(999 as TextureType)).toBe('Unknown')
    })
  })

  describe('getTextureTypeColor', () => {
    it('should return hex color codes', () => {
      const albedoColor = getTextureTypeColor(TextureType.Albedo)
      expect(albedoColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(albedoColor).toBe('#3b82f6') // Blue
    })

    it('should return fallback color for invalid types', () => {
      expect(getTextureTypeColor(999 as TextureType)).toBe('#6b7280')
    })
  })

  describe('getTextureTypeIcon', () => {
    it('should return PrimeIcons classes', () => {
      const albedoIcon = getTextureTypeIcon(TextureType.Albedo)
      expect(albedoIcon).toBe('pi-palette')
    })

    it('should return fallback icon for invalid types', () => {
      expect(getTextureTypeIcon(999 as TextureType)).toBe('pi-image')
    })
  })

  describe('getAllTextureTypes', () => {
    it('should return array of all texture types', () => {
      const allTypes = getAllTextureTypes()

      expect(allTypes).toContain(TextureType.Albedo)
      expect(allTypes).toContain(TextureType.Normal)
      expect(allTypes).toContain(TextureType.Roughness)
      expect(allTypes).toContain(TextureType.Metallic)
      expect(allTypes).toContain(TextureType.AO)
      expect(allTypes).toContain(TextureType.Height)
      expect(allTypes).toContain(TextureType.Diffuse)
      expect(allTypes).toContain(TextureType.Specular)
      expect(allTypes).toContain(TextureType.Emissive)
      expect(allTypes).toContain(TextureType.Bump)
      expect(allTypes).toContain(TextureType.Alpha)
      expect(allTypes).toContain(TextureType.Displacement)
    })

    it('should return exactly 12 texture types', () => {
      expect(getAllTextureTypes()).toHaveLength(12)
    })

    it('should return only valid numeric enum values', () => {
      const allTypes = getAllTextureTypes()
      allTypes.forEach(type => {
        expect(typeof type).toBe('number')
        expect(type).toBeGreaterThanOrEqual(1)
        expect(type).toBeLessThanOrEqual(12)
      })
    })
  })

  describe('getTextureTypeOptions', () => {
    it('should return options array for dropdown/select components', () => {
      const options = getTextureTypeOptions()

      expect(Array.isArray(options)).toBe(true)
      expect(options.length).toBe(12)
    })

    it('should include label, value, color, and icon for each option', () => {
      const options = getTextureTypeOptions()

      options.forEach(option => {
        expect(option).toHaveProperty('label')
        expect(option).toHaveProperty('value')
        expect(option).toHaveProperty('color')
        expect(option).toHaveProperty('icon')
        expect(typeof option.label).toBe('string')
        expect(typeof option.value).toBe('number')
        expect(option.color).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(option.icon).toMatch(/^pi-/)
      })
    })

    it('should have Albedo option with correct properties', () => {
      const options = getTextureTypeOptions()
      const albedoOption = options.find(opt => opt.value === TextureType.Albedo)

      expect(albedoOption).toBeDefined()
      expect(albedoOption?.label).toBe('Albedo (Color)')
      expect(albedoOption?.color).toBe('#3b82f6')
      expect(albedoOption?.icon).toBe('pi-palette')
    })
  })
})

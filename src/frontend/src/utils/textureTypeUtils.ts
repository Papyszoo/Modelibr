import { TextureType } from '../types'

export interface TextureTypeInfo {
  label: string
  description: string
  color: string
  icon: string
}

// Texture type definitions with visual indicators
export const TEXTURE_TYPE_INFO: Record<TextureType, TextureTypeInfo> = {
  [TextureType.Albedo]: {
    label: 'Albedo',
    description: 'Base color or diffuse map - the main surface color',
    color: '#3b82f6', // Blue
    icon: 'pi-palette'
  },
  [TextureType.Normal]: {
    label: 'Normal',
    description: 'Normal map - surface detail through normals',
    color: '#10b981', // Green
    icon: 'pi-map'
  },
  [TextureType.Height]: {
    label: 'Height',
    description: 'Height or displacement map - surface geometry variation',
    color: '#8b5cf6', // Purple
    icon: 'pi-chart-line'
  },
  [TextureType.AO]: {
    label: 'AO',
    description: 'Ambient Occlusion map - shadow detail in surface crevices',
    color: '#374151', // Dark gray
    icon: 'pi-eye-slash'
  },
  [TextureType.Roughness]: {
    label: 'Roughness',
    description: 'Roughness map - surface micro-detail affecting reflections',
    color: '#f59e0b', // Orange/yellow
    icon: 'pi-circle'
  },
  [TextureType.Metallic]: {
    label: 'Metallic',
    description: 'Metallic map - defines metallic vs non-metallic areas',
    color: '#6b7280', // Silver/gray
    icon: 'pi-star-fill'
  },
  [TextureType.Diffuse]: {
    label: 'Diffuse',
    description: 'Diffuse map - traditional diffuse color (legacy name for Albedo)',
    color: '#ef4444', // Red
    icon: 'pi-sun'
  },
  [TextureType.Specular]: {
    label: 'Specular',
    description: 'Specular map - reflectivity and highlight intensity',
    color: '#06b6d4', // Cyan
    icon: 'pi-sparkles'
  }
}

export function getTextureTypeInfo(textureType: TextureType): TextureTypeInfo {
  return TEXTURE_TYPE_INFO[textureType]
}

export function getTextureTypeLabel(textureType: TextureType): string {
  return TEXTURE_TYPE_INFO[textureType]?.label || 'Unknown'
}

export function getTextureTypeColor(textureType: TextureType): string {
  return TEXTURE_TYPE_INFO[textureType]?.color || '#6b7280'
}

export function getTextureTypeIcon(textureType: TextureType): string {
  return TEXTURE_TYPE_INFO[textureType]?.icon || 'pi-image'
}

export function getAllTextureTypes(): TextureType[] {
  return Object.keys(TEXTURE_TYPE_INFO).map(key => parseInt(key) as TextureType).filter(key => !isNaN(key))
}

export function getTextureTypeOptions() {
  return getAllTextureTypes().map(type => ({
    label: getTextureTypeLabel(type),
    value: type,
    color: getTextureTypeColor(type),
    icon: getTextureTypeIcon(type)
  }))
}
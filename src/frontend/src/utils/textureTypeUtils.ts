import { TextureType } from '../types'

export interface TextureTypeInfo {
  label: string
  description: string
  color: string
  icon: string
}

// Texture type definitions with visual indicators
// Note: Diffuse and Specular have been removed (not PBR standard)
export const TEXTURE_TYPE_INFO: Partial<Record<TextureType, TextureTypeInfo>> =
  {
    [TextureType.SplitChannel]: {
      label: 'Split Channel Source',
      description: 'Source file for split channels',
      color: '#9ca3af',
      icon: 'pi-sitemap',
    },
    [TextureType.Albedo]: {
      label: 'Albedo (Color)',
      description: 'Base color map - the main surface color',
      color: '#3b82f6', // Blue
      icon: 'pi-palette',
    },
    [TextureType.Normal]: {
      label: 'Normal',
      description: 'Normal map - surface detail through normals',
      color: '#10b981', // Green
      icon: 'pi-map',
    },
    [TextureType.Height]: {
      label: 'Height',
      description:
        'Height map for parallax/displacement (exclusive with Bump/Displacement)',
      color: '#8b5cf6', // Purple
      icon: 'pi-chart-line',
    },
    [TextureType.AO]: {
      label: 'AO',
      description: 'Ambient Occlusion map - shadow detail in surface crevices',
      color: '#374151', // Dark gray
      icon: 'pi-eye-slash',
    },
    [TextureType.Roughness]: {
      label: 'Roughness',
      description: 'Roughness map - surface micro-detail affecting reflections',
      color: '#f59e0b', // Orange/yellow
      icon: 'pi-circle',
    },
    [TextureType.Metallic]: {
      label: 'Metallic',
      description: 'Metallic map - defines metallic vs non-metallic areas',
      color: '#6b7280', // Silver/gray
      icon: 'pi-star-fill',
    },
    [TextureType.Emissive]: {
      label: 'Emissive',
      description: 'Emissive map - areas where the mesh emits light',
      color: '#fbbf24', // Yellow
      icon: 'pi-sun',
    },
    [TextureType.Bump]: {
      label: 'Bump',
      description:
        'Bump map for surface detail (exclusive with Height/Displacement)',
      color: '#a78bfa', // Light purple
      icon: 'pi-chart-bar',
    },
    [TextureType.Alpha]: {
      label: 'Alpha',
      description: 'Alpha map - defines transparency across the surface',
      color: '#9ca3af', // Light gray
      icon: 'pi-filter',
    },
    [TextureType.Displacement]: {
      label: 'Displacement',
      description:
        'Displacement map for vertex displacement (exclusive with Height/Bump)',
      color: '#7c3aed', // Deep purple
      icon: 'pi-arrows-v',
    },
  }

// Height-related types are mutually exclusive
export const HEIGHT_RELATED_TYPES = [
  TextureType.Height,
  TextureType.Bump,
  TextureType.Displacement,
]

export function getTextureTypeInfo(textureType: TextureType): TextureTypeInfo {
  return (
    TEXTURE_TYPE_INFO[textureType] || {
      label: 'Unknown',
      description: 'Unknown Type',
      color: '#9ca3af',
      icon: 'pi-question',
    }
  )
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
  return Object.keys(TEXTURE_TYPE_INFO)
    .map(key => parseInt(key) as TextureType)
    .filter(key => !isNaN(key) && key !== TextureType.SplitChannel)
}

export function getTextureTypeOptions() {
  return getAllTextureTypes().map(type => ({
    label: getTextureTypeLabel(type),
    value: type,
    color: getTextureTypeColor(type),
    icon: getTextureTypeIcon(type),
  }))
}

/**
 * Check if a texture type is one of the mutually exclusive height-related types
 */
export function isHeightRelatedType(textureType: TextureType): boolean {
  return HEIGHT_RELATED_TYPES.includes(textureType)
}

/**
 * Get all texture types except Height/Displacement/Bump (for regular cards)
 */
export function getNonHeightTypes(): TextureType[] {
  return getAllTextureTypes().filter(type => !isHeightRelatedType(type))
}

/**
 * Get Height mode dropdown options
 */
export function getHeightModeOptions() {
  return HEIGHT_RELATED_TYPES.map(type => ({
    label: getTextureTypeLabel(type),
    value: type,
    color: getTextureTypeColor(type),
    icon: getTextureTypeIcon(type),
  }))
}

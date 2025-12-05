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
    label: 'Albedo (Color)',
    description: 'Base color or diffuse map - the main surface color',
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
    description: 'Height or displacement map - surface geometry variation',
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
  [TextureType.Diffuse]: {
    label: 'Diffuse',
    description:
      'Diffuse map - traditional diffuse color (legacy name for Albedo)',
    color: '#ef4444', // Red
    icon: 'pi-sun',
  },
  [TextureType.Specular]: {
    label: 'Specular',
    description: 'Specular map - reflectivity and highlight intensity',
    color: '#06b6d4', // Cyan
    icon: 'pi-sparkles',
  },
  [TextureType.Emissive]: {
    label: 'Emissive',
    description: 'Emissive map - areas where the mesh emits light',
    color: '#fbbf24', // Yellow
    icon: 'pi-sun',
  },
  [TextureType.Bump]: {
    label: 'Bump',
    description: 'Bump map - simulates surface details by altering normals',
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
    description: 'Displacement map - actual geometric displacement of vertices',
    color: '#7c3aed', // Deep purple
    icon: 'pi-arrows-v',
  },
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
  return Object.keys(TEXTURE_TYPE_INFO)
    .map(key => parseInt(key) as TextureType)
    .filter(key => !isNaN(key))
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
 * Get the albedo (or diffuse as fallback) texture URL for a texture set
 * Used for displaying texture set previews
 */
export function getAlbedoTextureUrl(
  textureSet: {
    textures?: Array<{ textureType: TextureType; fileId: number }>
  },
  getFileUrl: (fileId: string) => string
): string | null {
  const albedo = textureSet.textures?.find(
    t => t.textureType === TextureType.Albedo
  )
  const diffuse = textureSet.textures?.find(
    t => t.textureType === TextureType.Diffuse
  )
  const texture = albedo || diffuse
  if (texture) {
    return getFileUrl(texture.fileId.toString())
  }
  return null
}

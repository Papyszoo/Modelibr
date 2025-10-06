import { Tab } from '../types'

// Helper function to generate tab labels
export function getTabLabel(type: Tab['type'], modelId?: string, packId?: string): string {
  switch (type) {
    case 'modelList':
      return 'Models'
    case 'modelViewer':
      return modelId ? `Model ${modelId}` : 'Model Viewer'
    case 'texture':
      return 'Textures'
    case 'texturePacks':
      return 'Texture Packs'
    case 'texturePackViewer':
      return packId ? `Pack ${packId}` : 'Texture Pack'
    case 'animation':
      return 'Animations'
    default:
      return 'Unknown'
  }
}

// Helper function to parse compact tab format
export function parseCompactTabFormat(
  value: string,
  defaultValue: Tab[] = []
): Tab[] {
  if (!value) return defaultValue

  // Support legacy JSON format for backward compatibility
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : defaultValue
    } catch {
      return defaultValue
    }
  }

  // Parse compact format: "type" or "type:id", separated by commas
  try {
    return value.split(',').map(tabSpec => {
      const [type, id] = tabSpec.split(':')
      const tabType = type as Tab['type']

      // Validate tab type
      if (
        !['modelList', 'modelViewer', 'texture', 'animation', 'texturePacks', 'texturePackViewer'].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${type}`)
      }

      // Handle model viewer tabs
      if (tabType === 'modelViewer' && id) {
        return {
          id: `model-${id}`,
          type: tabType,
          label: getTabLabel(tabType, id),
          modelId: id,
        }
      }

      // Handle texture pack viewer tabs
      if (tabType === 'texturePackViewer' && id) {
        return {
          id: `pack-${id}`,
          type: tabType,
          label: getTabLabel(tabType, undefined, id),
          packId: id,
        }
      }

      // Handle simple tabs (no ID)
      return {
        id: tabType,
        type: tabType,
        label: getTabLabel(tabType),
      }
    })
  } catch {
    return defaultValue
  }
}

// Helper function to serialize to compact format
export function serializeToCompactFormat(tabs: Tab[]): string {
  return tabs
    .map(tab => {
      if (tab.modelId) return `${tab.type}:${tab.modelId}`
      if (tab.packId) return `${tab.type}:${tab.packId}`
      return tab.type
    })
    .join(',')
}

import { Tab } from '../types'

// Helper function to generate tab labels
export function getTabLabel(
  type: Tab['type'],
  modelId?: string,
  setId?: string,
  packId?: string,
  stageId?: string
): string {
  switch (type) {
    case 'modelList':
      return 'Models'
    case 'modelViewer':
      return modelId ? `Model ${modelId}` : 'Model Viewer'
    case 'texture':
      return 'Textures'
    case 'textureSets':
      return 'Texture Sets'
    case 'textureSetViewer':
      return setId ? `Set ${setId}` : 'Texture Set'
    case 'packs':
      return 'Packs'
    case 'packViewer':
      return packId ? `Pack ${packId}` : 'Pack Viewer'
    case 'stageList':
      return 'Stages'
    case 'stageEditor':
      return stageId ? `Stage ${stageId}` : 'Stage Editor'
    case 'animation':
      return 'Animations'
    case 'history':
      return 'History'
    case 'settings':
      return 'Settings'
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
        ![
          'modelList',
          'modelViewer',
          'texture',
          'animation',
          'textureSets',
          'textureSetViewer',
          'packs',
          'packViewer',
          'stageList',
          'stageEditor',
          'history',
          'settings',
        ].includes(tabType)
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

      // Handle texture set viewer tabs
      if (tabType === 'textureSetViewer' && id) {
        return {
          id: `set-${id}`,
          type: tabType,
          label: getTabLabel(tabType, undefined, id),
          setId: id,
        }
      }

      // Handle pack viewer tabs
      if (tabType === 'packViewer' && id) {
        return {
          id: `pack-${id}`,
          type: tabType,
          label: getTabLabel(tabType, undefined, undefined, id),
          packId: id,
        }
      }

      // Handle stage editor tabs
      if (tabType === 'stageEditor' && id) {
        return {
          id: `stage-${id}`,
          type: tabType,
          label: getTabLabel(tabType, undefined, undefined, undefined, id),
          stageId: id,
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
      if (tab.setId) return `${tab.type}:${tab.setId}`
      if (tab.packId) return `${tab.type}:${tab.packId}`
      if (tab.stageId) return `${tab.type}:${tab.stageId}`
      return tab.type
    })
    .join(',')
}

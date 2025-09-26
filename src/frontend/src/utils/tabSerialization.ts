import { Tab } from '../types'

// Helper function to generate tab labels
export function getTabLabel(type: Tab['type'], modelId?: string): string {
  switch (type) {
    case 'modelList':
      return 'Models'
    case 'modelViewer':
      return modelId ? `Model ${modelId}` : 'Model Viewer'
    case 'texture':
      return 'Textures'
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

  // Parse compact format: "type" or "type:modelId", separated by commas
  try {
    return value.split(',').map((tabSpec, index) => {
      const [type, modelId] = tabSpec.split(':')
      const tabType = type as Tab['type']

      // Validate tab type
      if (
        !['modelList', 'modelViewer', 'texture', 'animation'].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${type}`)
      }

      return {
        id: modelId
          ? `model-${modelId}-${Date.now() + index}`
          : `${tabType}-${Date.now() + index}`,
        type: tabType,
        label: getTabLabel(tabType, modelId),
        modelId: modelId || undefined,
      }
    })
  } catch {
    return defaultValue
  }
}

// Helper function to serialize to compact format
export function serializeToCompactFormat(tabs: Tab[]): string {
  return tabs
    .map(tab => (tab.modelId ? `${tab.type}:${tab.modelId}` : tab.type))
    .join(',')
}

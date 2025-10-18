import { Tab } from '../types'

// Helper function to generate tab labels
export function getTabLabel(
  type: Tab['type'],
  modelId?: string,
  setId?: string,
  packId?: string,
  projectId?: string,
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
    case 'projects':
      return 'Projects'
    case 'projectViewer':
      return projectId ? `Project ${projectId}` : 'Project Viewer'
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

  // Parse compact format: tab IDs separated by commas
  try {
    const seen = new Set<string>()
    const tabs: Tab[] = []

    for (const tabId of value.split(',')) {
      // Skip if already seen (deduplicate)
      if (seen.has(tabId)) {
        continue
      }
      seen.add(tabId)

      let tab: Tab

      // Handle model viewer tabs (e.g., "model-123")
      if (tabId.startsWith('model-')) {
        const modelId = tabId.substring(6)
        tab = {
          id: tabId,
          type: 'modelViewer',
          label: getTabLabel('modelViewer', modelId),
          modelId,
        }
      }
      // Handle texture set viewer tabs (e.g., "set-123")
      else if (tabId.startsWith('set-')) {
        const setId = tabId.substring(4)
        tab = {
          id: tabId,
          type: 'textureSetViewer',
          label: getTabLabel('textureSetViewer', undefined, setId),
          setId,
        }
      }
      // Handle pack viewer tabs (e.g., "pack-123")
      else if (tabId.startsWith('pack-')) {
        const packId = tabId.substring(5)
        tab = {
          id: tabId,
          type: 'packViewer',
          label: getTabLabel('packViewer', undefined, undefined, packId),
          packId,
        }
      }
      // Handle project viewer tabs (e.g., "project-123")
      else if (tabId.startsWith('project-')) {
        const projectId = tabId.substring(8)
        tab = {
          id: tabId,
          type: 'projectViewer',
          label: getTabLabel(
            'projectViewer',
            undefined,
            undefined,
            undefined,
            projectId
          ),
          projectId,
        }
      }
      // Handle stage editor tabs (e.g., "stage-123")
      else if (tabId.startsWith('stage-')) {
        const stageId = tabId.substring(6)
        tab = {
          id: tabId,
          type: 'stageEditor',
          label: getTabLabel(
            'stageEditor',
            undefined,
            undefined,
            undefined,
            undefined,
            stageId
          ),
          stageId,
        }
      }
      // Handle simple tabs (use tabId as type)
      else {
        const tabType = tabId as Tab['type']

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
            'projects',
            'projectViewer',
            'stageList',
            'stageEditor',
            'history',
            'settings',
          ].includes(tabType)
        ) {
          throw new Error(`Invalid tab type: ${tabId}`)
        }

        tab = {
          id: tabId,
          type: tabType,
          label: getTabLabel(tabType),
        }
      }

      tabs.push(tab)
    }

    return tabs
  } catch {
    return defaultValue
  }
}

export function serializeToCompactFormat(tabs: Tab[]): string {
  const seen = new Set<string>()
  const uniqueTabs = tabs.filter(tab => {
    if (seen.has(tab.id)) {
      return false
    }
    seen.add(tab.id)
    return true
  })

  return uniqueTabs.map(tab => tab.id).join(',')
}

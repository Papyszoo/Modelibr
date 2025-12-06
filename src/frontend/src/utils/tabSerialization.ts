import { Tab } from '../types'
import ApiClient from '../services/ApiClient'

interface TabLabelOptions {
  modelId?: string
  setId?: string
  packId?: string
  projectId?: string
  stageId?: string
  modelName?: string
  setName?: string
  packName?: string
  projectName?: string
  stageName?: string
}

// Helper function to generate tab labels
export function getTabLabel(
  type: Tab['type'],
  options: TabLabelOptions = {}
): string {
  const {
    modelId,
    setId,
    packId,
    projectId,
    stageId,
    modelName,
    setName,
    packName,
    projectName,
    stageName,
  } = options
  switch (type) {
    case 'modelList':
      return 'Models'
    case 'modelViewer':
      if (modelName) return modelName
      return modelId ? `Model ${modelId}` : 'Model Viewer'
    case 'textureSets':
      return 'Texture Sets'
    case 'textureSetViewer':
      if (setName) return setName
      return setId ? `Set ${setId}` : 'Texture Set'
    case 'packs':
      return 'Packs'
    case 'packViewer':
      if (packName) return packName
      return packId ? `Pack ${packId}` : 'Pack Viewer'
    case 'projects':
      return 'Projects'
    case 'projectViewer':
      if (projectName) return projectName
      return projectId ? `Project ${projectId}` : 'Project Viewer'
    case 'sprites':
      return 'Sprites'
    case 'stageList':
      return 'Stages'
    case 'stageEditor':
      if (stageName) return stageName
      return stageId ? `Stage ${stageId}` : 'Stage Editor'
    case 'history':
      return 'History'
    case 'settings':
      return 'Settings'
    case 'recycledFiles':
      return 'Recycled Files'
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

      // Handle model viewer tabs (e.g., "model-123")
      if (tabId.startsWith('model-')) {
        const modelId = tabId.substring(6)
        tabs.push({
          id: tabId,
          type: 'modelViewer',
          label: getTabLabel('modelViewer', { modelId }),
          modelId,
        })
        continue
      }

      // Handle texture set viewer tabs (e.g., "set-123")
      if (tabId.startsWith('set-')) {
        const setId = tabId.substring(4)
        tabs.push({
          id: tabId,
          type: 'textureSetViewer',
          label: getTabLabel('textureSetViewer', { setId }),
          setId,
        })
        continue
      }

      // Handle pack viewer tabs (e.g., "pack-123")
      if (tabId.startsWith('pack-')) {
        const packId = tabId.substring(5)
        tabs.push({
          id: tabId,
          type: 'packViewer',
          label: getTabLabel('packViewer', { packId }),
          packId,
        })
        continue
      }

      // Handle project viewer tabs (e.g., "project-123")
      if (tabId.startsWith('project-')) {
        const projectId = tabId.substring(8)
        tabs.push({
          id: tabId,
          type: 'projectViewer',
          label: getTabLabel('projectViewer', { projectId }),
          projectId,
        })
        continue
      }

      // Handle stage editor tabs (e.g., "stage-123")
      if (tabId.startsWith('stage-')) {
        const stageId = tabId.substring(6)
        tabs.push({
          id: tabId,
          type: 'stageEditor',
          label: getTabLabel('stageEditor', { stageId }),
          stageId,
        })
        continue
      }

      // Handle simple tabs (use tabId as type)
      const tabType = tabId as Tab['type']

      // Validate tab type
      if (
        ![
          'modelList',
          'modelViewer',
          'textureSets',
          'textureSetViewer',
          'packs',
          'packViewer',
          'projects',
          'projectViewer',
          'sprites',
          'stageList',
          'stageEditor',
          'history',
          'settings',
          'recycledFiles',
        ].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${tabId}`)
      }

      tabs.push({
        id: tabId,
        type: tabType,
        label: getTabLabel(tabType),
      })
    }

    return tabs
  } catch {
    return defaultValue
  }
}

// Async helper function to parse compact tab format and fetch names from database
export async function parseCompactTabFormatAsync(
  value: string,
  defaultValue: Tab[] = []
): Promise<Tab[]> {
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

      // Handle model viewer tabs (e.g., "model-123")
      if (tabId.startsWith('model-')) {
        const modelId = tabId.substring(6)
        let modelName: string | undefined
        try {
          const model = await ApiClient.getModelById(modelId)
          modelName = model.name
        } catch {
          // If API call fails, fall back to ID-based label
        }
        tabs.push({
          id: tabId,
          type: 'modelViewer',
          label: getTabLabel('modelViewer', { modelId, modelName }),
          modelId,
        })
        continue
      }

      // Handle texture set viewer tabs (e.g., "set-123")
      if (tabId.startsWith('set-')) {
        const setId = tabId.substring(4)
        let setName: string | undefined
        try {
          const textureSet = await ApiClient.getTextureSetById(Number(setId))
          setName = textureSet.name
        } catch {
          // If API call fails, fall back to ID-based label
        }
        tabs.push({
          id: tabId,
          type: 'textureSetViewer',
          label: getTabLabel('textureSetViewer', { setId, setName }),
          setId,
        })
        continue
      }

      // Handle pack viewer tabs (e.g., "pack-123")
      if (tabId.startsWith('pack-')) {
        const packId = tabId.substring(5)
        let packName: string | undefined
        try {
          const pack = await ApiClient.getPackById(Number(packId))
          packName = pack.name
        } catch {
          // If API call fails, fall back to ID-based label
        }
        tabs.push({
          id: tabId,
          type: 'packViewer',
          label: getTabLabel('packViewer', { packId, packName }),
          packId,
        })
        continue
      }

      // Handle project viewer tabs (e.g., "project-123")
      if (tabId.startsWith('project-')) {
        const projectId = tabId.substring(8)
        let projectName: string | undefined
        try {
          const project = await ApiClient.getProjectById(Number(projectId))
          projectName = project.name
        } catch {
          // If API call fails, fall back to ID-based label
        }
        tabs.push({
          id: tabId,
          type: 'projectViewer',
          label: getTabLabel('projectViewer', { projectId, projectName }),
          projectId,
        })
        continue
      }

      // Handle stage editor tabs (e.g., "stage-123")
      if (tabId.startsWith('stage-')) {
        const stageId = tabId.substring(6)
        let stageName: string | undefined
        try {
          const stage = await ApiClient.getStageById(Number(stageId))
          stageName = stage.name
        } catch {
          // If API call fails, fall back to ID-based label
        }
        tabs.push({
          id: tabId,
          type: 'stageEditor',
          label: getTabLabel('stageEditor', { stageId, stageName }),
          stageId,
        })
        continue
      }

      // Handle simple tabs (use tabId as type)
      const tabType = tabId as Tab['type']

      // Validate tab type
      if (
        ![
          'modelList',
          'modelViewer',
          'textureSets',
          'textureSetViewer',
          'packs',
          'packViewer',
          'projects',
          'projectViewer',
          'sprites',
          'stageList',
          'stageEditor',
          'history',
          'settings',
          'recycledFiles',
        ].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${tabId}`)
      }

      tabs.push({
        id: tabId,
        type: tabType,
        label: getTabLabel(tabType),
      })
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

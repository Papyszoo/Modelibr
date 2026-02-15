import { Tab } from '@/types'
import { createTab } from '@/stores/navigationStore'
import { getModelById } from '@/features/models/api/modelApi'
import { getTextureSetById } from '@/features/texture-set/api/textureSetApi'
import { getPackById } from '@/features/pack/api/packApi'
import { getProjectById } from '@/features/project/api/projectApi'
import { getStageById } from '@/features/stage-editor/api/stageApi'

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
    case 'sounds':
      return 'Sounds'
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
      if (!Array.isArray(parsed)) return defaultValue
      // Ensure legacy tabs have the new required fields
      return parsed.map((t: Partial<Tab>) => ({
        ...t,
        params: t.params ?? {},
        internalUiState: t.internalUiState ?? {},
      })) as Tab[]
    } catch {
      return defaultValue
    }
  }

  // Parse compact format: tab IDs separated by commas
  try {
    const seen = new Set<string>()
    const tabs: Tab[] = []

    for (const tabId of value.split(',')) {
      if (seen.has(tabId)) continue
      seen.add(tabId)

      if (tabId.startsWith('model-')) {
        tabs.push(createTab('modelViewer', tabId.substring(6)))
        continue
      }
      if (tabId.startsWith('set-')) {
        tabs.push(createTab('textureSetViewer', tabId.substring(4)))
        continue
      }
      if (tabId.startsWith('pack-')) {
        tabs.push(createTab('packViewer', tabId.substring(5)))
        continue
      }
      if (tabId.startsWith('project-')) {
        tabs.push(createTab('projectViewer', tabId.substring(8)))
        continue
      }
      if (tabId.startsWith('stage-')) {
        tabs.push(createTab('stageEditor', tabId.substring(6)))
        continue
      }

      const tabType = tabId as Tab['type']
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
          'sounds',
          'stageList',
          'stageEditor',
          'history',
          'settings',
          'recycledFiles',
        ].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${tabId}`)
      }

      tabs.push(createTab(tabType))
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
      if (!Array.isArray(parsed)) return defaultValue
      return parsed.map((t: Partial<Tab>) => ({
        ...t,
        params: t.params ?? {},
        internalUiState: t.internalUiState ?? {},
      })) as Tab[]
    } catch {
      return defaultValue
    }
  }

  // Parse compact format: tab IDs separated by commas
  try {
    const seen = new Set<string>()
    const tabs: Tab[] = []

    for (const tabId of value.split(',')) {
      if (seen.has(tabId)) continue
      seen.add(tabId)

      if (tabId.startsWith('model-')) {
        const modelId = tabId.substring(6)
        let modelName: string | undefined
        try {
          const model = await getModelById(modelId)
          modelName = model.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('modelViewer', modelId, modelName))
        continue
      }

      if (tabId.startsWith('set-')) {
        const setId = tabId.substring(4)
        let setName: string | undefined
        try {
          const textureSet = await getTextureSetById(Number(setId))
          setName = textureSet.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('textureSetViewer', setId, setName))
        continue
      }

      if (tabId.startsWith('pack-')) {
        const packId = tabId.substring(5)
        let packName: string | undefined
        try {
          const pack = await getPackById(Number(packId))
          packName = pack.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('packViewer', packId, packName))
        continue
      }

      if (tabId.startsWith('project-')) {
        const projectId = tabId.substring(8)
        let projectName: string | undefined
        try {
          const project = await getProjectById(Number(projectId))
          projectName = project.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('projectViewer', projectId, projectName))
        continue
      }

      if (tabId.startsWith('stage-')) {
        const stageId = tabId.substring(6)
        let stageName: string | undefined
        try {
          const stage = await getStageById(Number(stageId))
          stageName = stage.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('stageEditor', stageId, stageName))
        continue
      }

      const tabType = tabId as Tab['type']
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
          'sounds',
          'stageList',
          'stageEditor',
          'history',
          'settings',
          'recycledFiles',
        ].includes(tabType)
      ) {
        throw new Error(`Invalid tab type: ${tabId}`)
      }

      tabs.push(createTab(tabType))
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

import { getEnvironmentMapById } from '@/features/environment-map/api/environmentMapApi'
import { getModelById } from '@/features/models/api/modelApi'
import { getPackById } from '@/features/pack/api/packApi'
import { getProjectById } from '@/features/project/api/projectApi'
import { getSceneById } from '@/features/scenes/api/scenesApi'
import { getScriptById } from '@/features/scripts/api/scriptApi'
import { getTextureSetById } from '@/features/texture-set/api/textureSetApi'
import { getVfx } from '@/features/vfx/api/vfxApi'
import { createTab } from '@/stores/navigationStore'
import { type Tab } from '@/types'

// Re-export getTabLabel from its canonical location for backward compatibility
export { getTabLabel } from '@/stores/navigationStore'

/**
 * Tab kinds removed from the app. A session saved before the removal still
 * names them, so both parsers drop those entries and keep the rest of the
 * session instead of failing the whole parse (which would silently replace
 * every open tab with the default layout).
 */
const REMOVED_TAB_TYPES = new Set(['stageList', 'stageEditor'])

const REMOVED_TAB_PREFIXES = ['stage-']

function isRemovedTabId(tabId: string): boolean {
  return (
    REMOVED_TAB_TYPES.has(tabId) ||
    REMOVED_TAB_PREFIXES.some(prefix => tabId.startsWith(prefix))
  )
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
      // Ensure legacy tabs have the new required fields, and drop removed kinds.
      return parsed
        .filter((t: Partial<Tab>) => !REMOVED_TAB_TYPES.has(t.type as string))
        .map((t: Partial<Tab>) => ({
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

      // A session from before the Stages removal - drop the entry, keep the rest.
      if (isRemovedTabId(tabId)) continue

      if (tabId.startsWith('model-')) {
        tabs.push(createTab('modelViewer', tabId.substring(6)))
        continue
      }
      if (tabId.startsWith('set-')) {
        tabs.push(createTab('textureSetViewer', tabId.substring(4)))
        continue
      }
      if (tabId.startsWith('environment-map-')) {
        tabs.push(createTab('environmentMapViewer', tabId.substring(16)))
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
      if (tabId.startsWith('script-')) {
        tabs.push(createTab('scriptViewer', tabId.substring(7)))
        continue
      }
      if (tabId.startsWith('scene-')) {
        tabs.push(createTab('sceneEditor', tabId.substring(6)))
        continue
      }
      if (tabId.startsWith('vfx-')) {
        tabs.push(createTab('vfxEditor', tabId.substring(4)))
        continue
      }

      // Legacy URL id from before the texture-set split.
      const tabType = (
        tabId === 'textureSets' ? 'modelTextures' : tabId
      ) as Tab['type']
      if (
        ![
          'modelList',
          'modelViewer',
          'globalMaterials',
          'pbrMaterials',
          'modelTextures',
          'textureSetViewer',
          'environmentMaps',
          'environmentMapViewer',
          'packs',
          'packViewer',
          'projects',
          'projectViewer',
          'sprites',
          'sounds',
          'scripts',
          'scenes',
          'sceneEditor',
          'vfxList',
          'vfxEditor',
          'assetStore',
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
      return parsed
        .filter((t: Partial<Tab>) => !REMOVED_TAB_TYPES.has(t.type as string))
        .map((t: Partial<Tab>) => ({
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

      // A session from before the Stages removal - drop the entry, keep the rest.
      if (isRemovedTabId(tabId)) continue

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

      if (tabId.startsWith('environment-map-')) {
        const environmentMapId = tabId.substring(16)
        let environmentMapName: string | undefined
        try {
          const environmentMap = await getEnvironmentMapById(
            Number(environmentMapId)
          )
          environmentMapName = environmentMap.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(
          createTab(
            'environmentMapViewer',
            environmentMapId,
            environmentMapName
          )
        )
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

      if (tabId.startsWith('script-')) {
        const scriptId = tabId.substring(7)
        let scriptName: string | undefined
        try {
          const script = await getScriptById(Number(scriptId))
          scriptName = script.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('scriptViewer', scriptId, scriptName))
        continue
      }

      if (tabId.startsWith('scene-')) {
        const sceneId = tabId.substring(6)
        let sceneName: string | undefined
        try {
          const scene = await getSceneById(Number(sceneId))
          sceneName = scene.scene.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('sceneEditor', sceneId, sceneName))
        continue
      }

      if (tabId.startsWith('vfx-')) {
        const vfxId = tabId.substring(4)
        let vfxName: string | undefined
        try {
          const vfx = await getVfx(Number(vfxId))
          vfxName = vfx.name
        } catch {
          /* fall back to ID-based label */
        }
        tabs.push(createTab('vfxEditor', vfxId, vfxName))
        continue
      }

      // Legacy URL id from before the texture-set split.
      const tabType = (
        tabId === 'textureSets' ? 'modelTextures' : tabId
      ) as Tab['type']
      if (
        ![
          'modelList',
          'modelViewer',
          'globalMaterials',
          'pbrMaterials',
          'modelTextures',
          'textureSetViewer',
          'environmentMaps',
          'environmentMapViewer',
          'packs',
          'packViewer',
          'projects',
          'projectViewer',
          'sprites',
          'sounds',
          'scripts',
          'scenes',
          'sceneEditor',
          'vfxList',
          'vfxEditor',
          'assetStore',
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

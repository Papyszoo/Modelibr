import { getTabIcon } from '@/components/layout/tabIcons'
import { type TabType } from '@/types'

// Every kind the dock can show. Typed as a Record so a new TabType that is
// missing here fails to compile instead of silently skipping the check.
const ALL_KINDS: Record<TabType, true> = {
  newTab: true,
  modelList: true,
  modelViewer: true,
  globalMaterials: true,
  pbrMaterials: true,
  modelTextures: true,
  textureSetViewer: true,
  environmentMaps: true,
  environmentMapViewer: true,
  packs: true,
  packViewer: true,
  projects: true,
  projectViewer: true,
  sprites: true,
  sounds: true,
  scripts: true,
  scriptViewer: true,
  scenes: true,
  sceneEditor: true,
  vfxList: true,
  vfxEditor: true,
  assetStore: true,
  settings: true,
  history: true,
  recycledFiles: true,
}

describe('getTabIcon', () => {
  // The VFX gallery and an open effect (and Scenes and a scene, Models and a
  // model) shared one glyph, so the dock showed identical buttons that only a
  // hover could tell apart.
  it('gives every tab kind its own glyph', () => {
    const kinds = Object.keys(ALL_KINDS) as TabType[]
    const owners = new Map<string, TabType>()
    for (const kind of kinds) {
      const icon = getTabIcon(kind)
      expect([kind, owners.get(icon)]).toEqual([kind, undefined])
      owners.set(icon, kind)
    }
  })
})

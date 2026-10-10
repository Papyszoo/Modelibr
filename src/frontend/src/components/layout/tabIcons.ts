import { type TabType } from '@/types'

/**
 * One PrimeIcons glyph per tab kind, shared by the dock, its pinned entries and
 * the New Tab page's recently closed list.
 *
 * Every kind gets its own glyph: a gallery and one item from it (VFX and an
 * effect, Scenes and a scene) used to share one, so a dock holding both read
 * as two identical buttons.
 */
const TAB_ICONS: Record<TabType, string> = {
  newTab: 'pi-home',
  modelList: 'pi-list',
  modelViewer: 'pi-box',
  globalMaterials: 'pi-palette',
  pbrMaterials: 'pi-circle-fill',
  modelTextures: 'pi-images',
  textureSetViewer: 'pi-clone',
  environmentMaps: 'pi-globe',
  environmentMapViewer: 'pi-sun',
  packs: 'pi-inbox',
  packViewer: 'pi-folder-open',
  projects: 'pi-briefcase',
  projectViewer: 'pi-clipboard',
  sprites: 'pi-image',
  sounds: 'pi-volume-up',
  scripts: 'pi-code',
  scriptViewer: 'pi-file-edit',
  stageList: 'pi-th-large',
  stageEditor: 'pi-table',
  scenes: 'pi-map',
  sceneEditor: 'pi-sitemap',
  vfxList: 'pi-objects-column',
  vfxEditor: 'pi-sparkles',
  assetStore: 'pi-shopping-bag',
  settings: 'pi-cog',
  history: 'pi-history',
  recycledFiles: 'pi-trash',
}

/** The glyph class for a tab kind, without the `pi` base class. */
export function getTabIcon(type: TabType): string {
  return TAB_ICONS[type] ?? 'pi-file'
}

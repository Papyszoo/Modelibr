export type TabType =
  | 'newTab'
  | 'modelList'
  | 'modelViewer'
  | 'textureSets'
  | 'globalMaterials'
  | 'modelTextures'
  | 'textureSetViewer'
  | 'environmentMaps'
  | 'environmentMapViewer'
  | 'packs'
  | 'packViewer'
  | 'projects'
  | 'projectViewer'
  | 'sprites'
  | 'sounds'
  | 'scripts'
  | 'scriptViewer'
  | 'stageList'
  | 'stageEditor'
  | 'settings'
  | 'history'
  | 'recycledFiles'

export interface Tab {
  id: string
  type: TabType
  label?: string
  /** Minimal identifiers — React Query fetches entity data at render time */
  params: Record<string, string>
  /** UI-only state persisted per-tab (active sub-tab, scroll position, etc.) */
  internalUiState: Record<string, unknown>
  // Legacy convenience accessors (derived from params)
  modelId?: string
  setId?: string
  environmentMapId?: string
  packId?: string
  projectId?: string
  stageId?: string
  scriptId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

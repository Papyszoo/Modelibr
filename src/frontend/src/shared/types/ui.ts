export type TabType =
  | 'modelList'
  | 'modelViewer'
  | 'textureSets'
  | 'textureSetViewer'
  | 'packs'
  | 'packViewer'
  | 'projects'
  | 'projectViewer'
  | 'sprites'
  | 'sounds'
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
  packId?: string
  projectId?: string
  stageId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

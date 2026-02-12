export interface Tab {
  id: string
  type:
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
  label?: string
  modelId?: string
  setId?: string
  packId?: string
  projectId?: string
  stageId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

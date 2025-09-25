// Common type definitions for the frontend

export interface Tab {
  id: string
  type: 'modelList' | 'modelViewer' | 'texture' | 'animation'
  label?: string
  modelId?: string
}

export interface SplitterEvent {
  sizes: number[]
}

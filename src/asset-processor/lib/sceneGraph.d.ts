export declare const SCENE_GRAPH_EXTRACTOR_VERSION: number

export interface SceneGraphOptions {
  sourceFormat?: string
}

export declare function extractSceneGraph(
  root: unknown,
  THREE: unknown,
  options?: SceneGraphOptions
): {
  extractorVersion: number
  geometryHashVersion: number
  partPathVersion: number
  parts: Array<Record<string, unknown>>
  rollups: Record<string, unknown>
  warnings: string[]
}

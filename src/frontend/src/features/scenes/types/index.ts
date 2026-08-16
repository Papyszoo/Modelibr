import type {
  SceneAssetRef,
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  ScenePrimitive,
  SceneTransform,
  Vec3,
} from '../api/sceneContract.generated'

export type {
  SceneAssetRef,
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  ScenePrimitive,
  SceneTransform,
  Vec3,
}

/** An axis-aligned box in world space, metres. */
export interface Aabb {
  min: Vec3
  max: Vec3
}

/**
 * Identity and size of a scene without its document.
 *
 * `nodeCount`/`lightCount` are -1 when the server could not read the scene's
 * stored document. The list still shows the scene - hiding it is how a user
 * loses one without being told.
 */
export interface SceneSummary {
  id: number
  name: string
  description: string | null
  schemaVersion: number
  revision: number
  nodeCount: number
  lightCount: number
  createdAt: string
  updatedAt: string
}

/**
 * One node plus the spatial truth the server derived for it. `footprint` and
 * `sourceDimensions` are null when the referenced asset has never been
 * extracted, which is why the editor shows "bounds unknown" rather than drawing
 * a box it made up.
 */
export interface SceneNodeView {
  nodeId: string
  name: string | null
  slotId: string | null
  asset: SceneAssetRef | null
  primitive: ScenePrimitive | null
  transform: SceneTransform
  material: SceneMaterialBinding | null
  visible: boolean
  footprint: Aabb | null
  sourceDimensions: Vec3 | null
  originConvention: string | null
  gridSize: number | null
  groundOffset: number | null
}

/**
 * What the server knows about an asset before it is placed.
 *
 * `groundedYAtOrigin` is the Y that rests it on y=0 unrotated and unscaled, or
 * null when the asset has never been extracted - in which case the editor
 * places it at 0 and says the bounds are unknown rather than guessing.
 */
export interface SceneAssetFacts {
  assetType: string
  assetId: number
  versionId: number | null
  sourceDimensions: Vec3 | null
  originConvention: string | null
  gridSize: number | null
  groundedYAtOrigin: number | null
}

export interface SceneOverlap {
  nodeIdA: string
  nodeIdB: string
  intersectionVolume: number
}

export interface SceneScaleWarning {
  nodeId: string
  code: string
  message: string
}

/** A scene, its document, and everything the server derived from the two. */
export interface SceneView {
  scene: SceneSummary
  document: SceneDocument
  nodes: SceneNodeView[]
  overlaps: SceneOverlap[]
  scaleWarnings: SceneScaleWarning[]
}

import type {
  SceneAnchor,
  SceneAssetRef,
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  ScenePrimitive,
  SceneStage,
  SceneTransform,
  Vec3,
} from '../api/sceneContract.generated'

export type {
  SceneAnchor,
  SceneAssetRef,
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  ScenePrimitive,
  SceneStage,
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
  /**
   * How far the scene has deliberately been taken, or null when it is not being
   * authored in stages. Lifted out of the document so a list can show it
   * without parsing one.
   */
  stage: SceneStage | null
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
  /**
   * The measured origin as a 0..1 fraction of the asset's own bounds per axis -
   * what `originConvention` is a three-way label for, and null only when it was
   * never measured. The selection outline is drawn from this so it stays the
   * same box the server's overlap check uses.
   */
  originInBounds: Vec3 | null
  /**
   * The placement rules the node carries, as the server applies them: whether it
   * is being held on the ground, what it rests on, and what it is kept facing.
   * These are why a node can sit somewhere other than the position last written
   * to it.
   */
  groundSnap: boolean
  /**
   * Declared to hang with nothing under it - the third answer, beside the
   * ground and an anchor, to "what holds this up". Without it a pendant lamp is
   * reported as floating for the life of the scene.
   */
  suspended: boolean
  faceToward: Vec3 | null
  /** Always populated - the assumed axis when the node never declared one. */
  frontAxis: string | null
  anchor: SceneAnchor | null
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
  /** See `SceneNodeView.originInBounds`. */
  originInBounds: Vec3 | null
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

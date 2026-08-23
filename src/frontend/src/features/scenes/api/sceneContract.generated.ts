// GENERATED FILE - DO NOT EDIT.
//
// Emitted from the C# scene contract (Domain/Scenes/SceneDocument.cs) by
// SceneContractTypeScript. Change the C# types and regenerate; editing this file
// by hand puts the editor and the server on different schemas, which is exactly
// what generating it prevents. SceneContractTypeScriptTests fails the build on drift.

/** The only schema version this build reads or writes. */
export const SCENE_SCHEMA_VERSION = 1

/** Asset families a scene node may reference. */
export const SCENE_ASSET_TYPES = ['Model', 'Sprite', 'EnvironmentMap'] as const
export type SceneAssetType = (typeof SCENE_ASSET_TYPES)[number]

/** Light types a scene document may contain. */
export const SCENE_LIGHT_TYPES = ['ambient', 'directional', 'point', 'spot', 'hemisphere'] as const
export type SceneLightType = (typeof SCENE_LIGHT_TYPES)[number]

/** Blockout shapes a scene document may contain. */
export const SCENE_PRIMITIVE_SHAPES = ['box', 'plane', 'sphere', 'cylinder', 'cone'] as const
export type ScenePrimitiveShape = (typeof SCENE_PRIMITIVE_SHAPES)[number]

/** Local axes an asset's front may point along. Y is excluded: facing is a rotation about it. */
export const SCENE_FRONT_AXES = ['+X', '-X', '+Z', '-Z'] as const
export type SceneFrontAxis = (typeof SCENE_FRONT_AXES)[number]

/** How far a scene has been taken, in order. Composition first, colour last - and the order is enforced, not advised. */
export const SCENE_STAGES = ['layout', 'detail', 'lit', 'dressed'] as const
export type SceneStage = (typeof SCENE_STAGES)[number]

/** Where a decision stands. Derived from the slot's candidates rather than stored beside them, so the two cannot disagree. */
export const SCENE_SLOT_STATUSES = ['proposed', 'chosen', 'rejected'] as const
export type SceneSlotStatus = (typeof SCENE_SLOT_STATUSES)[number]

/** Who settled a decision. The guardrail made visible: a scene never loses track of which choices a human actually made. */
export const SCENE_SLOT_RESOLVERS = ['user', 'agent'] as const
export type SceneSlotResolver = (typeof SCENE_SLOT_RESOLVERS)[number]

/** How a node is seated on the node it rests on. Decides the anchor offset a write records, and is not itself stored. */
export const SCENE_ANCHOR_ALIGNMENTS = ['center', 'keep'] as const
export type SceneAnchorAlignment = (typeof SCENE_ANCHOR_ALIGNMENTS)[number]

export interface SceneDocument {
  schemaVersion: number
  nodes: SceneNode[]
  lights: SceneLight[]
  environment?: SceneEnvironment | null
  stage?: SceneStage | null
  slots?: SceneSlot[]
  recommendationSummary?: string | null
}

export interface SceneAnchor {
  onNodeId: string
  offset?: Vec3 | null
}

export interface SceneAssetRef {
  assetType: SceneAssetType
  assetId: number
  versionId?: number | null
}

export interface SceneEnvironment {
  environmentMap?: SceneAssetRef | null
  background?: string | null
  exposureEv?: number | null
}

export interface SceneLight {
  id: string
  type: SceneLightType
  position: Vec3
  intensity: number
  color: string
  target?: Vec3 | null
  name?: string | null
}

export interface SceneMaterialBinding {
  textureSetId?: number | null
  variant?: string | null
  materialId?: number | null
  slot?: string | null
}

export interface SceneNode {
  id: string
  transform: SceneTransform
  asset?: SceneAssetRef | null
  primitive?: ScenePrimitive | null
  name?: string | null
  slotId?: string | null
  material?: SceneMaterialBinding | null
  materialSlots?: SceneMaterialBinding[]
  visible: boolean
  groundSnap?: boolean | null
  frontAxis?: SceneFrontAxis | null
  faceToward?: Vec3 | null
  anchor?: SceneAnchor | null
  suspended?: boolean | null
}

export interface ScenePrimitive {
  shape: ScenePrimitiveShape
  size?: Vec3 | null
}

export interface SceneSlot {
  id: string
  candidates: SceneSlotCandidate[]
  brief?: string | null
  chosenCandidateId?: string | null
  resolvedBy?: SceneSlotResolver | null
  reopenedReason?: string | null
  recommendedCandidateId?: string | null
}

export interface SceneSlotCandidate {
  id: string
  asset?: SceneAssetRef | null
  material?: SceneMaterialBinding | null
  rationale?: string | null
  label?: string | null
  rejectedReason?: string | null
  storeAsset?: SceneStoreAssetRef | null
}

export interface SceneStoreAssetRef {
  storeUrl: string
  storeAssetId: string
  title?: string | null
  thumbnailUrl?: string | null
  price?: number | null
  currency?: string | null
}

export interface SceneTransform {
  position: Vec3
  rotationEuler: Vec3
  scale: Vec3
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Limits the server validates against. Client-side checks must use these, not their own copies. */
export const SCENE_LIMITS = {
  maxNodes: 5000,
  maxLights: 200,
  maxIdLength: 128,
  minAbsScale: 0.0001,
  maxCoordinate: 1000000,
} as const

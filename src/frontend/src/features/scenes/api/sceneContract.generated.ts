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

export interface SceneDocument {
  schemaVersion: number
  nodes: SceneNode[]
  lights: SceneLight[]
  environment?: SceneEnvironment | null
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
}

export interface SceneNode {
  id: string
  transform: SceneTransform
  asset?: SceneAssetRef | null
  primitive?: ScenePrimitive | null
  name?: string | null
  slotId?: string | null
  material?: SceneMaterialBinding | null
  visible: boolean
}

export interface ScenePrimitive {
  shape: ScenePrimitiveShape
  size?: Vec3 | null
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

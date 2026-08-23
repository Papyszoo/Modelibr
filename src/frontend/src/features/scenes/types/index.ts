import type {
  SceneAnchor,
  SceneAssetRef,
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  ScenePrimitive,
  SceneSlot,
  SceneSlotCandidate,
  SceneSlotResolver,
  SceneSlotStatus,
  SceneStage,
  SceneStoreAssetRef,
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
  SceneSlot,
  SceneSlotCandidate,
  SceneSlotResolver,
  SceneSlotStatus,
  SceneStage,
  SceneStoreAssetRef,
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

export interface SceneResourceFile {
  fileId: number
  originalFileName: string
  format: string
  mimeType: string
  sizeBytes: number
  sha256Hash: string
}

export interface SceneResourceAuxiliary {
  fileId: number
  relativePath: string
  originalFileName: string
  sizeBytes: number
  sha256Hash: string
}

export interface SceneResourcePreview {
  kind: string
  file: SceneResourceFile
  triangleCount: number | null
  byteBudget: number
  triangleBudget: number
}

/** One independently cacheable answer from the batched scene resource resolver. */
export interface SceneResource {
  asset: SceneAssetRef
  resolved: boolean
  original: SceneResourceFile | null
  totalSizeBytes: number | null
  triangleCount: number | null
  materialCount: number | null
  auxiliaries: SceneResourceAuxiliary[]
  previews: SceneResourcePreview[]
  errorCode: string | null
  errorMessage: string | null
}

export interface SceneResourceManifest {
  resources: SceneResource[]
}

export interface SceneOverlap {
  nodeIdA: string
  nodeIdB: string
  intersectionVolume: number
  /** How they overlap: `resting`, `contained` or `intersecting`. */
  kind: 'resting' | 'contained' | 'intersecting'
  /**
   * Probably fine - resting contact, a declared anchor, or a graze small enough
   * to be an axis-aligned box larger than the rotated object inside it. A hint
   * for ranking, never a verdict.
   */
  likelyIntentional: boolean
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

/**
 * The measurable half of a proposal - what the library actually knows about the
 * asset behind a candidate card.
 *
 * Shown beside the rationale, never instead of it. A rationale on its own is a
 * plausible sentence about an asset nobody measured, and it is exactly what a
 * user cannot overrule: "reads as rundown" sounds right whether the asset is a
 * lamp post or a twelve-object test scene with two lights in it.
 *
 * Null on the candidate when nothing is known - which is itself worth showing,
 * rather than a card of empty dashes that reads as a rendering bug.
 */
export interface SceneCandidateFacts {
  name: string | null
  dimensions: Vec3 | null
  partCount: number | null
  materialCount: number | null
  qualityFlags: string[] | null
  cameras: number
  lights: number
}

/** One proposal for a slot, as the user reads it on a card. */
export interface SceneSlotCandidateView {
  id: string
  /** The name a user says out loud - `streetlight/B`. Assembled server-side so nothing spells it differently. */
  ref: string
  label: string | null
  asset: SceneAssetRef | null
  material: SceneMaterialBinding | null
  rationale: string | null
  chosen: boolean
  rejected: boolean
  /** Why it was ruled out. Kept and shown, because a rejection is feedback rather than a deletion. */
  rejectedReason: string | null
  facts: SceneCandidateFacts | null
  /** Set when the proposal is something the library does not hold yet. Never set alongside `asset`. */
  storeAsset: SceneStoreAssetRef | null
  /**
   * Whether this candidate can settle the slot as it stands. False for a store
   * proposal - choosing it means acquiring it first, which is a different act.
   */
  choosable: boolean
  /** What the card can draw. Null when there is nothing to draw. */
  media: SceneCandidateMedia | null
  /**
   * The agent advises this one. Never implies `chosen`: recommended-and-not-chosen,
   * chosen-and-not-recommended and both are three different things to a user deciding
   * whether their pick followed the advice or overruled it.
   */
  recommended: boolean
}

/** Where a thumbnail stands. A missing one is a normal state, not a broken image. */
export type SceneCandidateMediaStatus = 'ready' | 'pending' | 'none' | 'unknown'

/**
 * The picture on a choice card, resolved server-side for the whole scene at once.
 *
 * An asset and a material can both be present: the asset is the primary image and the
 * material sits beside it. A surface-only candidate has only the material half.
 */
export interface SceneCandidateMedia {
  /** API-relative. Null unless `assetThumbnailStatus` is `ready`. */
  assetThumbnailUrl: string | null
  assetThumbnailStatus: SceneCandidateMediaStatus
  /** A global material's rendered swatch, when it has one. */
  materialThumbnailUrl: string | null
  /** A parameter-only material's scalars, for the CSS swatch. */
  materialSwatch: SceneMaterialSwatch | null
  /** Absolute, and copied into the scene: the card must draw with the store down. */
  storeThumbnailUrl: string | null
}

/** The four scalars MaterialSwatch approximates a surface from. */
export interface SceneMaterialSwatch {
  baseColorHex: string
  roughness: number
  metallic: number
  opacity: number
}

/** One decision in the scene, its proposals, and where it stands. */
export interface SceneSlotView {
  slotId: string
  /** The node this slot decides. Exactly one node carries the slot id. */
  nodeId: string | null
  brief: string | null
  status: SceneSlotStatus
  chosenCandidateId: string | null
  /** Whether a person or an agent settled it - the guardrail, made visible. */
  resolvedBy: SceneSlotResolver | null
  /** The user's reason for throwing out a whole round: "none of these, all too modern". */
  reopenedReason: string | null
  candidates: SceneSlotCandidateView[]
  /** What the agent advises for this slot. Advice, never a decision. */
  recommendedCandidateId: string | null
  /**
   * Whether a bulk accept may act on this slot's recommendation: it exists, the slot is
   * unresolved, and the candidate is neither rejected nor a store proposal. Server-derived
   * so the panel and the endpoint cannot disagree about which slots "Accept N" covers.
   */
  recommendationAcceptable: boolean
}

export interface SceneSlotsView {
  scene: SceneSummary
  slots: SceneSlotView[]
  /** The agent's authored line about the recommended set as a whole. Shown verbatim. */
  recommendationSummary: string | null
}

/** One slot/candidate pair, as sent to the bulk-accept endpoint. */
export interface SceneRecommendationChoice {
  slotId: string
  candidateId: string
}

/** What the bulk accept returns: the scene's new revision and the slots it settled. */
export interface SceneRecommendationsResponse {
  scene: SceneSummary
  slots: SceneSlotView[]
  summary: string | null
}

/** What a slot write returns: the scene's new revision, and the slot as it now stands. */
export interface SceneSlotWriteResponse {
  scene: SceneSummary
  slot: SceneSlotView
}

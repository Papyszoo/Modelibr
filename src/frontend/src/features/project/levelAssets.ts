/**
 * What a Level's Scenes place - the derivation behind the studio's level asset
 * view (v0.7).
 *
 * A Level has no asset pins. Its assets are whatever the Scenes linked to it
 * place, which means this module never stores anything: it reads the scene
 * documents the scene editor reads and reports what it found together with the
 * Scene each reference came from. A user looking at a level must be able to tell
 * "this model is here because a scene places it" from "this model is a member of
 * the project" - so provenance is carried on every row rather than implied by a
 * group heading.
 *
 * Node ASSETS only. A node's `material` binding (a texture set or global
 * material) and the scene's `environment.environmentMap` are placement facts of
 * the same kind, and are not derived yet - named here so the gap is a decision
 * on record rather than an oversight.
 */
import type { SceneAssetType } from '@/features/scenes/api/sceneContract.generated'
import type {
  SceneAssetRef,
  SceneDocument,
  SceneSummary,
} from '@/features/scenes/types'

/**
 * The scene list entry, which carries its level ownership.
 *
 * An alias, not a widening: `/scenes` answers with the server's `SceneSummary`,
 * `projectLevelId` / `isPrimaryLevelScene` / `projectLevelName` included, and
 * naming the type here keeps the level reads in this module honest about which
 * fields they rely on.
 */
export type LevelScopedSceneSummary = SceneSummary

/** A Scene that belongs to one Level, before its document has been read. */
export interface LevelSceneRef {
  id: number
  name: string
  isPrimary: boolean
}

/** A Level Scene plus the document that says what it places. */
export interface LevelSceneDocument extends LevelSceneRef {
  document: SceneDocument | null
}

/** Where one placement of an asset came from. */
export interface LevelSceneAssetPlacement {
  sceneId: number
  sceneName: string
  isPrimaryScene: boolean
  nodeIds: string[]
  nodeNames: string[]
}

/** One asset a Level's Scenes place, with every Scene that places it. */
export interface LevelSceneAsset {
  /** `Model:12` - stable across renames, and what the row is keyed by. */
  key: string
  assetType: SceneAssetType
  assetId: number
  /**
   * The version the first placement pinned, when the document names one. Two
   * placements of one asset in different versions are still one row - the asset
   * is what the level uses - so this is the first one, not a claim they agree.
   */
  versionId: number | null
  /**
   * What to call it: the library's own name when the project's member list knows
   * it, otherwise what the scene author called the node, otherwise a plain
   * `Model #12` - which says the reference could not be resolved rather than
   * inventing a name.
   */
  label: string
  /**
   * True when the label came from the project's explicit member list. The member
   * list is the only source that can name a reference, so a resolved name IS
   * membership - which is what makes it safe to also show it in the member group.
   */
  isProjectMember: boolean
  /** In scene order, primary scene first; a row lists one entry per Scene. */
  placements: LevelSceneAssetPlacement[]
}

export function levelSceneAssetKey(asset: {
  assetType: SceneAssetType
  assetId: number
}): string {
  return `${asset.assetType}:${asset.assetId}`
}

/**
 * The Scenes that belong to one Level of one Project.
 *
 * Both halves of the check are load-bearing. A scene carries the project it
 * belongs to and the level it was filed under, and a level id is only unique
 * within its project - so filtering on the level alone would show one project's
 * level another project's scene.
 *
 * Primary first, then by name: the primary Scene is the one the Level is
 * implemented by, and the rest are a set rather than an order.
 */
export function selectLevelScenes(
  scenes: LevelScopedSceneSummary[],
  projectId: number,
  levelId: number
): LevelSceneRef[] {
  return scenes
    .filter(
      scene => scene.projectId === projectId && scene.projectLevelId === levelId
    )
    .sort((left, right) => {
      if (left.isPrimaryLevelScene !== right.isPrimaryLevelScene) {
        return left.isPrimaryLevelScene ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
    .map(scene => ({
      id: scene.id,
      name: scene.name,
      isPrimary: scene.isPrimaryLevelScene === true,
    }))
}

/**
 * Deduplicates the assets the Level's Scenes place, keeping every Scene each one
 * came from.
 *
 * Two Scenes placing the same model is the normal case, not a duplicate to hide:
 * it is the fact that answers "where is this used?". Order is first appearance in
 * the order `selectLevelScenes` returned, so the list follows how the level is
 * actually built rather than an alphabetical shuffle.
 */
export function deriveLevelSceneAssets(
  scenes: LevelSceneDocument[],
  options: {
    /**
     * The project's explicit member list naming a reference, or null. Kept as a
     * callback so this module needs no project data of its own and stays a pure
     * read of the scene documents.
     */
    resolveProjectMemberName?: (asset: SceneAssetRef) => string | null
  } = {}
): LevelSceneAsset[] {
  const byKey = new Map<string, LevelSceneAsset>()
  const placementsByKey = new Map<
    string,
    Map<number, LevelSceneAssetPlacement>
  >()

  for (const scene of scenes) {
    for (const node of scene.document?.nodes ?? []) {
      if (!node.asset) continue

      const key = levelSceneAssetKey(node.asset)
      let asset = byKey.get(key)
      if (!asset) {
        const name = options.resolveProjectMemberName?.(node.asset) ?? null
        asset = {
          key,
          assetType: node.asset.assetType,
          assetId: node.asset.assetId,
          versionId: node.asset.versionId ?? null,
          label: name ?? node.name?.trim() ?? '',
          isProjectMember: name !== null,
          placements: [],
        }
        byKey.set(key, asset)
        placementsByKey.set(key, new Map())
      }

      const scenePlacements = placementsByKey.get(key)!
      const existing = scenePlacements.get(scene.id)
      if (existing) {
        existing.nodeIds.push(node.id)
        if (node.name) existing.nodeNames.push(node.name)
        continue
      }

      scenePlacements.set(scene.id, {
        sceneId: scene.id,
        sceneName: scene.name,
        isPrimaryScene: scene.isPrimary,
        nodeIds: [node.id],
        nodeNames: node.name ? [node.name] : [],
      })
    }
  }

  return [...byKey.values()].map(asset => {
    asset.placements = [...(placementsByKey.get(asset.key)?.values() ?? [])]
    if (!asset.label) {
      asset.label = `${asset.assetType} #${asset.assetId}`
    }
    return asset
  })
}

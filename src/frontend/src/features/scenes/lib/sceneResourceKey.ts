import type { SceneAssetRef } from '../types'

/** Stable cache/scheduler identity for one pinned or unversioned scene resource. */
export function sceneResourceKey(asset: SceneAssetRef): string {
  return `${asset.assetType}:${asset.assetId}:${asset.versionId ?? '-'}`
}

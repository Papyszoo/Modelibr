import { client } from '@/lib/apiBase'

import {
  measureSceneAsync,
  scenePerformanceMeasures,
} from '../lib/scenePerformance'
import type {
  SceneAssetFacts,
  SceneAssetRef,
  SceneDocument,
  SceneRecommendationChoice,
  SceneRecommendationsResponse,
  SceneSlotsView,
  SceneSlotWriteResponse,
  SceneSummary,
  SceneView,
} from '../types'

export async function getScenes(): Promise<SceneSummary[]> {
  const response = await client.get<{ scenes: SceneSummary[] }>('/scenes')
  return response.data.scenes
}

export async function getSceneById(sceneId: number): Promise<SceneView> {
  const response = await measureSceneAsync(
    scenePerformanceMeasures.documentRequest,
    () => client.get<SceneView>(`/scenes/${sceneId}`)
  )
  return response.data
}

export async function createScene(input: {
  name: string
  description?: string
}): Promise<SceneView> {
  const response = await client.post<SceneView>('/scenes', input)
  return response.data
}

export async function renameScene(
  sceneId: number,
  input: { name: string; description?: string }
): Promise<SceneSummary> {
  const response = await client.put<SceneSummary>(`/scenes/${sceneId}`, input)
  return response.data
}

export async function deleteScene(sceneId: number): Promise<void> {
  await client.delete(`/scenes/${sceneId}`)
}

/**
 * Saves the whole document.
 *
 * `expectedRevision` is what makes a save refuse rather than silently overwrite
 * a scene an agent has edited since this editor loaded it - the server answers
 * `Scene.RevisionConflict` and the editor asks the user what to do.
 */
export async function updateSceneDocument(
  sceneId: number,
  document: SceneDocument,
  expectedRevision?: number
): Promise<SceneView> {
  const response = await client.put<SceneView>(`/scenes/${sceneId}/document`, {
    documentJson: JSON.stringify(document),
    expectedRevision,
  })
  return response.data
}

/**
 * Size, origin convention and resting height for an asset the user is about to
 * place. The server computes the resting height with the same code the write
 * path uses, so the editor never has to reimplement where an asset's feet are.
 */
export async function getSceneAssetFacts(
  asset: SceneAssetRef
): Promise<SceneAssetFacts> {
  const params = new URLSearchParams({
    assetType: asset.assetType,
    assetId: String(asset.assetId),
  })
  if (asset.versionId != null) {
    params.append('versionId', String(asset.versionId))
  }

  const response = await client.get<SceneAssetFacts>(
    `/scenes/asset-facts?${params.toString()}`
  )
  return response.data
}

/**
 * The scene's open decisions and every proposal made for them.
 *
 * Read separately from the scene itself on purpose. The document carries the
 * slots, but resolving what the library knows about each *candidate* walks the
 * part list of assets that are not in the scene - a cost worth paying when
 * someone opens the choices panel and not on every read of every scene.
 */
export async function getSceneSlots(sceneId: number): Promise<SceneSlotsView> {
  const response = await client.get<SceneSlotsView>(`/scenes/${sceneId}/slots`)
  return response.data
}

/**
 * Settles a slot on one candidate, or reopens it.
 *
 * The server records this as resolved by the *user* and does not take that from
 * the request - this endpoint is only reached by a person clicking, and letting
 * the body claim otherwise would make the one attribution the model exists to
 * keep a caller-supplied string.
 */
export async function resolveSceneSlot(
  sceneId: number,
  slotId: string,
  input: { candidateId?: string; clear?: boolean; expectedRevision?: number }
): Promise<SceneSlotWriteResponse> {
  const response = await client.put<SceneSlotWriteResponse>(
    `/scenes/${sceneId}/slots/${encodeURIComponent(slotId)}/choice`,
    input
  )
  return response.data
}

/**
 * Settles several slots on their recommended candidates, in one write.
 *
 * Deliberately not a loop over `resolveSceneSlot`: each of those moves the scene's
 * revision, so a conflict partway through would leave "Accept all" a lie - some
 * slots settled, some not, and no single revision to report. The pairs the user
 * confirmed are sent back so a recommendation that changed between rendering and
 * clicking fails the whole call rather than settling something nobody saw.
 */
export async function acceptSceneRecommendations(
  sceneId: number,
  input: {
    choices: SceneRecommendationChoice[]
    expectedRevision?: number
  }
): Promise<SceneRecommendationsResponse> {
  const response = await client.put<SceneRecommendationsResponse>(
    `/scenes/${sceneId}/slots/recommendations/accept`,
    input
  )
  return response.data
}

/**
 * Rules candidates out with a reason, or - with `all` - throws out the whole
 * round and reopens the slot. Rejections are kept and shown greyed, which is
 * what stops the agent re-offering what was just turned down.
 */
export async function rejectSceneCandidates(
  sceneId: number,
  slotId: string,
  input: {
    reason: string
    candidateIds?: string[]
    all?: boolean
    expectedRevision?: number
  }
): Promise<SceneSlotWriteResponse> {
  const response = await client.post<SceneSlotWriteResponse>(
    `/scenes/${sceneId}/slots/${encodeURIComponent(slotId)}/rejections`,
    input
  )
  return response.data
}

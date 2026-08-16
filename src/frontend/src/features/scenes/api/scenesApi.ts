import { client } from '@/lib/apiBase'

import type {
  SceneAssetFacts,
  SceneAssetRef,
  SceneDocument,
  SceneSummary,
  SceneView,
} from '../types'

export async function getScenes(): Promise<SceneSummary[]> {
  const response = await client.get<{ scenes: SceneSummary[] }>('/scenes')
  return response.data.scenes
}

export async function getSceneById(sceneId: number): Promise<SceneView> {
  const response = await client.get<SceneView>(`/scenes/${sceneId}`)
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

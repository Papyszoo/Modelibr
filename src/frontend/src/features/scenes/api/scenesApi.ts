import { baseURL, client } from '@/lib/apiBase'

import type { SceneDocument, SceneSummary, SceneView } from '../types'

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
 * The renderable file for a version-pinned node.
 *
 * Pinned on purpose: a scene node references one version, so it must load that
 * version's mesh and not whatever the model's current one happens to be.
 */
export function getSceneNodeFileUrl(
  assetId: number,
  versionId: number
): string {
  return `${baseURL}/models/${assetId}/versions/${versionId}/file`
}

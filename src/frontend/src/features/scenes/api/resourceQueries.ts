import { queryOptions } from '@tanstack/react-query'

import { sceneResourceKey } from '../lib/sceneResourceKey'
import type { SceneAssetRef } from '../types'
import { getSceneResource } from './sceneResourcesApi'

export function getSceneResourceQueryOptions(asset: SceneAssetRef) {
  return queryOptions({
    queryKey: ['scene-resources', sceneResourceKey(asset)] as const,
    queryFn: () => getSceneResource(asset),
    staleTime: 5 * 60 * 1000,
  })
}
